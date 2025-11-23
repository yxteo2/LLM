import { GoogleGenAI, Type, FunctionDeclaration, Chat } from "@google/genai";
import { BoundingBox } from "../types";

// Initialize the API client
// CRITICAL: The API key must be available in process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Tool Definitions (MCP Capabilities) ---

const dinoV3Tool: FunctionDeclaration = {
  name: 'dino_v3_detect',
  description: 'Invokes the DinoV3 Open-Vocabulary Detection model to find objects. Returns bounding boxes and labels. Use for finding, counting, or locating specific items.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      target_objects: {
        type: Type.STRING,
        description: 'Comma-separated list of objects to detect (e.g. "cat, dog, remote"). If empty, runs in open-set mode for all prominent objects.',
      }
    },
  },
};

const ocrTool: FunctionDeclaration = {
  name: 'ocr_engine',
  description: 'Invokes a specialized Optical Character Recognition (OCR) engine. Returns text content and bounding box coordinates. Use for reading signs, documents, or extracting text.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      focus_area: {
        type: Type.STRING,
        description: 'Optional hint about what text to look for (e.g., "dates", "prices").',
      }
    },
  },
};

// --- Model Simulation Services ---

/**
 * Simulates calling a specialized Object Detection Model (like DinoV3).
 * We use Gemini 2.5 Flash with a strict system prompt to emulate a raw detection API.
 */
export const runDinoV3 = async (
  base64Image: string, 
  mimeType: string,
  targetObjects?: string
): Promise<BoundingBox[]> => {
  
  // Prompt engineered to act like a raw JSON-outputting vision model
  const prompt = targetObjects 
    ? `TASK: Open-Vocabulary Detection. TARGETS: ${targetObjects}. OUTPUT: JSON Bounding Boxes only.` 
    : `TASK: General Object Detection. TARGETS: All prominent objects. OUTPUT: JSON Bounding Boxes only.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: mimeType } },
        { text: prompt }
      ]
    },
    config: {
      systemInstruction: "You are DinoV3, a specialized computer vision model. You output ONLY JSON. You do not speak. You detect objects.",
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          objects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER }
              },
              required: ['label', 'ymin', 'xmin', 'ymax', 'xmax']
            }
          }
        }
      }
    }
  });

  if (!response.text) return [];

  try {
    const data = JSON.parse(response.text);
    const objects = data.objects || [];
    return objects.map((obj: any) => ({ ...obj, type: 'object' }));
  } catch (e) {
    console.error("DinoV3 Simulation Failed", e);
    return [];
  }
};

/**
 * Simulates calling a specialized OCR Model.
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
        { text: "TASK: Extract all text. OUTPUT: JSON with text and coordinates." }
      ]
    },
    config: {
      systemInstruction: "You are a high-performance OCR Engine. You output ONLY JSON. You extract visible text.",
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
    console.error("OCR Engine Failed", e);
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