# ClipForge - AI Video Editor

AI-powered short-form video editor. Users upload videos, describe edits in natural
language, and the app analyzes with GPT-4.1 + Whisper, generates an edit plan (EDL),
and renders via FFmpeg.

## Project layout

All source code lives in `clipforge/` (Next.js 16 project).

- `src/lib/ai/` -- OpenAI integration (GPT-4.1 analysis, Whisper transcription, cost estimation)
- `src/lib/video/` -- FFmpeg operations (extract, render, subtitles, metadata)
- `src/lib/db/` -- Drizzle ORM schema and database client (PostgreSQL via pg driver)
- `src/lib/queue/` -- BullMQ queue setup and in-memory progress pub/sub for SSE
- `src/lib/auth.ts` -- NextAuth v5 with JWT sessions, Credentials + Google OAuth
- `src/lib/encryption.ts` -- AES-256-GCM API key encryption (server-only)
- `src/workers/` -- Analysis and render workers (run in-process for dev)
- `src/components/editor/` -- Progress steps, EDL viewer, cost dialog, render progress, completed view
- `src/types/edl.ts` -- Edit Decision List types (7 operation types)

## Key technical decisions

- Next.js 16: uses `proxy.ts` instead of `middleware.ts`, all params/cookies are async
- Database: `pg` driver for local dev (not @neondatabase/serverless which needs WebSocket)
- Auth: No DrizzleAdapter, JWT strategy only, Google OAuth handled manually in signIn callback
- AI model: GPT-4.1 (not 4o), structured JSON output for EDL generation
- Subtitles: ASS format, karaoke mode uses `\kf` tags, positioned at 3/4 screen height
- FFmpeg: `subtitles=` filter for burn-in (not `ass=`), paths escaped for Windows
- Upload limit: 500MB, configured via `experimental.proxyClientMaxBodySize` in next.config.ts
- Zod v4: imports from `zod/v4`

## Common issues

- FFmpeg filter quoting on Windows: use `.videoFilter()` method, not `-vf` in outputOptions
- Scene detection comma: must escape as `select=gt(scene\\,0.3)` in fluent-ffmpeg
- OpenAI structured output: every nested object MUST have a `required` array listing ALL properties
- Subtitle timing with trim: subtract `trimStart` from all word timestamps before generating ASS

## Running locally

1. `docker compose up -d` (PostgreSQL + Redis)
2. `DATABASE_URL="postgresql://user:password@localhost:5432/clipforge" npm run db:push`
3. `npm run dev`
4. Sign up, add OpenAI API key in Settings, upload video, process

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming -> invoke office-hours
- Bugs, errors, "why is this broken", 500 errors -> invoke investigate
- Ship, deploy, push, create PR -> invoke ship
- QA, test the site, find bugs -> invoke qa
- Code review, check my diff -> invoke review
- Update docs after shipping -> invoke document-release
- Weekly retro -> invoke retro
- Design system, brand -> invoke design-consultation
- Visual audit, design polish -> invoke design-review
- Architecture review -> invoke plan-eng-review
- Save progress, checkpoint, resume -> invoke checkpoint
- Code quality, health check -> invoke health
