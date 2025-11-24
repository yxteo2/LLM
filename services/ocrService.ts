import Tesseract from 'tesseract.js';
import { BoundingBox } from '../types';

let worker: any = null;
let isInitializing = false;

export const initOCR = async () => {
    if (worker || isInitializing) return;
    isInitializing = true;
    try {
        console.log("Initializing Tesseract...");
        
        // Handle potential default export structure wrapper safely for CDN bundles
        // @ts-ignore
        const createWorker = Tesseract?.createWorker || Tesseract?.default?.createWorker;
        
        if (!createWorker) {
             throw new Error("Could not find createWorker in Tesseract module");
        }

        const w = await createWorker('eng');
        worker = w;
        console.log("Tesseract Initialized");
    } catch (e) {
        console.error("Tesseract init failed", e);
    } finally {
        isInitializing = false;
    }
};

export const runLocalOCR = async (base64Data: string, mimeType: string): Promise<BoundingBox[]> => {
    if (!worker) await initOCR();
    if (!worker) {
        console.error("OCR Worker not ready");
        return [];
    }

    try {
        const image = `data:${mimeType};base64,${base64Data}`;
        const ret = await worker.recognize(image);
        
        // Map Tesseract result to our BoundingBox type
        return ret.data.words.map((word: any) => ({
            label: word.text,
            confidence: word.confidence / 100,
            xmin: word.bbox.x0,
            ymin: word.bbox.y0,
            xmax: word.bbox.x1,
            ymax: word.bbox.y1,
            type: 'text',
            coordinateUnit: 'pixel'
        }));
    } catch (e) {
        console.error("OCR Failed", e);
        return [];
    }
};