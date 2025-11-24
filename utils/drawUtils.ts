import { BoundingBox } from "../types";

export const drawBoundingBoxes = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  boxes: BoundingBox[]
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas dimensions to match image natural dimensions
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  // Clear previous drawings
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  boxes.forEach((box, index) => {
    let x, y, w, h;

    if (box.coordinateUnit === 'pixel') {
        // Local models (Transformers.js / Tesseract) return absolute pixels relative to original image size
        x = box.xmin;
        y = box.ymin;
        w = box.xmax - box.xmin;
        h = box.ymax - box.ymin;
    } else {
        // Gemini API usually returns normalized coordinates (0-1000 or 0-1)
        
        // Safety check: if values are small (< 1.1), treat as 0-1. If > 1.1, treat as 0-1000.
        // Using 1.1 to avoid edge cases where a normalized box is exactly 1.0
        const isNormalized = box.ymax <= 1.1 && box.xmax <= 1.1;
        const scale = isNormalized ? 1 : 1000;

        x = (box.xmin / scale) * canvas.width;
        y = (box.ymin / scale) * canvas.height;
        w = ((box.xmax - box.xmin) / scale) * canvas.width;
        h = ((box.ymax - box.ymin) / scale) * canvas.height;
    }

    const isText = box.type === 'text';

    // Style Configuration
    let color: string;
    if (isText) {
      // Matrix/OCR Green style for text
      color = '#00FF41'; 
    } else {
      // Rotating colors for objects
      const colors = ['#00ffcc', '#ff00cc', '#ffff00', '#00ccff', '#ff9900'];
      color = colors[index % colors.length];
    }

    ctx.save();

    // Draw Box
    ctx.strokeStyle = color;
    ctx.lineWidth = isText ? 2 : 3;
    
    if (isText) {
      ctx.setLineDash([5, 3]); // Dashed line for text
    } else {
      ctx.setLineDash([]);
    }
    
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();

    // Draw Label Background & Text
    // For text detection, the label is the text itself.
    // We try to keep it unobtrusive but readable.
    
    ctx.font = isText ? '14px "JetBrains Mono", monospace' : 'bold 16px Inter, sans-serif';
    const text = box.label;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width + (isText ? 8 : 12);
    const textHeight = isText ? 20 : 30;

    // Background
    ctx.fillStyle = isText ? 'rgba(0, 20, 0, 0.8)' : color;
    
    // Position label above box if space allows, otherwise inside/below
    let labelY = y > textHeight ? y - textHeight : y;
    
    // For text, ensure we don't draw off-canvas or block the text itself if possible
    if (labelY < 0) labelY = y + h; 
    
    ctx.setLineDash([]); // Reset dash for rect
    ctx.fillRect(x, labelY, textWidth, textHeight);

    // Text Color
    ctx.fillStyle = isText ? '#00FF41' : '#000000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + (isText ? 4 : 6), labelY + (textHeight / 2));

    ctx.restore();
  });
};