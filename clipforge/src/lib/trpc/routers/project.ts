import { z } from "zod/v4";
import { protectedProcedure, router } from "../server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const projectRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(projects)
      .where(eq(projects.userId, ctx.userId))
      .orderBy(desc(projects.createdAt));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await db
        .select()
        .from(projects)
        .where(
          and(eq(projects.id, input.id), eq(projects.userId, ctx.userId))
        )
        .limit(1);

      if (result.length === 0) return null;
      return result[0];
    }),

  updatePrompt: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        prompt: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .update(projects)
        .set({ prompt: input.prompt, updatedAt: new Date() })
        .where(
          and(eq(projects.id, input.id), eq(projects.userId, ctx.userId))
        )
        .returning();

      return result[0] ?? null;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(projects)
        .where(
          and(eq(projects.id, input.id), eq(projects.userId, ctx.userId))
        );

      return { success: true };
    }),
});
