# ClipForge Architecture

## System Overview

ClipForge is a monolithic Next.js 16 application that combines the web frontend, API
layer, and video processing workers in a single process (for development). In production,
the workers would run as separate services connected via Redis/BullMQ.

```
Browser                    Next.js Server                External Services
  |                            |                              |
  |-- Upload video ----------->|-- Save to disk                |
  |                            |-- Extract metadata (FFmpeg)   |
  |                            |                               |
  |-- "Process Video" -------->|-- Create render job            |
  |                            |-- Start analysis worker:       |
  |<-- SSE progress stream ----|   |                            |
  |                            |   |-- Extract audio (FFmpeg) ->|
  |                            |   |-- Transcribe (Whisper) --->|-- OpenAI API
  |                            |   |-- Extract frames (FFmpeg)->|
  |                            |   |-- Analyze (GPT-4.1) ----->|-- OpenAI API
  |                            |   |-- Save EDL to DB          |
  |                            |                               |
  |-- "Render Video" -------->|-- Create render job             |
  |<-- SSE progress stream ---|   |                             |
  |                           |   |-- Generate ASS subtitles    |
  |                           |   |-- Build FFmpeg command      |
  |                           |   |-- Execute FFmpeg            |
  |                           |   |-- Save output.mp4           |
  |                           |                                 |
  |-- Download MP4 <----------|-- Serve with Range support      |
```

## Request Flow

### Authentication
- NextAuth v5 with JWT strategy (no database sessions)
- Credentials provider: bcrypt-hashed passwords in `users` table
- Google OAuth: manual user creation in `signIn` callback
- `proxy.ts` (Next.js 16 middleware replacement) checks for session cookie on protected routes
- tRPC context calls `auth()` with `await headers()` to read cookies in route handlers

### Video Upload
1. Client validates file type (magic bytes checked server-side) and size
2. XHR POST to `/api/upload` with FormData (progress via `upload.onprogress`)
3. Server creates project record, saves file to `uploads/{userId}/{projectId}/source.mp4`
4. FFmpeg extracts metadata (duration, resolution, fps) and generates thumbnail
5. Client redirects to project editor page

### AI Analysis Pipeline
1. `POST /api/projects/[id]/analyze` validates auth, rate limits, creates render_job
2. `runAnalyzeJob()` runs asynchronously (fire-and-forget from the HTTP handler)
3. Progress emitted to in-memory pub/sub (`emitProgress`)
4. SSE endpoint (`GET /api/sse/[projectId]`) subscribes to progress events
5. Pipeline steps:
   - Audio extraction: `ffmpeg -i source.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav`
   - Silence detection: `ffmpeg -af silencedetect=noise=-30dB:d=0.5`
   - Whisper transcription: `whisper-1` model, verbose_json with word+segment timestamps
   - Filler word detection: regex scan of word timestamps for "um", "uh", "like", etc.
   - Frame extraction: scene-change detection with fallback to 0.5fps, max 30 frames
   - GPT-4.1 analysis: frames + transcript + silences + prompt, structured JSON output
6. EDL saved to `projects.edit_decision_list` (JSONB), transcript saved to disk

### FFmpeg Rendering
1. `POST /api/projects/[id]/render` creates render_job, runs `runRenderJob()` async
2. Subtitle generation: word timestamps shifted by trim offset, grouped into 2-4 word chunks
3. FFmpeg command built from EDL operations:
   - Trim: `-ss` / `-to` input seeking
   - Speed: `setpts=N*PTS` + chained `atempo` filters
   - Captions: `subtitles=path/captions.ass` filter
   - Reframe: `crop=W:H:X:Y,scale=1080:1920`
   - Cuts: `select='between(t,s,e)+...',setpts=N/FRAME_RATE/TB`
4. Output: H.264 CRF 23, AAC 128k, MP4 with faststart
5. Progress parsed from FFmpeg stderr `time=HH:MM:SS.xx`

## Database Schema

```sql
users (id UUID PK, email, name, password_hash, avatar_url, created_at)
api_keys (id UUID PK, user_id FK, provider, encrypted_key, iv, auth_tag, is_valid, last_validated)
projects (id UUID PK, user_id FK, title, status, source_video_url, duration, width, height,
          fps, size, output_video_url, thumbnail_url, prompt, edit_decision_list JSONB)
render_jobs (id UUID PK, project_id FK, status, progress, current_step, error_message, started_at)
accounts (id UUID PK, user_id FK, type, provider, provider_account_id, tokens...)
sessions (id UUID PK, session_token, user_id FK, expires)
verification_tokens (identifier, token, expires)
```

Status enums:
- Projects: uploading, uploaded, analyzing, editing, rendering, completed, failed
- Render jobs: queued, processing, completed, failed

## Edit Decision List (EDL)

The EDL is the contract between AI analysis and FFmpeg rendering. GPT-4.1 generates it
as structured JSON (OpenAI `response_format: json_schema`).

```typescript
interface EditDecisionList {
  version: "1.0";
  sourceVideo: { duration, fps, width, height };
  operations: EditOperation[];     // 7 types: trim, cut, caption, speed,
                                   // silence_remove, reframe, transition
  reasoning: string;               // AI explains its decisions
  estimatedOutputDuration: number;
}
```

Each operation type has specific fields. The frontend lets users toggle individual
operations on/off before rendering. Disabled operation indices are passed to the
render API.

## Subtitle System (ASS Format)

Generated from Whisper word-level timestamps:
- Words grouped into 2-4 word chunks (max 2.0s each)
- Font: Arial Black, bold
- Outline: 4px black, 2px drop shadow
- Position: MarginV=480 on 1920px canvas (3/4 from top, not bottom edge)
- Karaoke: `\kf` tags for smooth progressive word fill
- Word-by-word: individual word display with pop-in scale animation
- Standard: fade in/out transitions

Timeline adjustments applied when trim or speed operations shift timestamps.

## Security Model

- API keys: AES-256-GCM, encryption key from env var, server-only module
- Uploads: magic byte validation, not just extension checks
- Authorization: user ID checked on every DB query (row-level)
- File serving: path traversal prevention, user can only access own files
- FFmpeg: commands built programmatically, never from string concatenation
- Rate limiting: in-memory (10 uploads/hr, 20 AI ops/hr, 5 renders/hr)
- Proxy: session cookie checked on all non-public routes

## Production Considerations

Currently local-dev only. For production:

| Component | Local | Production |
|-----------|-------|-----------|
| App host | `npm run dev` | Docker on Railway/Fly.io |
| Database | Docker PostgreSQL | Neon (serverless PostgreSQL) |
| Redis | Docker Redis | Upstash Redis |
| Storage | `./uploads/` filesystem | AWS S3 or Cloudflare R2 |
| Workers | In-process (async) | Separate BullMQ worker service |
| Progress | In-memory pub/sub | Redis pub/sub |
| FFmpeg | System install | Docker image with FFmpeg |

The database client would need to switch back to `@neondatabase/serverless` for
production (Neon requires WebSocket connections from serverless environments).
