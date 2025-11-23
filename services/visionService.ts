import { pipeline, env } from '@xenova/transformers';
import { BoundingBox } from '../types';

// Skip local model checks for browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Explicitly set the WASM paths to the CDN to ensure onnxruntime-web finds them correctly
// This prevents "registerBackend" errors caused by failed WASM initialization.
// We use a compatible version of onnxruntime-web for transformers 2.17.2
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

let detectionPipeline: any = null;
let isModelLoading = false;

export const initVisionModel = async () => {
  if (detectionPipeline || isModelLoading) return;
  
  try {
    isModelLoading = true;
    console.log("Loading DETR model...");
    // We use DETR (DEtection TRansformer) ResNet-50
    // This is a REAL object detection model, not an LLM simulation.
    detectionPipeline = await pipeline('object-detection', 'Xenova/detr-resnet-50');
    console.log("DETR model loaded.");
  } catch (err) {
    console.error("Failed to load detection model", err);
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
    await initVisionModel();
  }

  // Run inference
  // Threshold can be adjusted. DETR is usually quite confident.
  const output = await detectionPipeline(url, { threshold: 0.85 });

  // Output format from transformers.js object-detection:
  // [{ score: 0.99, label: 'cat', box: { xmin: 0, ymin: 0, xmax: 0, ymax: 0 } }]
  
  let results = output.map((obj: any) => ({
    label: obj.label,
    confidence: obj.score,
    xmin: obj.box.xmin,
    ymin: obj.box.ymin,
    xmax: obj.box.xmax,
    ymax: obj.box.ymax,
    type: 'object'
  }));

  // Simple post-processing to filter if targets were specified
  if (targetObjects) {
    const targets = targetObjects.toLowerCase().split(',').map(s => s.trim());
    // If targets provided, we try to loosely match them
    if (targets.length > 0 && targets[0] !== '') {
        const filtered = results.filter((r: BoundingBox) => 
            targets.some(t => r.label.toLowerCase().includes(t))
        );
        // If filter is too aggressive (0 results), we return original (let LLM decide)
        // otherwise return filtered.
        if (filtered.length > 0) results = filtered;
    }
  }

  return results;
};