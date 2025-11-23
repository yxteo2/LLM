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
    // Gemini 2.5 often returns coordinates in 0-1000 scale for object detection tasks via JSON
    // We normalize them to 0-1 first just in case, then scale to image size.
    
    // Safety check: if values are small (< 1), treat as 0-1. If > 1, treat as 0-1000.
    const isNormalized = box.ymax <= 1 && box.xmax <= 1;
    const scale = isNormalized ? 1 : 1000;

    const x = (box.xmin / scale) * canvas.width;
    const y = (box.ymin / scale) * canvas.height;
    const w = ((box.xmax - box.xmin) / scale) * canvas.width;
    const h = ((box.ymax - box.ymin) / scale) * canvas.height;

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
    
    // Position label above box if space allows, otherwise inside
    let labelY = y > textHeight ? y - textHeight : y;
    if (isText) {
        // For text, sometimes it's better to put it below or offset if crowded, 
        // but top-left is standard. 
        // Let's draw a small tag.
    }
    
    ctx.setLineDash([]); // Reset dash for rect
    ctx.fillRect(x, labelY, textWidth, textHeight);

    // Text Color
    ctx.fillStyle = isText ? '#00FF41' : '#000000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + (isText ? 4 : 6), labelY + (textHeight / 2));

    ctx.restore();
  });
};