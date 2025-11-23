import React, { useEffect, useRef } from 'react';
import { BoundingBox } from '../types';
import { drawBoundingBoxes } from '../utils/drawUtils';

interface ImageViewerProps {
  imageSrc: string | null;
  detections: BoundingBox[];
  isAnalyzing: boolean;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ imageSrc, detections, isAnalyzing }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (imageSrc && imgRef.current && canvasRef.current && detections.length > 0) {
      // Small timeout to ensure image is loaded/rendered before drawing
      const timer = setTimeout(() => {
        if(canvasRef.current && imgRef.current) {
             drawBoundingBoxes(canvasRef.current, imgRef.current, detections);
        }
      }, 100);
      return () => clearTimeout(timer);
    } else if (canvasRef.current) {
        // Clear canvas if no detections
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0,0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [detections, imageSrc]);

  if (!imageSrc) {
    return (
      <div className="h-64 md:h-full w-full bg-slate-900 border-b md:border-b-0 md:border-l border-slate-800 flex flex-col items-center justify-center text-slate-500 p-6">
        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">Upload an image to start visual analysis</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-64 md:h-full w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-l border-slate-800">
      <div className="relative max-w-full max-h-full p-4">
        <img 
          ref={imgRef}
          src={imageSrc} 
          alt="Analysis Target" 
          className="max-w-full max-h-[70vh] md:max-h-[85vh] rounded shadow-2xl border border-slate-800"
          onLoad={() => {
             // Redraw if detections exist when image finally loads
             if(detections.length > 0 && canvasRef.current && imgRef.current) {
                 drawBoundingBoxes(canvasRef.current, imgRef.current, detections);
             }
          }}
        />
        <canvas 
          ref={canvasRef}
          className="absolute top-4 left-4 pointer-events-none"
          style={{
            width: imgRef.current ? imgRef.current.width : '100%',
            height: imgRef.current ? imgRef.current.height : '100%',
          }}
        />
        
        {isAnalyzing && (
            <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] flex items-center justify-center">
                <div className="bg-slate-900/90 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-full flex items-center gap-3 shadow-lg shadow-cyan-500/10">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-medium tracking-wide">Scanning...</span>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ImageViewer;
