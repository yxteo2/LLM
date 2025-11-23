import { GoogleGenAI, Type, FunctionDeclaration, Chat } from "@google/genai";
import { BoundingBox } from "../types";
import { runLocalDetection } from "./visionService";

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Tool Definitions (MCP Capabilities) ---

const dinoV3Tool: FunctionDeclaration = {
  name: 'dino_v3_detect',
  description: 'Invokes the local Object Detection Model (DETR ResNet-50). Returns bounding boxes and labels for common objects (COCO classes). Use for finding items like cars, people, animals, furniture, etc.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      target_objects: {
        type: Type.STRING,
        description: 'Optional filter. Comma-separated list of objects to look for. (e.g. "cat, dog").',
      }
    },
  },
};

const ocrTool: FunctionDeclaration = {
  name: 'ocr_engine',
  description: 'Invokes the Optical Character Recognition (OCR) engine. Returns text content and bounding box coordinates.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      focus_area: {
        type: Type.STRING,
        description: 'Optional hint about what text to look for.',
      }
    },
  },
};

// --- Model Services ---

/**
 * Runs the real local Object Detection model via Transformers.js
 */
export const runDinoV3 = async (
  imageUrl: string, // Changed to take URL/Blob URL for transformers.js
  targetObjects?: string
): Promise<BoundingBox[]> => {
  try {
    // Calls the REAL model defined in visionService.ts
    const boxes = await runLocalDetection(imageUrl, targetObjects);
    
    // Normalize coordinates if necessary (Transformers.js usually returns pixel values)
    // The visualizer handles pixel values correctly if they are > 1.
    return boxes;
  } catch (e) {
    console.error("Local Vision Model Failed", e);
    return [];
  }
};

/**
 * Uses Gemini's Vision capabilities purely for OCR.
 */
export const runOCR = async (
  base64Image: string, 
  mimeType: string
): Promise<BoundingBox[]> => {
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: mimeType } },
        { text: "Read all text in this image. Return a JSON object with a list of 'text_blocks', where each block has 'text' and bounding box 'ymin', 'xmin', 'ymax', 'xmax' (0-1000 scale)." }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text_blocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER }
              },
              required: ['text', 'ymin', 'xmin', 'ymax', 'xmax']
            }
          }
        }
      }
    }
  });

  if (!response.text) return [];

  try {
    const data = JSON.parse(response.text);
    const blocks = data.text_blocks || [];
    return blocks.map((block: any) => ({
      label: block.text,
      ymin: block.ymin,
      xmin: block.xmin,
      ymax: block.ymax,
      xmax: block.xmax,
      type: 'text'
    }));
  } catch (e) {
    console.error("OCR Service Failed", e);
    return [];
  }
};

// --- Main Agent Chat Session ---

export const createChatSession = (systemInstruction: string): Chat => {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: [dinoV3Tool, ocrTool] }],
    },
  });
};

// --- Utilities ---

export const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const processImage = async (file: File): Promise<{ base64: string; mimeType: string }> => {
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  
  if (supportedTypes.includes(file.type)) {
    const base64 = await convertBlobToBase64(file);
    return { base64, mimeType: file.type };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const jpegUrl = canvas.toDataURL('image/jpeg', 0.9);
      const base64 = jpegUrl.split(',')[1];
      URL.revokeObjectURL(url);
      resolve({ base64, mimeType: 'image/jpeg' });
    };
    
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    
    img.src = url;
  });
};
