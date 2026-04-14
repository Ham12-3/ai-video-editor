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
    `Create a clear, literal illustration of: ${prompt}.`,
    `Context from the video narration: "${context}".`,
    "Show the actual subject realistically and recognizably. The viewer must instantly identify what is shown and connect it to the narration.",
    "Composition: centered subject on a clean background, bold and readable at small sizes, high contrast.",
    "Style: modern, vibrant, polished illustration suitable for overlaying on a talking-head video.",
    "Do NOT include any text, letters, words, captions, or watermarks in the image.",
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

/**
 * Generate illustration overlays using Gemini 2.5 Flash Image (Nano Banana).
 * Each illustration segment in the EDL gets a literal on-topic image.
 */
export async function generateIllustrations(
  operation: IllustrationOperation,
  projectDir: string,
  apiKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<GeneratedIllustration[]> {
  const illustrationsDir = join(projectDir, "illustrations");
  await mkdir(illustrationsDir, { recursive: true });

  const results: GeneratedIllustration[] = [];
  const total = operation.illustrations.length;

  console.log(`[illustrations] Generating ${total} illustrations with Nano Banana (${NANO_BANANA_MODEL})`);

  for (let i = 0; i < total; i++) {
    const illust = operation.illustrations[i];
    onProgress?.(i + 1, total);

    console.log(
      `[illustrations] ${i + 1}/${total}: "${illust.prompt}" (${illust.startTime.toFixed(1)}s - ${illust.endTime.toFixed(1)}s)`
    );

    try {
      const buf = await generateOneImage(apiKey, illust.prompt, illust.context ?? "");
      if (!buf) {
        console.log(`[illustrations] ${i + 1}: no image returned, skipping`);
        continue;
      }

      const imagePath = join(illustrationsDir, `illust_${i.toString().padStart(3, "0")}.png`);
      await writeFile(imagePath, buf);

      results.push({
        index: i,
        startTime: illust.startTime,
        endTime: illust.endTime,
        imagePath,
        prompt: illust.prompt,
        position: illust.position,
        opacity: illust.opacity,
      });

      console.log(`[illustrations] ${i + 1}: saved to ${imagePath}`);
    } catch (err) {
      console.log(
        `[illustrations] ${i + 1}: generation failed:`,
        err instanceof Error ? err.message : err
      );
      // Non-fatal, skip this illustration
    }
  }

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
