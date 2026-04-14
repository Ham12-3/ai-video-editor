import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
  jsonb,
  real,
} from "drizzle-orm/pg-core";

// Enums
export const apiKeyProviderEnum = pgEnum("api_key_provider", [
  "openai",
  "anthropic",
  "gemini",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "uploading",
  "uploaded",
  "analyzing",
  "editing",
  "rendering",
  "completed",
  "failed",
]);

export const renderJobStatusEnum = pgEnum("render_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

// Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// API Keys (encrypted at rest)
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: apiKeyProviderEnum("provider").notNull().default("openai"),
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  isValid: integer("is_valid").default(0),
  lastValidated: timestamp("last_validated", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Projects
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Project"),
  status: projectStatusEnum("status").notNull().default("uploading"),
  sourceVideoUrl: text("source_video_url"),
  sourceVideoDuration: real("source_video_duration"),
  sourceVideoWidth: integer("source_video_width"),
  sourceVideoHeight: integer("source_video_height"),
  sourceVideoFps: real("source_video_fps"),
  sourceVideoSize: integer("source_video_size"),
  outputVideoUrl: text("output_video_url"),
  thumbnailUrl: text("thumbnail_url"),
  prompt: text("prompt"),
  editDecisionList: jsonb("edit_decision_list"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Render Jobs
export const renderJobs = pgTable("render_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: renderJobStatusEnum("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  currentStep: text("current_step"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// NextAuth accounts (for OAuth)
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
});

// NextAuth sessions
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

// NextAuth verification tokens
export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});
