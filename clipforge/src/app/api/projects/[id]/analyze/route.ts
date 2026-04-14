import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, apiKeys, renderJobs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { runAnalyzeJob } from "@/workers/analyze.worker";
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
    `ai:${session.user.id}`,
    RATE_LIMITS.aiOperation
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limited. Please wait before trying again." },
      { status: 429 }
    );
  }

  // Validate project belongs to user
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

  if (project.status !== "uploaded" && project.status !== "editing" && project.status !== "failed") {
    return NextResponse.json(
      { error: `Cannot analyze project with status "${project.status}"` },
      { status: 400 }
    );
  }

  // Check for API key
  const keyRows = await db
    .select({ id: apiKeys.id, isValid: apiKeys.isValid })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.userId, session.user.id), eq(apiKeys.provider, "openai"))
    )
    .limit(1);

  if (keyRows.length === 0) {
    return NextResponse.json(
      { error: "No OpenAI API key found. Please add one in Settings." },
      { status: 400 }
    );
  }

  // Parse prompt
  const body = await request.json();
  const prompt = body.prompt as string;

  if (!prompt || prompt.trim().length === 0) {
    return NextResponse.json(
      { error: "Please provide editing instructions." },
      { status: 400 }
    );
  }

  if (prompt.length > 5000) {
    return NextResponse.json(
      { error: "Prompt is too long (max 5000 characters)." },
      { status: 400 }
    );
  }

  // Create render job record
  const [job] = await db
    .insert(renderJobs)
    .values({
      projectId,
      status: "processing",
      currentStep: "Starting analysis...",
      startedAt: new Date(),
    })
    .returning();

  // Run analysis in background (not blocking the HTTP response)
  runAnalyzeJob({
    projectId,
    userId: session.user.id,
    prompt: prompt.trim(),
  })
    .then(async () => {
      await db
        .update(renderJobs)
        .set({
          status: "completed",
          progress: 100,
          currentStep: "Analysis complete",
          completedAt: new Date(),
        })
        .where(eq(renderJobs.id, job.id));
    })
    .catch(async (err) => {
      const message =
        err instanceof Error ? err.message : "Analysis failed";

      emitProgress(projectId, {
        stage: "error",
        message,
        code: "ANALYSIS_ERROR",
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
