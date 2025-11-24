import { pipeline, env } from '@xenova/transformers';
import { BoundingBox } from '../types';

// --- Configuration for Browser Compatibility ---

// 1. Disable Local Models (use CDN)
env.allowLocalModels = false;
env.useBrowserCache = true;

// 2. Disable Web Workers (Proxy)
// Running on the main thread avoids worker creation issues in sandboxed environments.
env.backends.onnx.wasm.proxy = false;

// 3. Force Single-Threaded Execution
// CRITICAL: Browsers block SharedArrayBuffer (required for multi-threading) 
// without specific COOP/COEP headers. Threads = 1 fixes "reading 'buffer'" errors.
env.backends.onnx.wasm.numThreads = 1;

// 4. Disable SIMD
// Increases stability in constrained environments at the cost of slight performance speed.
env.backends.onnx.wasm.simd = false; 

// 5. REMOVED manual wasmPaths
// v2.16.0 resolves these automatically and correctly. Manual overrides often cause version mismatches.

let detectionPipeline: any = null;
let isModelLoading = false;

export const initVisionModel = async () => {
  if (detectionPipeline) return; 
  
  if (isModelLoading) {
      while(isModelLoading) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if(detectionPipeline) return;
      }
      return;
  }
  
  try {
    isModelLoading = true;
    console.log("Loading DETR model...");
    
    // We use DETR (DEtection TRansformer) ResNet-50
    detectionPipeline = await pipeline('object-detection', 'Xenova/detr-resnet-50');
    
    console.log("DETR model loaded successfully.");
  } catch (err) {
    console.error("Failed to load detection model:", err);
    throw err;
  } finally {
    isModelLoading = false;
  }
};

export const getModelStatus = () => {
  if (detectionPipeline) return 'ready';
  if (isModelLoading) return 'loading';
  return 'idle';
};

export const runLocalDetection = async (url: string, targetObjects?: string): Promise<BoundingBox[]> => {
  if (!detectionPipeline) {
    try {
        await initVisionModel();
    } catch (e) {
        throw new Error("Vision Model failed to initialize. Please refresh or try again.");
    }
  }
  
  if (!detectionPipeline) {
      throw new Error("Model failed to initialize");
  }

  // Run inference
  const output = await detectionPipeline(url, { threshold: 0.85 });

  let results = output.map((obj: any) => ({
    label: obj.label,
    confidence: obj.score,
    xmin: obj.box.xmin,
    ymin: obj.box.ymin,
    xmax: obj.box.xmax,
    ymax: obj.box.ymax,
    type: 'object',
    coordinateUnit: 'pixel'
  }));

  if (targetObjects) {
    const targets = targetObjects.toLowerCase().split(',').map(s => s.trim());
    if (targets.length > 0 && targets[0] !== '') {
        const filtered = results.filter((r: BoundingBox) => 
            targets.some(t => r.label.toLowerCase().includes(t))
        );
        if (filtered.length > 0) results = filtered;
    }
  }

  return results;
};