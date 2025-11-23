import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Chat } from '@google/genai';
import ChatArea from './components/ChatArea';
import ToolSidebar from './components/ToolSidebar';
import ImageViewer from './components/ImageViewer';
import { Message, Sender, ToolLog, BoundingBox } from './types';
import { createChatSession, processImage, runDinoV3, runOCR } from './services/geminiService';

const App: React.FC = () => {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageBase64, setCurrentImageBase64] = useState<{data: string, mime: string} | null>(null);
  const [detections, setDetections] = useState<BoundingBox[]>([]);
  
  const chatSessionRef = useRef<Chat | null>(null);

  // Initialize Chat Session (The Orchestrator)
  useEffect(() => {
    chatSessionRef.current = createChatSession(
      "You are the Visionary Orchestrator, an AI Agent designed to coordinate specialized machine vision models. " +
      "You DO NOT have eyes. To see the world, you must use your tools:\n" +
      "1. `dino_v3_detect`: Uses the powerful DinoV3 model for object detection and counting.\n" +
      "2. `ocr_engine`: Uses a dedicated OCR model to read text.\n" +
      "Always verify visually by calling a tool before answering questions about the image content. " +
      "When tools return JSON data, synthesize it into a natural, helpful response for the user."
    );
  }, []);

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
      // Note: We send the image to the Orchestrator as context, but prompt implies it should use tools for specific tasks.
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

      // 3. Handle Tool Calls Loop (The MCP Flow)
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
            
            if (!currentImageBase64) {
                toolResult = { error: "No image context available for vision tool." };
            } else {
                // Route to Specialized Models
                if (fc.name === 'dino_v3_detect') {
                    const targetObjects = (fc.args as any).target_objects;
                    const boxes = await runDinoV3(
                        currentImageBase64.data, 
                        currentImageBase64.mime,
                        targetObjects
                    );
                    newDetections.push(...boxes);
                    toolResult = { 
                        status: "success", 
                        model: "DinoV3-Large",
                        found_count: boxes.length, 
                        objects: boxes.map(b => `${b.label} at [${b.ymin.toFixed(2)}, ${b.xmin.toFixed(2)}]`) 
                    };
                } else if (fc.name === 'ocr_engine') {
                    const boxes = await runOCR(
                        currentImageBase64.data,
                        currentImageBase64.mime
                    );
                    newDetections.push(...boxes);
                    toolResult = {
                        status: "success",
                        model: "Tesseract-Ensemble",
                        text_blocks_found: boxes.length,
                        content: boxes.map(b => `"${b.label}" at [${b.ymin.toFixed(2)}, ${b.xmin.toFixed(2)}]`).join(' | ')
                    };
                } else {
                    toolResult = { error: `Tool ${fc.name} not found in registry.` };
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
            setDetections(newDetections);
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
          text: "Communication error with agent swarm.",
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
        <div className="flex gap-4 text-[10px] font-mono text-slate-500">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>DinoV3 Active</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>OCR Engine Active</span>
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