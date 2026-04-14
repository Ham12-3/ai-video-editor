// Token counting and cost estimation

// GPT-5.4 pricing (2026)
const PRICING = {
  "gpt-5.4": {
    input: 2.5 / 1_000_000, // $2.50 per 1M input tokens
    output: 15.0 / 1_000_000, // $15.00 per 1M output tokens
  },
  "gpt-5.4-mini": {
    input: 0.75 / 1_000_000, // $0.75 per 1M input tokens
    output: 4.5 / 1_000_000, // $4.50 per 1M output tokens
  },
  "gpt-5.4-nano": {
    input: 0.2 / 1_000_000, // $0.20 per 1M input tokens (estimated)
    output: 1.0 / 1_000_000, // $1.00 per 1M output tokens (estimated)
  },
  "whisper-1": {
    perMinute: 0.006, // $0.006 per minute
  },
} as const;

export type AnalysisModel = "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano";

export function estimateAnalysisCost(
  frameCount: number,
  transcriptTokens: number,
  systemPromptTokens: number,
  model: AnalysisModel = "gpt-5.4"
): { tokens: number; cost: number; breakdown: string } {
  // Each frame at 768px with detail:low is roughly 85 tokens
  const imageTokens = frameCount * 85;
  const totalInput = imageTokens + transcriptTokens + systemPromptTokens;
  const estimatedOutput = 2000; // EDL response

  const pricing = PRICING[model];
  const inputCost = totalInput * pricing.input;
  const outputCost = estimatedOutput * pricing.output;
  const totalCost = inputCost + outputCost;

  return {
    tokens: totalInput + estimatedOutput,
    cost: totalCost,
    breakdown: [
      `Model: ${model}`,
      `${frameCount} frames (~${imageTokens.toLocaleString()} tokens)`,
      `Transcript: ~${transcriptTokens.toLocaleString()} tokens`,
      `System prompt: ~${systemPromptTokens.toLocaleString()} tokens`,
      `Estimated output: ~${estimatedOutput.toLocaleString()} tokens`,
      `Total: ~${(totalInput + estimatedOutput).toLocaleString()} tokens`,
      `Estimated cost: $${totalCost.toFixed(4)}`,
    ].join("\n"),
  };
}

/**
 * Calculate actual cost from API usage response.
 */
export function calculateActualCost(
  promptTokens: number,
  completionTokens: number,
  model: AnalysisModel = "gpt-5.4"
): { cost: number; display: string } {
  const pricing = PRICING[model];
  const cost =
    promptTokens * pricing.input + completionTokens * pricing.output;
  return {
    cost,
    display: `$${cost.toFixed(4)} (${promptTokens.toLocaleString()} input + ${completionTokens.toLocaleString()} output tokens)`,
  };
}

export function estimateTranscriptionCost(durationSeconds: number): {
  cost: number;
  display: string;
} {
  const minutes = durationSeconds / 60;
  const cost = minutes * PRICING["whisper-1"].perMinute;
  return {
    cost,
    display: `~$${cost.toFixed(4)} (${minutes.toFixed(1)} min)`,
  };
}

/**
 * Rough token count estimate for a string (4 chars per token average).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
