import { emitProgress } from "./progress";

/**
 * Runs a long async job while emitting synthetic progress ticks so the UI
 * doesn't sit at 0%. Most upstream AI APIs (Whisper, GPT) don't expose
 * per-chunk progress, so we interpolate toward 95% based on elapsed time
 * vs an estimate, then snap to 100% on completion.
 *
 * The tick only fires if the integer percent actually changed, to avoid
 * SSE event spam.
 */
export async function withStageProgress<T>(
  projectId: string,
  stage: string,
  estimatedMs: number,
  extraFields: Record<string, unknown>,
  work: () => Promise<T>
): Promise<T> {
  emitProgress(projectId, { stage, progress: 0, ...extraFields } as Parameters<typeof emitProgress>[1]);

  const start = Date.now();
  let lastPct = 0;
  const tickMs = 400;

  const ticker = setInterval(() => {
    const elapsed = Date.now() - start;
    const raw = (elapsed / estimatedMs) * 95;
    // Ease out near the end so we don't oscillate around 95% forever.
    const damped = raw >= 85 ? 85 + (raw - 85) * 0.3 : raw;
    const pct = Math.min(95, Math.max(1, Math.round(damped)));
    if (pct !== lastPct) {
      lastPct = pct;
      emitProgress(projectId, {
        stage,
        progress: pct,
        ...extraFields,
      } as Parameters<typeof emitProgress>[1]);
    }
  }, tickMs);

  try {
    const result = await work();
    clearInterval(ticker);
    emitProgress(projectId, {
      stage,
      progress: 100,
      ...extraFields,
    } as Parameters<typeof emitProgress>[1]);
    return result;
  } catch (err) {
    clearInterval(ticker);
    throw err;
  }
}
