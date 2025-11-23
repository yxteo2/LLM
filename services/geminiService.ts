import { GoogleGenAI, Type, FunctionDeclaration, Schema, Chat, GenerateContentResponse, Part } from "@google/genai";
import { BoundingBox } from "../types";

// Initialize the API client
// CRITICAL: The API key must be available in process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Tool Definitions ---

const detectObjectsTool: FunctionDeclaration = {
  name: 'detect_objects',
  description: 'Detects objects in the currently visible image and returns their bounding boxes and labels. Use this whenever the user asks to find, locate, count, or identify multiple items in the image with spatial context.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      target_objects: {
        type: Type.STRING,
        description: 'Optional comma-separated list of specific objects to look for (e.g., "cat, dog"). If empty, detects all prominent objects.',
      }
    },
  },
};

// --- Helper: Specific "Tool Execution" call ---
// This function acts as the "Tool Executor". In a real MCP system, this might be Python.
// Here, we use Gemini itself (with a specific schema) to perform the computer vision task.
export const executeObjectDetection = async (
  base64Image: string, 
  mimeType: string,
  targetObjects?: string
): Promise<BoundingBox[]> => {
  
  const prompt = targetObjects 
    ? `Detect the following objects: ${targetObjects}. Return their bounding boxes.` 
    : `Detect all prominent objects in the image. Return their bounding boxes and labels.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: mimeType } },
        { text: prompt }
      ]
    },
    config: {
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
                ymin: { type: Type.NUMBER, description: "Normalized coordinate 0-1000" },
                xmin: { type: Type.NUMBER, description: "Normalized coordinate 0-1000" },
                ymax: { type: Type.NUMBER, description: "Normalized coordinate 0-1000" },
                xmax: { type: Type.NUMBER, description: "Normalized coordinate 0-1000" }
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
    return data.objects || [];
  } catch (e) {
    console.error("Failed to parse detection results", e);
    return [];
  }
};

// --- Chat Session Management ---

export const createChatSession = (systemInstruction: string): Chat => {
  return ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: [detectObjectsTool] }],
    },
  });
};

export const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
