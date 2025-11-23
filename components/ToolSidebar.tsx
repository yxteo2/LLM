import React, { useEffect, useRef } from 'react';
import { ToolLog } from '../types';

interface ToolSidebarProps {
  logs: ToolLog[];
}

const ToolSidebar: React.FC<ToolSidebarProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="w-full md:w-80 border-r border-slate-800 bg-slate-900 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-800 bg-slate-950">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          MCP Tool Logs
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        {logs.length === 0 && (
          <div className="text-slate-600 text-center italic mt-10">
            No tool activity recorded.
          </div>
        )}
        
        {logs.map((log) => (
          <div key={log.id} className="border border-slate-800 rounded bg-slate-950/50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
              <span className="text-cyan-400 font-bold">{log.toolName}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                log.status === 'success' ? 'bg-green-500/10 text-green-400' :
                log.status === 'error' ? 'bg-red-500/10 text-red-400' :
                'bg-yellow-500/10 text-yellow-400'
              }`}>
                {log.status}
              </span>
            </div>
            <div className="p-3 space-y-2">
              <div>
                <div className="text-slate-500 mb-1">Args:</div>
                <div className="text-slate-300 break-all bg-slate-900 p-2 rounded">
                  {log.args}
                </div>
              </div>
              {log.result && (
                <div>
                  <div className="text-slate-500 mb-1">Result:</div>
                  <div className="text-slate-400 break-all bg-slate-900 p-2 rounded max-h-32 overflow-y-auto">
                    {log.result}
                  </div>
                </div>
              )}
              <div className="text-right text-slate-600 text-[10px]">
                {log.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default ToolSidebar;
