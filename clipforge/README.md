# ClipForge

AI-powered video editor for short-form content (TikTok, Instagram Reels, YouTube Shorts). Upload a video, describe the edits you want in natural language, and ClipForge analyzes your video with AI, generates an edit plan, and renders the final output using FFmpeg. Powered by your own OpenAI API key, so you control the costs.

## What It Does

1. **Upload** a video (MP4, MOV, WebM, AVI up to 500MB)
2. **Describe** the edit: "Remove silences, add karaoke captions, reframe to 9:16 for TikTok"
3. **AI analyzes** the video: extracts audio, transcribes with Whisper, detects silences and filler words, extracts keyframes, sends everything to GPT-4.1 for understanding
4. **Review** the edit plan: see what the AI decided, toggle operations on/off, refine with follow-up prompts
5. **Render** the final video with FFmpeg: captions burned in, silences cut, speed adjusted, reframed
6. **Download** or iterate: compare side-by-side, edit further, or start a new project

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI) |
| Database | PostgreSQL 16 (local Docker, Neon for production) |
| ORM | Drizzle ORM 0.45 |
| API Layer | tRPC v11 (type-safe client/server) |
| Auth | NextAuth.js v5 (JWT sessions, Credentials + Google OAuth) |
| AI | OpenAI GPT-4.1 (vision + structured output), Whisper (transcription) |
| Video | FFmpeg 7.x (audio extraction, frame extraction, silence detection, rendering) |
| Subtitles | ASS format with karaoke highlighting, word-by-word, sentence modes |
| Queue | BullMQ on Redis 7 (job queue for async processing) |
| Real-time | Server-Sent Events (SSE) for progress streaming |
| Storage | Local filesystem (dev), S3-compatible (production) |
| Encryption | AES-256-GCM for API key encryption at rest |

## Prerequisites

- **Node.js 20+**
- **Docker Desktop** (for PostgreSQL and Redis)
- **FFmpeg 5+** installed and on PATH (`ffmpeg -version` and `ffprobe -version` should work)

## Setup

### 1. Install dependencies

```bash
cd clipforge
npm install
```

### 2. Start databases

```bash
docker compose up -d
```

This starts PostgreSQL 16 and Redis 7 with health checks and persistent volumes.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `ENCRYPTION_KEY` in `.env.local`. The other defaults work for local dev.

### 4. Push database schema

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/clipforge" npm run db:push
```

### 5. Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000**.

### 6. First run

1. Sign up at `/sign-up` with email and password
2. Go to **Settings**, paste your OpenAI API key (starts with `sk-`), click Save, then Test
3. Click **New Project**, upload a video
4. Type a prompt and click **Process Video**
5. Review the AI edit plan, then click **Render Video**
6. Download the result or iterate

## Project Structure

```
clipforge/
  src/
    app/
      (auth)/                 # Sign-in, sign-up pages
      (dashboard)/            # Protected routes
        projects/             # Project list, editor, upload
        settings/             # API key management
      api/
        auth/[...nextauth]/   # NextAuth route handler
        projects/[id]/
          analyze/            # POST: start AI analysis
          render/             # POST: start FFmpeg render
        sse/[projectId]/      # GET: SSE progress stream
        trpc/[trpc]/          # tRPC route handler
        upload/               # POST: video upload
        video/[...path]/      # GET: serve video files (Range support)
      actions/auth.ts         # Server action for sign-up
    components/
      ui/                     # shadcn/ui components (14 components)
      editor/                 # Progress steps, EDL viewer, cost dialog,
                              # render progress, completed view
      layout/                 # Sidebar navigation
    lib/
      ai/
        analyze.ts            # GPT-4.1 vision analysis with structured output
        cost.ts               # Token counting, cost estimation (GPT-4.1 pricing)
        prompts.ts            # System prompt for video analysis
        transcribe.ts         # Whisper transcription + filler word detection
      db/
        schema.ts             # Drizzle schema: users, api_keys, projects,
                              # render_jobs, accounts, sessions
        index.ts              # Database connection (pg driver)
      queue/
        index.ts              # BullMQ queue setup
        progress.ts           # In-memory pub/sub for SSE progress
        redis.ts              # Redis connection factory
      video/
        extract.ts            # Audio extraction, silence detection,
                              # keyframe extraction, frame-to-base64
        ffmpeg.ts             # EDL-to-FFmpeg command builder
        metadata.ts           # Video metadata + thumbnail generation
        render.ts             # Full render pipeline (subtitles, FFmpeg, output)
        subtitles.ts          # ASS subtitle generator (karaoke, word-by-word)
      auth.ts                 # NextAuth v5 config (JWT, Credentials, Google)
      encryption.ts           # AES-256-GCM encrypt/decrypt (server-only)
      rate-limit.ts           # In-memory rate limiter
      validators.ts           # Zod v4 schemas for all inputs
    types/
      edl.ts                  # Edit Decision List type definitions
      events.ts               # SSE progress event types
      next-auth.d.ts          # NextAuth session type augmentation
    workers/
      analyze.worker.ts       # Full analysis pipeline
      render.worker.ts        # Render job runner
  uploads/                    # Video storage (gitignored)
  drizzle/                    # Database migrations
  docker-compose.yml          # PostgreSQL 16 + Redis 7
  PROMPTS.md                  # Test prompts for the AI editor
```

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, name, password hash) |
| `api_keys` | Encrypted OpenAI API keys (AES-256-GCM) |
| `projects` | Video projects (status, metadata, EDL, video URLs) |
| `render_jobs` | Processing job tracking (progress, errors) |
| `accounts` | OAuth account links (Google) |
| `sessions` | Auth sessions |
| `verification_tokens` | Email verification |

## AI Pipeline

The analysis pipeline runs these steps in order, streaming progress via SSE:

1. **Audio extraction**: FFmpeg extracts 16kHz mono WAV from the video
2. **Silence detection**: FFmpeg `silencedetect` filter finds gaps > 0.5s
3. **Transcription**: OpenAI Whisper with word-level and segment timestamps
4. **Filler word detection**: Scans transcript for "um", "uh", "like", "you know", etc.
5. **Frame extraction**: Scene-change detection (fallback: 1 frame per 2s), capped at 30 frames
6. **GPT-4.1 analysis**: Frames + transcript + silences + filler words + user prompt sent to GPT-4.1 with structured JSON output, producing an Edit Decision List (EDL)

The EDL supports these operations:
- **trim**: Keep a time range
- **cut**: Remove specific segments
- **caption**: Karaoke, word-by-word, sentence, or minimal subtitles
- **speed**: Playback speed changes with pitch preservation
- **silence_remove**: Cut silent portions and filler words
- **reframe**: Aspect ratio change (9:16, 1:1, 4:5) with center-crop
- **transition**: Crossfade between segments (planned)

## Rendering Pipeline

The render pipeline converts the EDL into FFmpeg commands:

1. **Subtitle generation**: ASS format with karaoke `\kf` tags, Arial Black font, thick outline, positioned at 3/4 screen height for mobile readability
2. **FFmpeg command building**: Combines trim, speed, crop, scale, subtitle burn-in into a single pass
3. **FFmpeg execution**: Progress parsed from stderr `time=` output, streamed via SSE
4. **Output**: H.264/AAC MP4 with faststart flag for web streaming

## API Key Security

Users provide their own OpenAI API key. Keys are:

- Encrypted with AES-256-GCM before storage (encryption key from env var)
- Decrypted only server-side when making API calls
- Never sent to the browser, exposed in logs, or included in API responses
- Deletable at any time from the Settings page
- The encryption module is marked `server-only` and cannot be imported in client code

## Cost Model

All AI costs are charged to the user's own OpenAI account. Before each operation, ClipForge shows:

- Number of frames being analyzed
- Estimated token count and cost
- A confirm/cancel dialog

After the operation, actual tokens used and cost are displayed.

**Approximate costs per video** (60s video):
- Whisper transcription: ~$0.006
- GPT-4.1 analysis (30 frames): ~$0.02
- Total: ~$0.03 per analysis

## Environment Variables

See `.env.example` for all variables. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `NEXTAUTH_SECRET` | Yes | Random secret for JWT signing |
| `NEXTAUTH_URL` | Yes | App URL (http://localhost:3000 for dev) |
| `ENCRYPTION_KEY` | Production | 64-char hex string for AES-256-GCM |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `UPLOAD_DIR` | No | Upload directory (default: ./uploads) |
| `MAX_UPLOAD_SIZE` | No | Max upload bytes (default: 500MB) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Drizzle Studio (database browser) |
