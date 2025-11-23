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

  // Draw image first? No, the image is likely an <img> tag under the canvas. 
  // We only draw the overlays on the transparent canvas.

  boxes.forEach((box, index) => {
    // Gemini 2.5 often returns coordinates in 0-1000 scale for object detection tasks via JSON
    // We normalize them to 0-1 first just in case, then scale to image size.
    // However, the schema description in geminiService asked for 0-1000.
    
    // Safety check: if values are small (< 1), treat as 0-1. If > 1, treat as 0-1000.
    const isNormalized = box.ymax <= 1 && box.xmax <= 1;
    const scale = isNormalized ? 1 : 1000;

    const x = (box.xmin / scale) * canvas.width;
    const y = (box.ymin / scale) * canvas.height;
    const w = ((box.xmax - box.xmin) / scale) * canvas.width;
    const h = ((box.ymax - box.ymin) / scale) * canvas.height;

    // Pick a color based on index
    const colors = ['#00ffcc', '#ff00cc', '#ffff00', '#00ccff', '#ff9900'];
    const color = colors[index % colors.length];

    // Draw Box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();

    // Draw Label Background
    ctx.fillStyle = color;
    ctx.font = 'bold 16px Inter, sans-serif';
    const text = box.label;
    const textMetrics = ctx.measureText(text);
    const textHeight = 24; // approx
    const textWidth = textMetrics.width + 12;

    ctx.fillRect(x, y > 30 ? y - 30 : y, textWidth, 30);

    // Draw Label Text
    ctx.fillStyle = '#000000';
    ctx.fillText(text, x + 6, y > 30 ? y - 8 : y + 22);
  });
};
