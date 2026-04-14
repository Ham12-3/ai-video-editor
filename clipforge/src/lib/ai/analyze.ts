import "server-only";
import OpenAI from "openai";
import type { EditDecisionList } from "@/types/edl";
import type { TranscriptionResult, FillerWordDetection } from "./transcribe";
import {
  PASS1_TRANSCRIPT_ANALYSIS_PROMPT,
  PASS2_VISUAL_ANALYSIS_PROMPT,
  SELF_REVIEW_PROMPT,
} from "./prompts";

// ── Config ──

const ANALYSIS_MODEL = process.env.MODEL_ANALYSIS || "gpt-5.4";
const REVIEW_MODEL = process.env.MODEL_REVIEW || "gpt-5.4-mini";

// ── Types ──

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface Pass1Result {
  hookMoment: { start: number; end: number };
  topicSegments: Array<{
    start: number;
    end: number;
    topic: string;
    importance: number;
  }>;
  cutCandidates: Array<{ start: number; end: number; reason: string }>;
  highlights: Array<{ start: number; end: number; description: string }>;
  keyFrameTimestamps: number[];
}

export interface AnalysisInput {
  transcript: TranscriptionResult;
  silences: Array<{ start: number; end: number; duration: number }>;
  fillerWords: FillerWordDetection[];
  videoMeta: VideoMeta;
  userPrompt: string;
  apiKey: string;
}

export interface FullAnalysisResult {
  edl: EditDecisionList;
  pass1: Pass1Result;
  reviewConfidence: number;
  usage: {
    pass1Tokens: number;
    pass2Tokens: number;
    reviewTokens: number;
    totalTokens: number;
  };
}

// ── JSON Schemas (used by both Chat Completions and Responses API) ──

const PASS1_SCHEMA = {
  type: "object" as const,
  properties: {
    hookMoment: {
      type: "object" as const,
      properties: {
        start: { type: "number" as const },
        end: { type: "number" as const },
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
    topicSegments: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          start: { type: "number" as const },
          end: { type: "number" as const },
          topic: { type: "string" as const },
          importance: { type: "number" as const },
        },
        required: ["start", "end", "topic", "importance"],
        additionalProperties: false,
      },
    },
    cutCandidates: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          start: { type: "number" as const },
          end: { type: "number" as const },
          reason: { type: "string" as const },
        },
        required: ["start", "end", "reason"],
        additionalProperties: false,
      },
    },
    highlights: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          start: { type: "number" as const },
          end: { type: "number" as const },
          description: { type: "string" as const },
        },
        required: ["start", "end", "description"],
        additionalProperties: false,
      },
    },
    keyFrameTimestamps: {
      type: "array" as const,
      items: { type: "number" as const },
    },
  },
  required: [
    "hookMoment",
    "topicSegments",
    "cutCandidates",
    "highlights",
    "keyFrameTimestamps",
  ],
  additionalProperties: false,
};

const EDL_SCHEMA = {
  type: "object" as const,
  properties: {
    version: { type: "string" as const, enum: ["1.0"] },
    sourceVideo: {
      type: "object" as const,
      properties: {
        duration: { type: "number" as const },
        fps: { type: "number" as const },
        width: { type: "number" as const },
        height: { type: "number" as const },
      },
      required: ["duration", "fps", "width", "height"],
      additionalProperties: false,
    },
    operations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          type: {
            type: "string" as const,
            enum: [
              "trim",
              "cut",
              "caption",
              "speed",
              "silence_remove",
              "reframe",
              "transition",
              "illustration",
            ],
          },
          startTime: { type: "number" as const },
          endTime: { type: "number" as const },
          reason: { type: "string" as const },
          segments: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                startTime: { type: "number" as const },
                endTime: { type: "number" as const },
                reason: { type: "string" as const },
                factor: { type: "number" as const },
                preservePitch: { type: "boolean" as const },
              },
              required: [
                "startTime",
                "endTime",
                "reason",
                "factor",
                "preservePitch",
              ],
              additionalProperties: false,
            },
          },
          style: { type: "string" as const },
          position: { type: "string" as const },
          fontSize: { type: "string" as const },
          fontColor: { type: "string" as const },
          backgroundColor: { type: "string" as const },
          animation: { type: "string" as const },
          minSilenceDuration: { type: "number" as const },
          padding: { type: "number" as const },
          removeFiller: { type: "boolean" as const },
          fillerWords: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          targetAspectRatio: { type: "string" as const },
          trackingMode: { type: "string" as const },
          between: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                atTime: { type: "number" as const },
                style: { type: "string" as const },
                duration: { type: "number" as const },
              },
              required: ["atTime", "style", "duration"],
              additionalProperties: false,
            },
          },
          illustrations: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                startTime: { type: "number" as const },
                endTime: { type: "number" as const },
                prompt: { type: "string" as const },
                context: { type: "string" as const },
                position: { type: "string" as const },
                opacity: { type: "number" as const },
              },
              required: ["startTime", "endTime", "prompt", "context", "position", "opacity"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "type",
          "startTime",
          "endTime",
          "reason",
          "segments",
          "style",
          "position",
          "fontSize",
          "fontColor",
          "backgroundColor",
          "animation",
          "minSilenceDuration",
          "padding",
          "removeFiller",
          "fillerWords",
          "targetAspectRatio",
          "trackingMode",
          "between",
          "illustrations",
        ],
        additionalProperties: false,
      },
    },
    reasoning: { type: "string" as const },
    estimatedOutputDuration: { type: "number" as const },
    normalizeAudio: { type: "boolean" as const },
  },
  required: [
    "version",
    "sourceVideo",
    "operations",
    "reasoning",
    "estimatedOutputDuration",
    "normalizeAudio",
  ],
  additionalProperties: false,
};

const REVIEW_SCHEMA = {
  type: "object" as const,
  properties: {
    confidence: { type: "number" as const },
    issues: {
      type: "array" as const,
      items: { type: "string" as const },
    },
    correctedEdl: EDL_SCHEMA,
  },
  required: ["confidence", "issues", "correctedEdl"],
  additionalProperties: false,
};

// ── Helpers ──

/**
 * Extract text from a Responses API response, with refusal checking.
 */
function extractResponseText(
  response: OpenAI.Responses.Response,
  label: string
): string {
  // Check for errors
  if (response.error) {
    throw new Error(
      `${label} API error: ${response.error.message} (code: ${response.error.code})`
    );
  }

  // Check for refusal in output items
  for (const item of response.output) {
    if (item.type === "message") {
      for (const content of item.content) {
        if (content.type === "refusal") {
          throw new Error(`${label} refused: ${content.refusal}`);
        }
      }
    }
  }

  // Use output_text (the SDK concatenates all text output)
  const text = response.output_text;
  if (!text) {
    throw new Error(`${label}: empty response`);
  }

  return text;
}

function getUsageTokens(response: OpenAI.Responses.Response): number {
  if (!response.usage) return 0;
  return response.usage.input_tokens + response.usage.output_tokens;
}

function buildTranscriptContext(input: AnalysisInput): string {
  const parts: string[] = [];

  parts.push("## Video Metadata");
  parts.push(`- Duration: ${input.videoMeta.duration.toFixed(2)}s`);
  parts.push(
    `- Resolution: ${input.videoMeta.width}x${input.videoMeta.height}`
  );
  parts.push(`- Frame rate: ${input.videoMeta.fps.toFixed(1)} fps`);
  parts.push("");

  parts.push("## Transcript (word timestamps)");
  for (const word of input.transcript.words) {
    parts.push(
      `[${word.start.toFixed(2)}-${word.end.toFixed(2)}] ${word.word}`
    );
  }
  parts.push("");

  parts.push("## Silence Segments");
  if (input.silences.length === 0) {
    parts.push("None detected.");
  } else {
    for (const s of input.silences) {
      parts.push(
        `- ${s.start.toFixed(2)}s to ${s.end.toFixed(2)}s (${s.duration.toFixed(2)}s)`
      );
    }
  }
  parts.push("");

  parts.push("## Filler Words");
  if (input.fillerWords.length === 0) {
    parts.push("None detected.");
  } else {
    for (const f of input.fillerWords) {
      parts.push(
        `- "${f.word}" at ${f.start.toFixed(2)}s-${f.end.toFixed(2)}s`
      );
    }
  }
  parts.push("");

  parts.push("## User Editing Instructions");
  parts.push(input.userPrompt);

  return parts.join("\n");
}

// ── Pass 1: Transcript Analysis (text-only) ──

export async function runPass1(
  input: AnalysisInput
): Promise<{ result: Pass1Result; tokens: number }> {
  const client = new OpenAI({ apiKey: input.apiKey });
  const context = buildTranscriptContext(input);

  console.log(`[analyze:pass1] Model: ${ANALYSIS_MODEL}, sending transcript analysis...`);

  const response = await client.responses.create({
    model: ANALYSIS_MODEL,
    instructions: PASS1_TRANSCRIPT_ANALYSIS_PROMPT,
    input: context,
    text: {
      format: {
        type: "json_schema",
        name: "transcript_analysis",
        schema: PASS1_SCHEMA,
        strict: true,
      },
    },
  });

  const text = extractResponseText(response, "Pass 1");
  const result = JSON.parse(text) as Pass1Result;
  const tokens = getUsageTokens(response);

  console.log(`[analyze:pass1] Hook: ${result.hookMoment.start.toFixed(2)}s - ${result.hookMoment.end.toFixed(2)}s`);
  console.log(`[analyze:pass1] Topics: ${result.topicSegments.length}, Cuts: ${result.cutCandidates.length}, Highlights: ${result.highlights.length}`);
  console.log(`[analyze:pass1] Key frames: ${result.keyFrameTimestamps.length}`);
  console.log(`[analyze:pass1] Tokens: ${tokens}`);

  return { result, tokens };
}

// ── Pass 2: Visual Analysis + EDL (multimodal) ──

export async function runPass2(
  input: AnalysisInput,
  pass1: Pass1Result,
  frames: Array<{ timestamp: number; base64: string; transcriptContext?: string }>
): Promise<{ edl: EditDecisionList; tokens: number }> {
  const client = new OpenAI({ apiKey: input.apiKey });

  // Build context
  const parts: string[] = [];

  parts.push("## Pass 1 Transcript Analysis Results");
  parts.push(
    `Hook moment: ${pass1.hookMoment.start.toFixed(2)}s - ${pass1.hookMoment.end.toFixed(2)}s`
  );
  parts.push("");

  parts.push("### Topic Segments");
  for (const seg of pass1.topicSegments) {
    parts.push(
      `- [${seg.start.toFixed(2)}s-${seg.end.toFixed(2)}s] "${seg.topic}" (importance: ${seg.importance}/10)`
    );
  }
  parts.push("");

  parts.push("### Cut Candidates");
  for (const cut of pass1.cutCandidates) {
    parts.push(
      `- [${cut.start.toFixed(2)}s-${cut.end.toFixed(2)}s] ${cut.reason}`
    );
  }
  parts.push("");

  parts.push("### Highlights");
  for (const h of pass1.highlights) {
    parts.push(
      `- [${h.start.toFixed(2)}s-${h.end.toFixed(2)}s] ${h.description}`
    );
  }
  parts.push("");

  parts.push(buildTranscriptContext(input));
  parts.push("");
  parts.push(
    `## Keyframes (${frames.length} frames with transcript context)`
  );
  for (const f of frames) {
    const ctx = f.transcriptContext ? ` -- "${f.transcriptContext}"` : "";
    parts.push(`- Frame at ${f.timestamp.toFixed(2)}s${ctx}`);
  }

  const textContent = parts.join("\n");

  // Build input with interleaved text and images
  const inputItems: Array<
    | { type: "message"; role: "user"; content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "low" }> }
  > = [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: textContent },
        ...frames.map((f) => ({
          type: "input_image" as const,
          image_url: f.base64,
          detail: "low" as const,
        })),
      ],
    },
  ];

  console.log(
    `[analyze:pass2] Model: ${ANALYSIS_MODEL}, sending visual analysis with ${frames.length} frames...`
  );

  const response = await client.responses.create({
    model: ANALYSIS_MODEL,
    instructions: PASS2_VISUAL_ANALYSIS_PROMPT,
    input: inputItems,
    text: {
      format: {
        type: "json_schema",
        name: "edit_decision_list",
        schema: EDL_SCHEMA,
        strict: true,
      },
    },
  });

  const text = extractResponseText(response, "Pass 2");
  const edl = JSON.parse(text) as EditDecisionList;
  const tokens = getUsageTokens(response);

  console.log(
    `[analyze:pass2] EDL: ${edl.operations.length} operations, estimated ${edl.estimatedOutputDuration.toFixed(1)}s`
  );
  console.log(`[analyze:pass2] Tokens: ${tokens}`);

  return { edl, tokens };
}

// ── Self-Review ──

export async function runSelfReview(
  edl: EditDecisionList,
  transcript: TranscriptionResult,
  apiKey: string
): Promise<{
  edl: EditDecisionList;
  confidence: number;
  issues: string[];
  tokens: number;
}> {
  const client = new OpenAI({ apiKey });

  const context = [
    "## EDL to Review",
    JSON.stringify(edl, null, 2),
    "",
    "## Original Transcript",
    transcript.words
      .map((w) => `[${w.start.toFixed(2)}-${w.end.toFixed(2)}] ${w.word}`)
      .join("\n"),
  ].join("\n");

  console.log(`[analyze:review] Model: ${REVIEW_MODEL}, running self-review...`);

  const response = await client.responses.create({
    model: REVIEW_MODEL,
    instructions: SELF_REVIEW_PROMPT,
    input: context,
    text: {
      format: {
        type: "json_schema",
        name: "edl_review",
        schema: REVIEW_SCHEMA,
        strict: true,
      },
    },
  });

  const text = extractResponseText(response, "Review");
  const review = JSON.parse(text) as {
    confidence: number;
    issues: string[];
    correctedEdl: EditDecisionList;
  };

  const tokens = getUsageTokens(response);

  console.log(
    `[analyze:review] Confidence: ${review.confidence}, Issues: ${review.issues.length}`
  );
  if (review.issues.length > 0) {
    for (const issue of review.issues) {
      console.log(`[analyze:review]   - ${issue}`);
    }
  }
  console.log(`[analyze:review] Tokens: ${tokens}`);

  const finalEdl = review.confidence < 0.7 ? review.correctedEdl : edl;

  if (review.confidence < 0.7) {
    console.log(`[analyze:review] Confidence below 0.7, using corrected EDL`);
  }

  return {
    edl: finalEdl,
    confidence: review.confidence,
    issues: review.issues,
    tokens,
  };
}

// ── Legacy single-pass (backward compat) ──

export async function analyzeVideo(
  input: AnalysisInput & { frames: string[] }
): Promise<{
  edl: EditDecisionList;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}> {
  const frames = input.frames.map((b64, i) => ({
    timestamp: i * 2,
    base64: b64,
  }));
  const { edl, tokens } = await runPass2(
    input,
    {
      hookMoment: { start: 0, end: 5 },
      topicSegments: [],
      cutCandidates: [],
      highlights: [],
      keyFrameTimestamps: [],
    },
    frames
  );
  return {
    edl,
    usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens },
  };
}
