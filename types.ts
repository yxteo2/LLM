export interface BoundingBox {
  label: string;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  confidence?: number;
}

export interface DetectionResult {
  objects: BoundingBox[];
}

export enum Sender {
  User = 'user',
  Model = 'model',
  System = 'system'
}

export interface Message {
  id: string;
  sender: Sender;
  text: string;
  timestamp: Date;
  toolCallId?: string;
}

export interface ToolLog {
  id: string;
  toolName: string;
  status: 'pending' | 'success' | 'error';
  args: string;
  result?: string;
  timestamp: Date;
}

export interface AnalysisState {
  isAnalyzing: boolean;
  stage: string; // e.g., "Thinking...", "Calling Tool: detect_objects", "Rendering..."
}