import { z } from "zod/v4";

// Auth validators
export const signUpSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
});

export const signInSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// API key validators
export const apiKeySchema = z.object({
  key: z
    .string()
    .min(1, "API key is required")
    .regex(/^sk-/, "OpenAI API keys start with 'sk-'"),
  provider: z.literal("openai").default("openai"),
});

// Project validators
export const createProjectSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title is too long")
    .default("Untitled Project"),
});

export const updateProjectPromptSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1, "Prompt is required").max(5000, "Prompt is too long"),
});

// Upload validators
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
] as const;

export const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".webm", ".avi"] as const;

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ApiKeyInput = z.infer<typeof apiKeySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
