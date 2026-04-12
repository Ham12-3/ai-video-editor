# ClipForge - AI Video Editor

AI-powered video editor for short-form content (TikTok, Instagram Reels, YouTube Shorts).

Upload a video, describe your edits in plain English, and ClipForge uses GPT-4.1 + Whisper + FFmpeg to analyze, plan, and render the edited video automatically. You bring your own OpenAI API key.

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

Open http://localhost:3000, sign up, add your OpenAI API key in Settings, upload a video, and start editing.

## Documentation

- [README](clipforge/README.md) - Full setup guide, tech stack, scripts
- [ARCHITECTURE](clipforge/ARCHITECTURE.md) - System design, data flow, security model
- [PROMPTS](clipforge/PROMPTS.md) - Test prompts for the AI editor (organized by use case)

## Prerequisites

- Node.js 20+
- Docker Desktop
- FFmpeg on PATH
