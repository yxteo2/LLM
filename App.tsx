import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Chat, Part, ToolCallPart, FunctionCall } from '@google/genai';
import ChatArea from './components/ChatArea';
import ToolSidebar from './components/ToolSidebar';
import ImageViewer from './components/ImageViewer';
import { Message, Sender, ToolLog, BoundingBox } from './types';
import { createChatSession, convertBlobToBase64, executeObjectDetection } from './services/geminiService';

const App: React.FC = () => {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageBase64, setCurrentImageBase64] = useState<{data: string, mime: string} | null>(null);
  const [detections, setDetections] = useState<BoundingBox[]>([]);
  
  const chatSessionRef = useRef<Chat | null>(null);

  // Initialize Chat Session
  useEffect(() => {
    chatSessionRef.current = createChatSession(
      "You are a helpful visual assistant equipped with machine vision tools. " +
      "If the user asks to find, count, or locate objects, use the 'detect_objects' tool. " +
      "When the tool returns data, summarize what you see naturally. " +
      "Do NOT invent coordinates yourself; rely on the tool."
    );
  }, []);

  // --- Handlers ---

  const handleImageUpload = async (file: File) => {
    try {
        const base64 = await convertBlobToBase64(file);
        const mime = file.type;
        const url = URL.createObjectURL(file);

        setCurrentImage(url);
        setCurrentImageBase64({ data: base64, mime });
        setDetections([]); // Clear previous detections
        setMessages(prev => [...prev, {
            id: uuidv4(),
            sender: Sender.System,
            text: `Image uploaded: ${file.name}`,
            timestamp: new Date()
        }]);

        // Reset chat history for new image context (Optional, but usually cleaner for single-image vision tasks)
        // For now, we keep history but system prompt implies current image focus.
    } catch (error) {
        console.error("File upload error", error);
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
      // If we have an image, we should probably send it in the turn if it's new, 
      // or just rely on the tool execution to use the "current" image state.
      // However, Gemini Chat needs the image in the history to "talk" about it generally.
      // We will send the image data + text in this turn.
      
      let response;
      
      if (currentImageBase64) {
          // Sending image + text
          response = await chatSessionRef.current.sendMessage({
              message: [
                  { inlineData: { data: currentImageBase64.data, mimeType: currentImageBase64.mime } },
                  { text: text }
              ]
          });
      } else {
          // Just text
          response = await chatSessionRef.current.sendMessage({ message: text });
      }

      // 3. Handle Tool Calls Loop
      let functionCalls = response.functionCalls;
      
      // While the model wants to call tools...
      while (functionCalls && functionCalls.length > 0) {
        const fc = functionCalls[0]; // Handle first call (simplification)
        const toolLogId = uuidv4();
        
        // Log Tool Start
        const argsStr = JSON.stringify(fc.args);
        setToolLogs(prev => [...prev, {
            id: toolLogId,
            toolName: fc.name,
            status: 'pending',
            args: argsStr,
            timestamp: new Date()
        }]);

        // Execute Tool
        let toolResult: any;
        if (fc.name === 'detect_objects') {
            if (!currentImageBase64) {
                toolResult = { error: "No image available to analyze." };
            } else {
                // Execute actual vision task
                const targetObjects = (fc.args as any).target_objects;
                const boxes = await executeObjectDetection(
                    currentImageBase64.data, 
                    currentImageBase64.mime,
                    targetObjects
                );
                
                setDetections(boxes); // Update UI Overlay
                toolResult = { 
                    status: "success", 
                    found_count: boxes.length, 
                    objects: boxes.map(b => `${b.label} at [${b.ymin.toFixed(2)}, ${b.xmin.toFixed(2)}]`) 
                };
            }
        } else {
            toolResult = { error: "Unknown tool" };
        }

        // Log Tool Success
        setToolLogs(prev => prev.map(log => 
            log.id === toolLogId ? { ...log, status: 'success', result: JSON.stringify(toolResult) } : log
        ));

        // Send Tool Response back to model
        response = await chatSessionRef.current.sendMessage({
            message: [{
                functionResponse: {
                    name: fc.name,
                    response: { result: toolResult }
                }
            }]
        });
        
        // Check if model wants to call more tools
        functionCalls = response.functionCalls;
      }

      // 4. Final Text Response
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
          text: "Error communicating with the agent. Please try again.",
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/20">
                V
            </div>
            <h1 className="font-bold text-lg tracking-tight">Visionary <span className="text-slate-500 font-normal text-sm">| MCP Agent</span></h1>
        </div>
        <div className="text-xs text-slate-500 font-mono">
            Powered by Gemini 2.5 Flash
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left: Chat */}
        <div className="flex-1 flex flex-col min-w-0 order-2 md:order-1">
            <ChatArea 
                messages={messages} 
                onSendMessage={handleSendMessage}
                isAnalyzing={isAnalyzing}
                onImageUpload={handleImageUpload}
                hasImage={!!currentImage}
            />
        </div>

        {/* Right: Visual Context & Tools */}
        <div className="w-full md:w-[450px] lg:w-[500px] flex flex-col border-l border-slate-800 bg-slate-925 order-1 md:order-2 shrink-0">
            {/* Top Half: Image Viewer */}
            <div className="h-[40vh] md:h-1/2 flex flex-col">
                <div className="p-2 bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider pl-4">
                    Visual Context
                </div>
                <div className="flex-1 overflow-hidden relative bg-black">
                     <ImageViewer 
                        imageSrc={currentImage} 
                        detections={detections}
                        isAnalyzing={isAnalyzing}
                     />
                </div>
            </div>

            {/* Bottom Half: Tool Logs */}
            <div className="flex-1 h-[40vh] md:h-1/2 min-h-0 border-t border-slate-800">
                <ToolSidebar logs={toolLogs} />
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;