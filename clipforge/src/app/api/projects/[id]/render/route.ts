import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, renderJobs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runRenderJob } from "@/workers/render.worker";
import { emitProgress } from "@/lib/queue/progress";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Rate limit
  const limit = checkRateLimit(
    `render:${session.user.id}`,
    { maxRequests: 5, windowMs: 60 * 60 * 1000 }
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limited. Max 5 concurrent renders per hour." },
      { status: 429 }
    );
  }

  // Validate project
  const projectRows = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, session.user.id))
    )
    .limit(1);

  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = projectRows[0];

  if (!project.editDecisionList) {
    return NextResponse.json(
      { error: "No edit plan found. Run analysis first." },
      { status: 400 }
    );
  }

  // Parse request body: disabled ops + optionally the modified EDL from the UI
  const body = await request.json();
  const disabledOps: number[] = body.disabledOps ?? [];
  const clientEdl = body.edl ?? null; // Modified EDL from caption settings panel etc.

  // Create render job
  const [job] = await db
    .insert(renderJobs)
    .values({
      projectId,
      status: "processing",
      currentStep: "Starting render...",
      startedAt: new Date(),
    })
    .returning();

  // Run render in background
  runRenderJob({
    projectId,
    userId: session.user.id,
    disabledOps,
    clientEdl,
  })
    .then(async (outputUrl) => {
      await db
        .update(renderJobs)
        .set({
          status: "completed",
          progress: 100,
          currentStep: "Render complete",
          completedAt: new Date(),
        })
        .where(eq(renderJobs.id, job.id));
    })
    .catch(async (err) => {
      const message =
        err instanceof Error ? err.message : "Render failed";

      emitProgress(projectId, {
        stage: "error",
        message,
        code: "RENDER_ERROR",
      });

      await db
        .update(renderJobs)
        .set({
          status: "failed",
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(eq(renderJobs.id, job.id));

      await db
        .update(projects)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    });

  return NextResponse.json({ jobId: job.id, status: "started" });
}
