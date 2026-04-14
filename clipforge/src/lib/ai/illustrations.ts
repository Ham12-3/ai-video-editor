import "server-only";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { IllustrationOperation } from "@/types/edl";

interface GeneratedIllustration {
  index: number;
  startTime: number;
  endTime: number;
  imagePath: string;
  prompt: string;
  position: string;
  opacity: number;
  animation?: "none" | "fade" | "slide" | "kenburns";
}

// Nano Banana 2 — Google's latest image model (released Feb 2026).
// Combines the Pro-tier quality of Nano Banana Pro with Flash-tier speed.
// Strong at literal, on-topic imagery, which is what we want for video
// overlays tied to what's being said.
const NANO_BANANA_MODEL = "gemini-3.1-flash-image-preview";
const NANO_BANANA_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${NANO_BANANA_MODEL}:generateContent`;

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

async function generateOneImage(
  apiKey: string,
  prompt: string,
  context: string
): Promise<Buffer | null> {
  const fullPrompt = [
    `Create a photorealistic photograph of: ${prompt}.`,
    `Context from the video narration: "${context}".`,
    "IMPORTANT: this must look like a real photograph of the actual subject, not an illustration, cartoon, drawing, painting, or stylised art. Think high-quality stock photo or editorial image.",
    "The viewer must instantly recognise the exact thing being described. If the subject is a specific product, person, place, object, or brand, depict it accurately and literally.",
    "Composition: the subject is clearly in focus and centred, natural lighting, realistic colours, shallow depth of field, clean uncluttered background so it reads well at small sizes.",
    "Do NOT produce an illustration, cartoon, drawing, 3D render, vector art, or clip art. Real photo only.",
    "Do NOT include any text, letters, words, captions, logos of unrelated brands, or watermarks.",
  ].join(" ");

  const response = await fetch(`${NANO_BANANA_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini image API ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GeminiImageResponse;
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
  }
  return null;
}

const MAX_CONCURRENT_IMAGES = 4;

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Generate illustration overlays using Nano Banana 2 (Gemini 3.1 Flash Image).
 * Runs up to MAX_CONCURRENT_IMAGES requests in parallel — each image takes ~3-5s
 * on the wire, so concurrency is the biggest win for end-to-end render time.
 */
export async function generateIllustrations(
  operation: IllustrationOperation,
  projectDir: string,
  apiKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<GeneratedIllustration[]> {
  const illustrationsDir = join(projectDir, "illustrations");
  await mkdir(illustrationsDir, { recursive: true });

  const total = operation.illustrations.length;
  console.log(
    `[illustrations] Generating ${total} illustrations with Nano Banana (${NANO_BANANA_MODEL}), concurrency=${MAX_CONCURRENT_IMAGES}`
  );

  let completed = 0;

  const all = await runWithConcurrency(
    operation.illustrations,
    MAX_CONCURRENT_IMAGES,
    async (illust, i): Promise<GeneratedIllustration | null> => {
      console.log(
        `[illustrations] ${i + 1}/${total} START: "${illust.prompt}" (${illust.startTime.toFixed(1)}s - ${illust.endTime.toFixed(1)}s)`
      );
      try {
        const buf = await generateOneImage(apiKey, illust.prompt, illust.context ?? "");
        if (!buf) {
          console.log(`[illustrations] ${i + 1}: no image returned, skipping`);
          return null;
        }

        const imagePath = join(illustrationsDir, `illust_${i.toString().padStart(3, "0")}.png`);
        await writeFile(imagePath, buf);

        console.log(`[illustrations] ${i + 1}/${total} DONE: ${imagePath}`);
        return {
          index: i,
          startTime: illust.startTime,
          endTime: illust.endTime,
          imagePath,
          prompt: illust.prompt,
          position: illust.position,
          opacity: illust.opacity,
          animation: (illust as { animation?: "none" | "fade" | "slide" | "kenburns" }).animation,
        };
      } catch (err) {
        console.log(
          `[illustrations] ${i + 1}: generation failed:`,
          err instanceof Error ? err.message : err
        );
        return null;
      } finally {
        completed++;
        onProgress?.(completed, total);
      }
    }
  );

  const results = all.filter((r): r is GeneratedIllustration => r !== null);
  // Keep original EDL order for predictable overlay stacking
  results.sort((a, b) => a.index - b.index);
  console.log(`[illustrations] Generated ${results.length}/${total} illustrations`);
  return results;
}

/**
 * Estimate the cost of generating illustrations.
 * Nano Banana 2 (gemini-3.1-flash-image-preview): ~$0.045 per image at 1K resolution.
 */
export function estimateIllustrationCost(count: number): {
  cost: number;
  display: string;
} {
  const costPerImage = 0.045;
  const cost = count * costPerImage;
  return {
    cost,
    display: `${count} illustration${count !== 1 ? "s" : ""}: ~$${cost.toFixed(2)}`,
  };
}
