import { z } from "zod/v4";
import { protectedProcedure, router } from "../server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";

const providerSchema = z.enum(["openai", "anthropic", "gemini"]);

function maskedKeyFor(provider: string): string {
  if (provider === "openai") return "sk-...saved";
  if (provider === "anthropic") return "sk-ant-...saved";
  if (provider === "gemini") return "AIza...saved";
  return "...saved";
}

export const apiKeyRouter = router({
  // Get all saved keys (one per provider)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const result = await db
      .select({
        id: apiKeys.id,
        provider: apiKeys.provider,
        isValid: apiKeys.isValid,
        lastValidated: apiKeys.lastValidated,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, ctx.userId));

    return result.map((row) => ({
      ...row,
      hasKey: true,
      maskedKey: maskedKeyFor(row.provider),
    }));
  }),

  // Legacy: get first key (backward compat)
  get: protectedProcedure.query(async ({ ctx }) => {
    const result = await db
      .select({
        id: apiKeys.id,
        provider: apiKeys.provider,
        isValid: apiKeys.isValid,
        lastValidated: apiKeys.lastValidated,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, ctx.userId));

    if (result.length === 0) return null;

    // Return OpenAI key if exists, otherwise first key
    const openaiKey = result.find((r) => r.provider === "openai");
    const key = openaiKey ?? result[0];

    return {
      ...key,
      hasKey: true,
      maskedKey: maskedKeyFor(key.provider),
    };
  }),

  save: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1),
        provider: providerSchema.default("openai"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate key format
      if (input.provider === "openai" && !input.key.startsWith("sk-")) {
        throw new Error("OpenAI API keys start with 'sk-'");
      }
      if (
        input.provider === "anthropic" &&
        !input.key.startsWith("sk-ant-")
      ) {
        throw new Error("Anthropic API keys start with 'sk-ant-'");
      }
      if (input.provider === "gemini" && !input.key.startsWith("AIza")) {
        throw new Error("Gemini API keys start with 'AIza'");
      }

      const encrypted = encrypt(input.key);

      // Delete existing key for this provider
      await db
        .delete(apiKeys)
        .where(
          and(
            eq(apiKeys.userId, ctx.userId),
            eq(apiKeys.provider, input.provider)
          )
        );

      // Insert new key
      const result = await db
        .insert(apiKeys)
        .values({
          userId: ctx.userId,
          provider: input.provider,
          encryptedKey: encrypted.encryptedKey,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          isValid: 0,
        })
        .returning({ id: apiKeys.id });

      return { id: result[0].id };
    }),

  validate: protectedProcedure
    .input(z.object({ provider: providerSchema.default("openai") }))
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.userId, ctx.userId),
            eq(apiKeys.provider, input.provider)
          )
        )
        .limit(1);

      if (result.length === 0) {
        return {
          valid: false,
          error: `No ${input.provider} API key found. Please save one first.`,
        };
      }

      const key = decrypt({
        encryptedKey: result[0].encryptedKey,
        iv: result[0].iv,
        authTag: result[0].authTag,
      });

      try {
        let isValid = false;
        let errorMessage: string | null = null;

        if (input.provider === "openai") {
          const response = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${key}` },
          });
          isValid = response.ok;
          errorMessage = isValid
            ? null
            : response.status === 401
              ? "Invalid API key"
              : response.status === 429
                ? "Rate limited. Please try again later."
                : `API returned status ${response.status}`;
        } else if (input.provider === "anthropic") {
          const response = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
              method: "POST",
              headers: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 1,
                messages: [{ role: "user", content: "hi" }],
              }),
            }
          );
          isValid = response.ok;
          errorMessage = isValid
            ? null
            : response.status === 401
              ? "Invalid API key"
              : response.status === 429
                ? "Rate limited. Please try again later."
                : `API returned status ${response.status}`;
        } else if (input.provider === "gemini") {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
          );
          isValid = response.ok;
          errorMessage = isValid
            ? null
            : response.status === 400 || response.status === 401 || response.status === 403
              ? "Invalid API key"
              : response.status === 429
                ? "Rate limited. Please try again later."
                : `API returned status ${response.status}`;
        }

        await db
          .update(apiKeys)
          .set({
            isValid: isValid ? 1 : 0,
            lastValidated: new Date(),
          })
          .where(eq(apiKeys.id, result[0].id));

        return { valid: isValid, error: errorMessage };
      } catch {
        return {
          valid: false,
          error: `Failed to connect to ${input.provider}. Check your network.`,
        };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ provider: providerSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.provider) {
        await db
          .delete(apiKeys)
          .where(
            and(
              eq(apiKeys.userId, ctx.userId),
              eq(apiKeys.provider, input.provider)
            )
          );
      } else {
        await db.delete(apiKeys).where(eq(apiKeys.userId, ctx.userId));
      }
      return { success: true };
    }),
});
