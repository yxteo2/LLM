import React, { useEffect, useRef, useState } from 'react';
import { Message, Sender } from '../types';

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isAnalyzing: boolean;
  onImageUpload: (file: File) => void;
  hasImage: boolean;
}

const ChatArea: React.FC<ChatAreaProps> = ({ messages, onSendMessage, isAnalyzing, onImageUpload, hasImage }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAnalyzing) return;
    onSendMessage(input);
    setInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 relative">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
             <h1 className="text-3xl font-bold text-slate-200">Visionary</h1>
             <p className="max-w-md text-center">
               I am an MCP-enabled Vision Agent. Upload an image and ask me to <span className="text-cyan-400">"detect objects"</span>, <span className="text-cyan-400">"count items"</span>, or analyze the scene.
             </p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === Sender.User ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[85%] rounded-2xl px-5 py-3.5 leading-relaxed text-sm md:text-base ${
                msg.sender === Sender.User 
                  ? 'bg-indigo-600 text-white rounded-br-none' 
                  : msg.sender === Sender.System 
                    ? 'bg-transparent text-slate-500 italic text-xs w-full text-center border-t border-b border-slate-900 py-1'
                    : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              {msg.sender !== Sender.System && (
                  <div className={`text-[10px] mt-1 opacity-50 ${msg.sender === Sender.User ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {msg.sender === Sender.Model ? 'Gemini 2.5' : 'You'}
                  </div>
              )}
            </div>
          </div>
        ))}
        {isAnalyzing && (
            <div className="flex justify-start">
                 <div className="bg-slate-800/50 rounded-2xl rounded-bl-none px-4 py-2 flex items-center gap-2">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"></div>
                    </div>
                 </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700"
            title="Upload Image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleFileChange}
            />
          </button>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hasImage ? "Ask about the image..." : "Upload an image to start..."}
              disabled={isAnalyzing}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder-slate-600"
            />
             <button
                type="submit"
                disabled={!input.trim() || isAnalyzing}
                className="absolute right-2 top-2 p-1.5 rounded-lg text-cyan-500 hover:bg-cyan-500/10 disabled:opacity-50 disabled:hover:bg-transparent transition-all"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
