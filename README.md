# ClipForge — AI Video Editor

AI-powered video editor for short-form content (TikTok, Instagram Reels, YouTube Shorts).

Upload a video, describe the edits in plain English, and ClipForge uses **GPT-5.4** for analysis, **Whisper** for transcription, **Google Nano Banana 2** for on-topic illustration overlays, and **FFmpeg** for the final render. You bring your own API keys.

## What it does in one sentence

You upload a clip, type "trim dead air, remove silences and filler words, speed up to 1.2x, reframe to 9:16, add karaoke captions, drop in illustrations of whatever I mention", and a few minutes later you download a finished vertical video.

## Quick Start

```bash
cd clipforge
npm install
docker compose up -d
cp .env.example .env.local
# Edit .env.local: add ENCRYPTION_KEY (see .env.example for instructions)
DATABASE_URL="postgresql://user:password@localhost:5432/clipforge" npm run db:push
npm run dev
```

Open http://localhost:3000, sign up, add your API keys in **Settings**, upload a video, describe the edit, render.

## API keys you'll need

| Provider | Used for | Where to get one |
|----------|----------|------------------|
| OpenAI | Analysis (GPT-5.4) and transcription (Whisper) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Gemini | Illustration overlays (Nano Banana 2) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Anthropic | Optional alternative for analysis | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

If no Gemini key is configured, illustrations are skipped and the rest of the render still works.

## Documentation

- [clipforge/README.md](clipforge/README.md) — Full setup guide, tech stack, project structure, AI pipeline, scripts
- [clipforge/ARCHITECTURE.md](clipforge/ARCHITECTURE.md) — System design, data flow, security model
- [clipforge/PROMPTS.md](clipforge/PROMPTS.md) — Test prompts organised by use case
- [ai-video-editor-prompt.md](ai-video-editor-prompt.md) — Original product brief

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL and Redis)
- FFmpeg 7+ on PATH

## Status

Pre-1.0. Render pipeline is stable end-to-end (analyse, plan, captions, reframe, illustrations). See [clipforge/README.md](clipforge/README.md#recent-changes) for the latest changes.
