import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Chat } from '@google/genai';
import ChatArea from './components/ChatArea';
import ToolSidebar from './components/ToolSidebar';
import ImageViewer from './components/ImageViewer';
import { Message, Sender, ToolLog, BoundingBox, ModelStatus } from './types';
import { createChatSession, processImage, runDinoV3, runOCR } from './services/geminiService';
import { initVisionModel, getModelStatus } from './services/visionService';
import { initOCR } from './services/ocrService';

const App: React.FC = () => {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageBase64, setCurrentImageBase64] = useState<{data: string, mime: string} | null>(null);
  const [detections, setDetections] = useState<BoundingBox[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  
  const chatSessionRef = useRef<Chat | null>(null);

  // Initialize Chat Session & Preload Models
  useEffect(() => {
    const loadModels = async () => {
        try {
            setModelStatus('loading');
            
            // Start both in parallel
            const p1 = initVisionModel();
            const p2 = initOCR();

            await Promise.all([p1, p2]);
            
            setModelStatus('ready');
        } catch (e) {
            console.error("Model initialization failed", e);
            // Reset to idle/error state but don't crash app
            setModelStatus('idle');
        }
    };
    
    loadModels();

    chatSessionRef.current = createChatSession(
      "You are the Visionary Orchestrator. You are an AI Agent that coordinates specialized machine vision models.\n" +
      "Important: You are NOT the vision model. You are the manager.\n" +
      "To see detection data, you MUST call `dino_v3_detect`.\n" +
      "To read text, you MUST call `ocr_engine`.\n" +
      "The `dino_v3_detect` tool uses a local DETR (Transformer) model. It detects common objects (person, car, dog, bottle, etc).\n" +
      "The `ocr_engine` uses Tesseract.js to read text.\n" +
      "Do not guess what is in the image. Use your tools."
    );
  }, []);

  const retryModelLoad = async () => {
      setModelStatus('loading');
      try {
          await initVisionModel();
          setModelStatus('ready');
      } catch (e) {
          console.error("Retry failed", e);
          setModelStatus('idle');
      }
  };

  // --- Handlers ---

  const handleImageUpload = async (file: File) => {
    try {
        const { base64, mimeType } = await processImage(file);
        const url = URL.createObjectURL(file);

        setCurrentImage(url);
        setCurrentImageBase64({ data: base64, mime: mimeType });
        setDetections([]); 
        setMessages(prev => [...prev, {
            id: uuidv4(),
            sender: Sender.System,
            text: `Image uploaded: ${file.name}`,
            timestamp: new Date()
        }]);
    } catch (error) {
        console.error("File upload error", error);
        setMessages(prev => [...prev, {
            id: uuidv4(),
            sender: Sender.System,
            text: `Error processing image: ${error}`,
            timestamp: new Date()
        }]);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!chatSessionRef.current) return;

    // 1. Add User Message
    const userMsg: Message = {
      id: uuidv4(),
      sender: Sender.User,
      text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsAnalyzing(true);

    try {
      // 2. Prepare payload
      let response;
      if (currentImageBase64) {
          response = await chatSessionRef.current.sendMessage({
              message: [
                  { inlineData: { data: currentImageBase64.data, mimeType: currentImageBase64.mime } },
                  { text: text }
              ]
          });
      } else {
          response = await chatSessionRef.current.sendMessage({ message: text });
      }

      // 3. Handle Tool Calls Loop
      let functionCalls = response.functionCalls;
      
      while (functionCalls && functionCalls.length > 0) {
        const functionResponses = [];
        const newDetections: BoundingBox[] = [];

        for (const fc of functionCalls) {
            const toolLogId = uuidv4();
            const argsStr = JSON.stringify(fc.args);
            
            setToolLogs(prev => [...prev, {
                id: toolLogId,
                toolName: fc.name,
                status: 'pending',
                args: argsStr,
                timestamp: new Date()
            }]);

            let toolResult: any;
            
            if (!currentImage) {
                toolResult = { error: "No image context available for vision tool." };
            } else {
                if (fc.name === 'dino_v3_detect') {
                    // Update Status Check
                    if (getModelStatus() !== 'ready') {
                         setMessages(prev => [...prev, {
                            id: uuidv4(),
                            sender: Sender.System,
                            text: "Initializing Detection Model (Downloading weights ~40MB)...",
                            timestamp: new Date()
                        }]);
                    }

                    const targetObjects = (fc.args as any).target_objects;
                    // PASS THE IMAGE URL directly to the local model service
                    const boxes = await runDinoV3(currentImage, targetObjects);
                    
                    newDetections.push(...boxes);
                    toolResult = { 
                        status: "success", 
                        backend: "Transformers.js (Local DETR-ResNet-50)",
                        found_count: boxes.length, 
                        objects: boxes.map(b => `${b.label} (${(b.confidence! * 100).toFixed(0)}%) at [${b.xmin.toFixed(0)},${b.ymin.toFixed(0)}]`) 
                    };
                } else if (fc.name === 'ocr_engine') {
                     // Pass base64/URL for OCR
                     if (currentImageBase64) {
                        const boxes = await runOCR(currentImageBase64.data, currentImageBase64.mime);
                        newDetections.push(...boxes);
                        toolResult = {
                            status: "success",
                            backend: "Gemini 2.5 Flash Vision",
                            text_blocks_found: boxes.length,
                            content: boxes.map(b => `"${b.label}"`).join(' | ')
                        };
                     } else {
                        toolResult = { error: "Image data unavailable for OCR" };
                     }
                }
            }

            setToolLogs(prev => prev.map(log => 
                log.id === toolLogId ? { ...log, status: 'success', result: JSON.stringify(toolResult) } : log
            ));

            functionResponses.push({
                functionResponse: {
                    name: fc.name,
                    response: { result: toolResult }
                }
            });
        }

        if (newDetections.length > 0) {
            setDetections(prev => [...prev, ...newDetections]);
        }

        response = await chatSessionRef.current.sendMessage({
            message: functionResponses
        });
        
        functionCalls = response.functionCalls;
      }

      // 4. Final Response
      const modelText = response.text;
      if (modelText) {
          setMessages(prev => [...prev, {
              id: uuidv4(),
              sender: Sender.Model,
              text: modelText,
              timestamp: new Date()
          }]);
      }

    } catch (error) {
      console.error("Chat Error", error);
      setMessages(prev => [...prev, {
          id: uuidv4(),
          sender: Sender.System,
          text: "Agent Error: " + (error instanceof Error ? error.message : String(error)),
          timestamp: new Date()
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
                V
            </div>
            <h1 className="font-bold text-lg tracking-tight">Visionary <span className="text-slate-500 font-normal text-sm">| MCP Orchestrator</span></h1>
        </div>
        <div className="flex gap-4 text-[10px] font-mono text-slate-500 items-center">
            <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${modelStatus === 'ready' ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : modelStatus === 'loading' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
                {modelStatus === 'loading' ? 'Loading Local Models...' : modelStatus === 'ready' ? 'Models Active' : (
                    <button onClick={retryModelLoad} className="hover:text-cyan-400 underline">Models Offline (Retry)</button>
                )}
            </div>
            <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                Tesseract.js & DETR
            </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Chat Interface */}
        <div className="flex-1 flex flex-col min-w-0 order-2 md:order-1">
            <ChatArea 
                messages={messages} 
                onSendMessage={handleSendMessage}
                isAnalyzing={isAnalyzing}
                onImageUpload={handleImageUpload}
                hasImage={!!currentImage}
            />
        </div>

        {/* Visual Tools Panel */}
        <div className="w-full md:w-[450px] lg:w-[500px] flex flex-col border-l border-slate-800 bg-slate-925 order-1 md:order-2 shrink-0">
            <div className="h-[40vh] md:h-1/2 flex flex-col">
                <div className="p-2 bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider pl-4 flex justify-between">
                    <span>Visual Context</span>
                    <span className="text-xs text-slate-600 font-mono normal-case">Live Feed</span>
                </div>
                <div className="flex-1 overflow-hidden relative bg-black">
                     <ImageViewer 
                        imageSrc={currentImage} 
                        detections={detections}
                        isAnalyzing={isAnalyzing}
                     />
                </div>
            </div>

            <div className="flex-1 h-[40vh] md:h-1/2 min-h-0 border-t border-slate-800">
                <ToolSidebar logs={toolLogs} />
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;