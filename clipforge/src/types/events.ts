import type { EditDecisionList } from "./edl";

export type ProgressEvent =
  | { stage: "extracting_audio"; progress: number }
  | { stage: "transcribing"; progress: number }
  | { stage: "transcript_analysis"; progress: number }
  | { stage: "extracting_frames"; progress: number; frameCount: number }
  | { stage: "visual_analysis"; progress: number; estimatedCost: string }
  | { stage: "edl_review"; progress: number }
  | { stage: "generating_edl"; progress: number }
  | { stage: "edl_complete"; edl: EditDecisionList }
  | { stage: "rendering"; progress: number; currentStep: string }
  | { stage: "render_complete"; outputUrl: string }
  | { stage: "error"; message: string; code: string }
  // Legacy aliases (frontend handles both)
  | { stage: "analyzing"; progress: number; estimatedCost: string };
