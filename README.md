# Interview Copilot

Always-on-top overlay: dual-channel live transcription (AssemblyAI) plus a manual **Get Answer** button (OpenAI, Claude, or OpenRouter).

The setup window uses a left sidebar for Interviews, Prompts, and Settings. Prompts and standing instructions live in one panel with a sample-question preview.

## Setup

1. Install Node 20+ if needed.
2. Run:

```
npm install
npm run dev
```

## Use

1. Open Settings and enter your AssemblyAI key.
2. Add at least one answer-provider key: **OpenAI**, **Claude**, or **OpenRouter**.
3. Click **Load models** for that provider, then choose an **Answer model** (fast, for Get Answer) and a **Vision model** (stronger, for screenshot Solve).
4. Click **Save API configuration**, or **Test connections** to save and validate.
   Keys are encrypted using Electron `safeStorage`.
5. Open **Interviews**, add a session for each company (time, resume, JD, prompt).
6. Pick your mic in **Settings**. Interviewer audio defaults to **System Audio (all apps)** so WhatsApp, Google Meet, Zoom, and other apps are captured from your speakers.
7. Click **Start session**. The setup window hides and the mini overlay opens.
8. Click **Get Answer** in the overlay when you want suggested bullets.
9. Click **Setup** in the overlay to return to the full setup window.

API keys are stored encrypted in Electron's user-data directory. They stay in the main process
and are never returned to the renderer after saving.
