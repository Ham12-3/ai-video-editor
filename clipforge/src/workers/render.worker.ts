import { join } from "path";
import { readFile } from "fs/promises";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { renderVideo } from "@/lib/video/render";
import type { EditDecisionList } from "@/types/edl";

interface RenderJobInput {
  projectId: string;
  userId: string;
  disabledOps: number[];
  clientEdl?: EditDecisionList | null; // Modified EDL from the UI (caption settings etc.)
}

export async function runRenderJob(data: RenderJobInput): Promise<string> {
  const { projectId, userId, disabledOps, clientEdl } = data;

  console.log(`[render] Starting render for project ${projectId}`);
  console.log(`[render] Disabled ops:`, disabledOps);
  console.log(`[render] Client EDL provided: ${!!clientEdl}`);

  // Get the project
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (projectRows.length === 0) {
    throw new Error("Project not found");
  }

  const project = projectRows[0];

  if (!project.editDecisionList && !clientEdl) {
    throw new Error("No edit decision list found. Run analysis first.");
  }

  // Use the client EDL if provided (has user's caption customizations),
  // but preserve _meta from the database EDL (has silence/filler timestamps)
  const dbEdl = project.editDecisionList as (EditDecisionList & { _meta?: Record<string, unknown> }) | null;

  let edl: EditDecisionList & { _meta?: Record<string, unknown> };
  if (clientEdl) {
    // Merge: use client operations (with updated caption settings) + db _meta (with timestamps)
    edl = {
      ...clientEdl,
      _meta: dbEdl?._meta ?? {},
    };
    console.log(`[render] Using client EDL with ${edl.operations.length} operations (merged with DB _meta)`);
  } else {
    edl = dbEdl!;
    console.log(`[render] Using database EDL with ${edl.operations.length} operations`);
  }

  console.log(`[render] Operations:`, edl.operations.map((op, i) => `${i}:${op.type}`).join(", "));

  // Log caption details if present
  const captionOp = edl.operations.find((op) => op.type === "caption");
  if (captionOp && captionOp.type === "caption") {
    console.log(`[render] Caption settings:`, JSON.stringify({
      style: captionOp.style,
      fontFamily: captionOp.fontFamily,
      fontWeight: captionOp.fontWeight,
      fontSize: captionOp.fontSize,
      fontColor: captionOp.fontColor,
      borderStyle: captionOp.borderStyle,
      outlineWidth: captionOp.outlineWidth,
    }));
  }

  // Update project status
  await db
    .update(projects)
    .set({ status: "rendering", updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Load word timestamps from the transcription
  let words: Array<{ word: string; start: number; end: number }> = [];

  try {
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
    const transcriptPath = join(uploadDir, userId, projectId, "transcript.json");
    const transcriptData = await readFile(transcriptPath, "utf-8");
    const transcript = JSON.parse(transcriptData);
    words = transcript.words ?? [];
    console.log(`[render] Loaded transcript with ${words.length} words`);
  } catch (err) {
    console.log(`[render] WARNING: Failed to load transcript:`, err instanceof Error ? err.message : err);
    console.log(`[render] Captions will NOT work without transcript`);
  }

  // Run the render
  const outputUrl = await renderVideo({
    projectId,
    userId,
    edl,
    disabledOps,
    words,
  });

  return outputUrl;
}
