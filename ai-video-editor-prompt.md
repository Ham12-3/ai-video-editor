# Claude Code Prompt: AI Video Editor for Short-Form Content

## IMPORTANT: Build this in phases. Start with Phase 1 and only move to the next phase when the current one is fully working and tested.

---

## Phase 1: Project Foundation, Auth, and Upload Pipeline

Build a full-stack web application called "ClipForge" (or suggest a better name), an AI-powered video editor for short-form content (TikTok, Instagram Reels, YouTube Shorts). Users upload a video, write a natural language prompt describing what edits they want, and the AI processes and edits the video automatically.

### Tech Stack

- **Frontend**: Next.js 15 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend**: Next.js API routes + tRPC for type-safe API layer
- **Database**: PostgreSQL on Neon + Drizzle ORM
- **Job Queue**: BullMQ on Redis (use Upstash Redis or local Redis for dev)
- **Video Processing**: FFmpeg (fluent-ffmpeg wrapper)
- **AI Engine**: OpenAI API (users provide their own API key)
- **Object Storage**: Local filesystem for dev, S3-compatible for production
- **Real-time Updates**: Server-Sent Events (SSE)
- **Auth**: NextAuth.js v5 (Auth.js) with email/password + Google OAuth

### CRITICAL: User-Provided API Key Model

This is NOT a managed AI SaaS. Users bring their own OpenAI API key. This means:

1. Settings page where users input and save their OpenAI API key
2. API keys are encrypted at rest using AES-256-GCM before storing in the database
3. Keys are decrypted only server-side when making OpenAI API calls
4. A "Test API Key" button that makes a minimal OpenAI call to validate the key
5. All AI features are gated behind having a valid API key set
6. Show clear cost estimates before running AI operations (e.g., "This will use approximately 50K tokens, costing ~$0.03")
7. If the API key is invalid or has insufficient credits, show a clear error and do not retry

### Phase 1 Deliverables

1. **Next.js 15 project scaffolding** with App Router, TypeScript strict mode, Tailwind CSS v4, and shadcn/ui components installed
2. **Database schema** (Drizzle ORM + Neon PostgreSQL):
   - `users` table: id, email, name, passwordHash, avatarUrl, createdAt
   - `api_keys` table: id, userId, provider (enum: 'openai'), encryptedKey, iv, isValid, lastValidated, createdAt
   - `projects` table: id, userId, title, status (enum: 'uploading', 'uploaded', 'analyzing', 'editing', 'rendering', 'completed', 'failed'), sourceVideoUrl, sourceVideoDuration, sourceVideoWidth, sourceVideoHeight, outputVideoUrl, thumbnailUrl, prompt, editDecisionList (jsonb), createdAt, updatedAt
   - `render_jobs` table: id, projectId, status (enum: 'queued', 'processing', 'completed', 'failed'), progress (0-100), currentStep, errorMessage, startedAt, completedAt, createdAt
3. **Authentication flow**: Sign up, sign in, sign out, password reset, Google OAuth
4. **Dashboard page**: Lists all user projects with status badges, thumbnail previews, and creation dates. Empty state for new users.
5. **Settings page**: API key management with encryption, validation, and a clear explainer about why the key is needed and that it never leaves the server
6. **Video upload flow**:
   - Drag-and-drop upload zone accepting .mp4, .mov, .webm, .avi (max 500MB)
   - Client-side validation for file type and size before upload
   - Upload progress bar using chunked upload (tus protocol or multipart)
   - After upload, extract video metadata using FFmpeg (duration, resolution, fps, codec)
   - Generate a thumbnail at the 2-second mark using FFmpeg
   - Store the video in `/uploads/{userId}/{projectId}/source.mp4`
   - Redirect to the project editor page after upload completes
7. **Project editor page** (basic shell for now):
   - Video player showing the source video (use HTML5 video element)
   - Text input area for the editing prompt
   - "Process Video" button (disabled until Phase 2)
   - Project metadata sidebar (duration, resolution, file size)
8. **BullMQ setup**:
   - Redis connection configuration (env vars for local and Upstash)
   - A `video-processing` queue with worker scaffolding
   - Job status polling endpoint or SSE endpoint for real-time progress
9. **Environment configuration**:
   - `.env.example` with all required variables documented
   - `ENCRYPTION_KEY` for API key encryption (auto-generated if missing in dev)
   - `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional)
   - `UPLOAD_DIR` defaulting to `./uploads`

### Design Direction

Make the UI dark-themed, modern, and professional. Think linear.app or Vercel dashboard aesthetics. Clean typography, generous spacing, subtle animations on page transitions and button interactions. The editor page should feel like a professional tool, not a toy.

Do NOT use generic AI aesthetics (purple gradients, generic sans-serif fonts). Pick a distinctive color palette with a strong accent color. Use a quality display font for headings.

### Code Quality Requirements

- All components must be TypeScript with strict types, no `any`
- Server actions for mutations, tRPC for queries
- Proper error boundaries and loading states
- Mobile-responsive layout
- Proper form validation using zod schemas
- All database operations through Drizzle ORM with proper error handling
- API key encryption/decryption as a server-only utility (never imported client-side)
- Rate limiting on upload and API key validation endpoints
- Do not use emdashes anywhere in UI copy or comments. Use commas, periods, or semicolons instead.
- Use well-spaced formatting throughout

---

## Phase 2: AI Analysis Pipeline

Once Phase 1 is fully working, build the AI video analysis pipeline.

### Audio Extraction and Transcription

1. When a user clicks "Process Video", create a render job in the database and add it to the BullMQ queue
2. The worker extracts audio from the video using FFmpeg:
   ```
   ffmpeg -i source.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio.wav
   ```
3. Send the audio to OpenAI Whisper API (`whisper-1` model) with `timestamp_granularities: ["word", "segment"]` and `response_format: "verbose_json"`
4. Parse the response to get word-level timestamps for caption sync and segment-level timestamps for scene understanding
5. Detect silence segments using FFmpeg's `silencedetect` filter:
   ```
   ffmpeg -i audio.wav -af silencedetect=noise=-30dB:d=0.5 -f null -
   ```
6. Detect filler words ("um", "uh", "like", "you know", "basically", "actually", "so", "right") from the transcript word timestamps

### Frame Extraction for Vision Analysis

1. Use scene-change detection to extract only unique keyframes, not uniform sampling:
   ```
   ffmpeg -i source.mp4 -vf "select='gt(scene,0.3)',scale=768:-1" -vsync vfr -q:v 5 frames/frame_%04d.jpg
   ```
2. Fall back to 1 frame per 2 seconds if scene detection produces fewer than 5 frames:
   ```
   ffmpeg -i source.mp4 -vf "fps=0.5,scale=768:-1" -q:v 5 frames/frame_%04d.jpg
   ```
3. Convert extracted frames to base64 for the OpenAI API
4. Cap at 30 frames maximum per analysis to control costs (for 60s video this is more than enough)

### GPT-4o Video Understanding

1. Send the frames + transcript + user prompt to GPT-4o in a single API call
2. The system prompt should provide:
   - Full transcript with word-level timestamps
   - Silence segments with timestamps
   - Detected filler words with timestamps
   - Video metadata (duration, resolution, fps)
   - A list of available edit operations (see EDL schema below)
3. Use OpenAI Structured Outputs (`response_format: { type: "json_schema", json_schema: {...} }`) to guarantee the response matches the EDL schema
4. Before making the API call, calculate and show the estimated token count and cost to the user via the SSE progress stream

### Edit Decision List (EDL) Schema

```typescript
interface EditDecisionList {
  version: "1.0";
  sourceVideo: {
    duration: number; // seconds
    fps: number;
    width: number;
    height: number;
  };
  operations: EditOperation[];
  reasoning: string; // AI explains what it decided and why
  estimatedOutputDuration: number; // seconds
}

type EditOperation =
  | TrimOperation
  | CutOperation
  | CaptionOperation
  | SpeedOperation
  | SilenceRemoveOperation
  | ReframeOperation
  | TransitionOperation;

interface TrimOperation {
  type: "trim";
  startTime: number; // seconds, millisecond precision
  endTime: number;
  reason: string;
}

interface CutOperation {
  type: "cut";
  segments: Array<{
    startTime: number;
    endTime: number;
    reason: string;
  }>;
}

interface CaptionOperation {
  type: "caption";
  style: "karaoke" | "word-by-word" | "sentence" | "minimal";
  position: "bottom-center" | "top-center" | "center";
  fontSize: "small" | "medium" | "large";
  fontColor: string; // hex
  backgroundColor: string; // hex with alpha
  animation: "none" | "fade" | "bounce" | "typewriter";
}

interface SpeedOperation {
  type: "speed";
  segments: Array<{
    startTime: number;
    endTime: number;
    factor: number; // 0.5 = half speed, 2.0 = double speed
    preservePitch: boolean;
  }>;
}

interface SilenceRemoveOperation {
  type: "silence_remove";
  minSilenceDuration: number; // seconds, remove silences longer than this
  padding: number; // seconds, keep this much silence on each side
  removeFiller: boolean; // also remove filler words
  fillerWords: string[]; // which filler words to target
}

interface ReframeOperation {
  type: "reframe";
  targetAspectRatio: "9:16" | "1:1" | "4:5";
  trackingMode: "face" | "center" | "smart";
}

interface TransitionOperation {
  type: "transition";
  between: Array<{
    atTime: number; // seconds
    style: "crossfade" | "cut" | "swipe" | "zoom";
    duration: number; // seconds
  }>;
}
```

### SSE Progress Updates

Stream progress updates to the frontend via Server-Sent Events:

```typescript
// Progress event types
type ProgressEvent =
  | { stage: "extracting_audio"; progress: number }
  | { stage: "transcribing"; progress: number }
  | { stage: "extracting_frames"; progress: number; frameCount: number }
  | { stage: "analyzing"; progress: number; estimatedCost: string }
  | { stage: "generating_edl"; progress: number }
  | { stage: "edl_complete"; edl: EditDecisionList }
  | { stage: "error"; message: string; code: string };
```

### Phase 2 Frontend Updates

1. Update the project editor page:
   - Show a multi-step progress indicator during analysis (audio extraction > transcription > frame analysis > AI thinking > EDL generated)
   - Each step shows a progress bar and current status text
   - When analysis completes, display the EDL in a human-readable format:
     - A timeline visualization showing where cuts, speed changes, and captions will be applied
     - The AI's reasoning text explaining its decisions
     - Estimated output duration
     - Estimated API cost that was incurred
   - "Edit Operations" panel where users can toggle individual operations on/off
   - "Refine" text input where users can type follow-up instructions like "keep the pause at 0:45" or "make captions bigger"
   - "Render Video" button to proceed to Phase 3

### Cost Display

Before any AI operation, show the user:
- Estimated number of frames being sent
- Estimated token count (frames + transcript + system prompt)
- Estimated cost in USD based on current OpenAI pricing
- A confirm/cancel dialog

After the operation, show:
- Actual tokens used (from the API response `usage` field)
- Actual cost incurred

---

## Phase 3: FFmpeg Rendering Pipeline

Once Phase 2 is working and producing valid EDLs, build the rendering pipeline.

### FFmpeg Command Generation

Build a module that converts an EDL into FFmpeg commands. This is the most complex part. The module should:

1. **Parse the EDL** and determine which operations can be combined into a single FFmpeg pass
2. **Silence/filler removal**: Use `select` and `aselect` filters to keep only non-silent, non-filler segments. Add 0.15s crossfade between cuts to prevent jarring transitions:
   ```
   ffmpeg -i input.mp4 -vf "select='...',setpts=N/FRAME_RATE/TB" -af "aselect='...',asetpts=N/SR/TB" output.mp4
   ```
3. **Speed changes**: Apply `setpts` for video and `atempo` for audio (chain multiple atempo filters for extreme speed changes since atempo only supports 0.5-2.0):
   ```
   -vf "setpts=0.5*PTS" -af "atempo=2.0"
   ```
4. **Captions**: Generate an ASS subtitle file from the Whisper transcript with the style specified in the EDL, then burn in using:
   ```
   -vf "ass=captions.ass"
   ```
   Support karaoke-style highlighting using ASS `\k` tags for word-by-word highlight timing
5. **Reframing**: Calculate crop coordinates based on face detection (use FFmpeg's `cropdetect` or a simple center-crop for MVP). Apply:
   ```
   -vf "crop=ih*9/16:ih:x:0,scale=1080:1920"
   ```
6. **Transitions**: Use `xfade` filter for crossfades between segments
7. **Combine all filters** into a single `filter_complex` graph where possible to avoid multiple encoding passes

### ASS Subtitle Generation

Build a subtitle generator that:

1. Takes Whisper word-level timestamps and the EDL caption style
2. Groups words into display chunks (3-5 words, max 2.5 seconds per chunk)
3. Generates ASS format with:
   - Font: Bold sans-serif (configurable)
   - Outline and shadow for readability
   - Position based on EDL (`bottom-center` = `\an2`, etc.)
   - Karaoke mode: uses `\k` duration tags for per-word highlight timing
   - Bounce animation: uses `\t` transform on `\fscx`/`\fscy` for the active word
4. Adjusts timestamps if silence removal or speed changes modified the timeline

### Rendering Pipeline

1. When the user clicks "Render Video", create a new render job
2. The BullMQ worker processes the job:
   a. Generate ASS subtitle file if captions are in the EDL
   b. Build the FFmpeg filter graph from the EDL
   c. Execute FFmpeg with progress parsing (parse the `time=` output for progress percentage)
   d. Stream progress via SSE to the frontend
3. On completion:
   - Save the output to `/uploads/{userId}/{projectId}/output.mp4`
   - Generate an output thumbnail
   - Update project status to `completed`
   - Calculate output file size and duration
4. On failure:
   - Log the FFmpeg error output
   - Set project status to `failed` with error message
   - Allow retry

### Phase 3 Frontend Updates

1. Render progress view:
   - Progress bar showing FFmpeg rendering progress (0-100%)
   - Current rendering step description
   - Elapsed time and estimated time remaining
   - Cancel button to abort the render
2. Completed view:
   - Side-by-side video player: original vs. edited
   - Output metadata (duration, file size, resolution)
   - Download button for the rendered video
   - "Edit Further" button that goes back to the prompt input with context
   - "New Project" button
3. Export options:
   - Download as MP4
   - Copy share link (if you implement public links later)
   - Quick re-export at different resolutions (1080p, 720p, 480p)

---

## Phase 4: Iterative Editing and Polish

Once Phase 3 renders working videos, add iterative editing and polish.

### Iterative Editing

1. After a video is rendered, the user can type a follow-up prompt like:
   - "Remove the section from 0:15 to 0:25"
   - "Make the captions yellow instead of white"
   - "Speed up the intro by 1.5x"
   - "Actually keep the filler words, they feel natural"
2. Send the current EDL + new prompt + video context back to GPT-4o
3. GPT-4o returns a delta EDL (modifications to the existing EDL, not a full replacement)
4. Merge the delta into the current EDL
5. Show the updated EDL for review before re-rendering
6. Keep an edit history stack for undo/redo functionality

### Edit History

1. Store each EDL version as a snapshot in a `edit_history` table:
   - id, projectId, edlSnapshot (jsonb), prompt, parentVersionId, createdAt
2. Users can browse history and revert to any previous version
3. Display as a simple version timeline in the sidebar

### Quick Actions

Add one-click preset buttons alongside the free-form prompt:

- "Remove silences" (silence removal with default settings)
- "Add captions" (karaoke-style bottom-center captions)
- "Make it vertical" (reframe to 9:16)
- "Speed up 1.25x" (uniform speed increase)
- "Remove filler words" (cuts ums, uhs, etc.)
- "Auto-edit for TikTok" (combines: silence removal + filler removal + captions + vertical reframe + 60s max trim)
- "Auto-edit for Reels" (same as TikTok but 90s max)
- "Auto-edit for Shorts" (same but 60s max, different caption style)

These presets generate the same EDL as a prompt would, but skip the AI analysis step (no vision API cost). Only the caption generation needs Whisper.

### Usage Tracking

1. Track per-user:
   - Number of videos processed
   - Total AI tokens used (broken down by model)
   - Total estimated cost incurred on their API key
   - Total render time consumed
2. Display on the settings page as a usage dashboard
3. This is informational only (since they use their own API key), but useful for understanding their costs

### Polish Items

1. Loading skeletons for all async data
2. Toast notifications for success/error states
3. Keyboard shortcuts (Space for play/pause, Cmd+Enter to start processing)
4. Drag-and-drop reordering of operations in the EDL editor
5. Video thumbnail grid on the dashboard
6. Responsive design that works on tablet (video editing on mobile is impractical, but browsing projects should work)
7. Dark/light mode toggle (default dark)
8. Proper 404 and error pages
9. Rate limiting on all API routes
10. Input sanitization on all user inputs (prompts, API keys, etc.)

---

## Global Technical Requirements

### Security

- API keys encrypted with AES-256-GCM, encryption key from env var
- All file uploads validated server-side (magic bytes, not just extension)
- User can only access their own projects (row-level authorization on all queries)
- CSRF protection on all mutations
- Uploaded files stored outside the public directory
- FFmpeg commands are built programmatically, never from string concatenation with user input (prevent command injection)
- Rate limiting: 10 uploads per hour, 20 AI operations per hour, 5 concurrent renders per user

### Performance

- Video uploads use chunked/multipart upload with resume capability
- FFmpeg operations run in BullMQ workers, never blocking the API
- SSE connections have heartbeat to prevent timeout
- Database queries use proper indexes (userId + createdAt on projects, projectId on render_jobs)
- Video files served with proper Range request support for seeking
- Lazy load dashboard thumbnails

### Error Handling

- Every BullMQ job has retry logic with exponential backoff (max 3 retries)
- FFmpeg failures capture stderr for debugging
- OpenAI API failures distinguish between: invalid key, rate limit, insufficient credits, model error
- All errors surface to the user with actionable messages (not raw error dumps)
- Global error boundary component that logs to console and shows a friendly message

### File Structure

```
clipforge/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Auth pages (sign-in, sign-up)
│   │   ├── (dashboard)/        # Protected dashboard routes
│   │   │   ├── projects/       # Project list and detail pages
│   │   │   └── settings/       # API key and account settings
│   │   └── api/                # API routes
│   │       ├── trpc/           # tRPC router
│   │       ├── upload/         # File upload endpoint
│   │       └── sse/            # SSE progress endpoint
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── editor/             # Video editor components
│   │   ├── upload/             # Upload components
│   │   └── layout/             # Layout components
│   ├── lib/                    # Shared utilities
│   │   ├── db/                 # Drizzle schema and client
│   │   ├── ai/                 # OpenAI integration
│   │   │   ├── transcribe.ts   # Whisper transcription
│   │   │   ├── analyze.ts      # GPT-4o vision analysis
│   │   │   ├── prompts.ts      # System prompts
│   │   │   └── cost.ts         # Token counting and cost estimation
│   │   ├── video/              # Video processing
│   │   │   ├── ffmpeg.ts       # FFmpeg command builder
│   │   │   ├── extract.ts      # Frame and audio extraction
│   │   │   ├── render.ts       # EDL to FFmpeg pipeline
│   │   │   ├── subtitles.ts    # ASS subtitle generation
│   │   │   └── metadata.ts     # Video metadata extraction
│   │   ├── queue/              # BullMQ setup and workers
│   │   ├── encryption.ts       # API key encryption
│   │   ├── auth.ts             # NextAuth configuration
│   │   └── validators.ts       # Zod schemas
│   ├── types/                  # TypeScript type definitions
│   │   ├── edl.ts              # EDL types
│   │   └── events.ts           # SSE event types
│   └── workers/                # BullMQ worker processes
│       ├── analyze.worker.ts   # AI analysis worker
│       └── render.worker.ts    # FFmpeg render worker
├── uploads/                    # Local file storage (gitignored)
├── drizzle/                    # Database migrations
├── .env.example
├── docker-compose.yml          # Redis + PostgreSQL for local dev
├── package.json
└── tsconfig.json
```

### Docker Compose for Local Dev

Include a `docker-compose.yml` with:
- PostgreSQL 16
- Redis 7
- Volumes for data persistence
- Health checks

### README

Write a clear README.md with:
- What the app does (one paragraph)
- Prerequisites (Node.js 20+, Docker, FFmpeg installed locally)
- Setup instructions (clone, install, env vars, docker-compose up, migrate, dev)
- Architecture overview (one paragraph + the file structure)
- How API keys are handled (security note for users)

---

## What NOT to Build

- Do NOT build a subscription/billing system. Users bring their own API key.
- Do NOT build social features (sharing, commenting, collaboration).
- Do NOT build a template marketplace.
- Do NOT build mobile video recording/capture. 
- Do NOT implement S3 upload in Phase 1. Use local filesystem. S3 can be added later.
- Do NOT use WebSockets for progress. Use SSE (simpler, sufficient for one-way updates).
- Do NOT attempt real-time video preview of edits. Show before/after only.
- Do NOT build face detection for reframing in Phase 3 MVP. Use center-crop. Face tracking is Phase 5+.
