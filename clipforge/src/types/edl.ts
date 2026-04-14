export interface EditDecisionList {
  version: "1.0";
  sourceVideo: {
    duration: number;
    fps: number;
    width: number;
    height: number;
  };
  operations: EditOperation[];
  reasoning: string;
  estimatedOutputDuration: number;
  normalizeAudio?: boolean; // EBU R128 loudness normalization, default true
}

export type EditOperation =
  | TrimOperation
  | CutOperation
  | CaptionOperation
  | SpeedOperation
  | SilenceRemoveOperation
  | ReframeOperation
  | TransitionOperation
  | IllustrationOperation;

export interface TrimOperation {
  type: "trim";
  startTime: number;
  endTime: number;
  reason: string;
}

export interface CutOperation {
  type: "cut";
  segments: Array<{
    startTime: number;
    endTime: number;
    reason: string;
  }>;
}

export interface CaptionOperation {
  type: "caption";
  style: "karaoke" | "word-by-word" | "sentence" | "minimal";
  position: "bottom-center" | "top-center" | "center";
  fontSize: "small" | "medium" | "large";
  fontColor: string;
  backgroundColor: string;
  animation: "none" | "fade" | "bounce" | "typewriter";
  // Extended fields (optional, defaults applied by subtitle generator)
  fontFamily?: string; // default: "Arial Black"
  fontWeight?: "normal" | "bold"; // default: "bold"
  outlineWidth?: number; // default: 4
  shadowDepth?: number; // default: 2
  borderStyle?: "outline" | "box" | "none"; // default: "outline"
}

export interface SpeedOperation {
  type: "speed";
  segments: Array<{
    startTime: number;
    endTime: number;
    factor: number;
    preservePitch: boolean;
  }>;
}

export interface SilenceRemoveOperation {
  type: "silence_remove";
  minSilenceDuration: number;
  padding: number;
  removeFiller: boolean;
  fillerWords: string[];
}

export interface ReframeOperation {
  type: "reframe";
  targetAspectRatio: "9:16" | "1:1" | "4:5";
  trackingMode: "face" | "center" | "smart";
}

export interface TransitionOperation {
  type: "transition";
  between: Array<{
    atTime: number;
    style: "crossfade" | "cut" | "swipe" | "zoom";
    duration: number;
  }>;
}

export interface IllustrationOperation {
  type: "illustration";
  illustrations: Array<{
    startTime: number;
    endTime: number;
    prompt: string; // DALL-E prompt describing what to generate
    context: string; // transcript text that motivated this illustration
    position: "fullscreen" | "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
    opacity: number; // 0-1, how transparent the overlay is
  }>;
}
