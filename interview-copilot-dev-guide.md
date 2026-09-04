# Interview Copilot — Development Guide

Personal-use tool: dual-channel live transcription + manual "Get Answer" button that sends the full transcript to an LLM, which identifies the current question and generates suggested answer bullets.

---

## 1. Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐
│   Your Mic       │     │  System Audio    │
│  (your voice)    │     │  (interviewer,   │
│                  │     │  via loopback)   │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └──────────┬─────────────┘
                     │
            ┌────────▼─────────┐
            │  Electron App     │
            │  (audio capture)  │
            └────────┬─────────┘
                     │  dual-channel audio stream
            ┌────────▼─────────┐
            │  AssemblyAI       │
            │  Streaming STT    │
            │  (2 channels)     │
            └────────┬─────────┘
                     │  live transcript (labeled)
            ┌────────▼─────────┐
            │  Transcript Store │
            │  (in-memory,      │
            │   growing array)  │
            └────────┬─────────┘
                     │  on button click: full transcript
            ┌────────▼─────────┐
            │  Claude API       │
            │  (question detect │
            │   + answer gen)   │
            └────────┬─────────┘
                     │  bullet-point suggestions
            ┌────────▼─────────┐
            │  UI Overlay       │
            │  (answer panel)   │
            └───────────────────┘
```

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| App shell | **Electron** | Always-on-top overlay window, cross-platform, full Node.js access for audio routing |
| Audio routing | **BlackHole** (Mac) / **VB-Cable** (Windows) | Routes system audio (Zoom/Meet output) into a virtual input device you can capture alongside your mic |
| Audio capture in-app | **Web Audio API** (`getUserMedia` + `AudioContext`) | Native to Electron's Chromium renderer, no extra deps needed |
| Speech-to-text | **AssemblyAI Streaming API** (dual-channel) | Chosen earlier — easier implementation, good enough latency |
| LLM | **Claude API** (Sonnet or Haiku tier) | Long-context handling for growing transcript, good instruction-following for "find the question, answer it" |
| State/UI | **React** (inside Electron renderer) | Simple two-panel layout: transcript feed + answer panel |
| Local storage | None needed — keep everything in memory for a single session (simplifies a lot, no persistence bugs) |
| Packaging | **electron-builder** | For creating a runnable app on your own machine (no need for code signing/distribution since it's personal use) |

You don't need a backend server — Electron's renderer can call both AssemblyAI and Claude APIs directly, or you can add a tiny local Node process if you'd rather keep API keys out of the renderer. For personal use, either is fine; a local main-process proxy is slightly safer for key handling.

---

## 3. Project Structure

```
interview-copilot/
├── package.json
├── main.js                 # Electron main process (window, audio device setup)
├── preload.js               # Bridge between main and renderer
├── src/
│   ├── App.jsx              # Root React component
│   ├── components/
│   │   ├── TranscriptPanel.jsx
│   │   ├── AnswerPanel.jsx
│   │   └── ControlBar.jsx
│   ├── lib/
│   │   ├── audioCapture.js  # getUserMedia + channel routing
│   │   ├── assemblyai.js    # WebSocket streaming client
│   │   └── claude.js        # Answer generation call
│   └── context/
│       └── resumeContext.js # Your resume + JD, loaded once
├── .env                      # API keys (gitignore this)
└── README.md
```

---

## 4. Step-by-Step Build Guide

### Step 1 — Set up audio routing (OS level, no code yet)
- **Mac**: install BlackHole (2ch). In Audio MIDI Setup, create a Multi-Output Device combining BlackHole + your speakers, so you still hear the call while it's also routed to BlackHole.
- **Windows**: install VB-Cable. Set your call app's output to VB-Cable Input, and set VB-Cable Output as a monitor so you still hear audio.
- Test: play any audio, confirm it shows up as an input source named BlackHole/VB-Cable in your system's sound settings.

### Step 2 — Scaffold the Electron + React app
```bash
npm create electron-vite@latest interview-copilot -- --template react
cd interview-copilot
npm install
```

### Step 3 — Capture dual audio channels
In `audioCapture.js`, open two separate `getUserMedia` streams — one for your default mic, one for the BlackHole/VB-Cable input:

```javascript
async function setupDualAudio() {
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: MIC_DEVICE_ID } }
  });
  const systemStream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: LOOPBACK_DEVICE_ID } }
  });
  return { micStream, systemStream };
}
```

You'll enumerate `navigator.mediaDevices.enumerateDevices()` first to find the actual device IDs for your mic and the BlackHole/VB-Cable input, and let the user (you) pick them from a dropdown in a settings panel — device IDs can change between machines/reboots.

### Step 4 — Stream both channels to AssemblyAI
Open a WebSocket connection to AssemblyAI's real-time endpoint, sending both streams (as two channels or two connections — two separate WebSocket connections is simpler to implement than true multi-channel framing). Tag each connection's output with a speaker label in your app state:

```javascript
const micSocket = connectAssemblyAI(micStream, 'me');
const interviewerSocket = connectAssemblyAI(systemStream, 'interviewer');

function connectAssemblyAI(stream, speakerLabel) {
  const ws = new WebSocket('wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000', {
    headers: { authorization: process.env.ASSEMBLYAI_API_KEY }
  });

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.message_type === 'FinalTranscript' && data.text) {
      appendToTranscript({ speaker: speakerLabel, text: data.text, timestamp: Date.now() });
    }
  };

  // pipe audio chunks from `stream` into ws.send(...) as they arrive
  return ws;
}
```

### Step 5 — Accumulate the transcript
Keep a simple growing array in React state (or a ref, to avoid re-render cost on every partial update):

```javascript
const transcriptRef = useRef([]);

function appendToTranscript(entry) {
  transcriptRef.current.push(entry);
  setDisplayTranscript([...transcriptRef.current]); // for UI render
}
```

### Step 6 — Build the "Get Answer" button handler
On click, format the full transcript and send it to Claude:

```javascript
async function getAnswer() {
  const transcriptText = transcriptRef.current
    .map(e => `${e.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${e.text}`)
    .join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: SYSTEM_PROMPT, // includes resume + JD, see Step 7
      messages: [
        { role: 'user', content: `Transcript so far:\n\n${transcriptText}` }
      ]
    })
  });

  const data = await response.json();
  const answerText = data.content.find(c => c.type === 'text')?.text || '';
  setSuggestedAnswer(answerText);
}
```

### Step 7 — Preload resume + JD context
Load once at app start, store in a constant, include as the `system` prompt on every call:

```javascript
const SYSTEM_PROMPT = `
You are an interview copilot helping a candidate during a live job interview.

You will receive the full transcript so far (labeled Interviewer / Me).

Your task:
- Identify the most recent question the interviewer asked that the candidate 
  has NOT yet answered (check "Me" turns for what's already been covered).
- Ignore small talk, filler, or already-answered questions.
- Generate a suggested answer as 3-5 concise bullet points.
- Ground the answer ONLY in the candidate's actual resume/experience below — 
  do not invent accomplishments.
- If the question is behavioral, structure bullets loosely as S/T/A/R.
- Keep the suggestion readable in under 10 seconds.

Output ONLY the bullet points. No preamble, no "Here's a suggested answer:".

--- CANDIDATE RESUME ---
${RESUME_TEXT}

--- JOB DESCRIPTION ---
${JOB_DESCRIPTION_TEXT}
`;
```

### Step 8 — Build the minimal UI
Two panels + one button:
- **Left/top panel**: scrolling transcript, `Interviewer:` in one color, `Me:` in another
- **Bottom panel**: answer suggestion, rendered as a bullet list
- **Button**: "Get Answer" — shows a small spinner while the Claude call is in flight (typically 1-3 sec)

Keep the window small, always-on-top, and positioned near your webcam if you're on video, so glancing at it looks close to natural eye contact.

```javascript
// main.js — always-on-top overlay window
const win = new BrowserWindow({
  width: 380,
  height: 500,
  alwaysOnTop: true,
  frame: false,
  transparent: true,
  webPreferences: { preload: path.join(__dirname, 'preload.js') }
});
```

### Step 9 — Test end-to-end before the real interview
- Do a dry run on a real call with a friend or a YouTube interview video playing through your speakers
- Confirm: both channels transcribe correctly, button click produces a relevant answer, latency is acceptable (should be under ~3-4 sec total)
- Check the overlay window doesn't get captured if you screen-share (some interviews involve screen share for coding rounds — Electron windows can usually be excluded from screen capture with `setContentProtection(true)` on Mac/Windows if needed)

---

## 5. API Keys & Config

`.env` (never commit this):
```
ASSEMBLYAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

Load via `dotenv` in the Electron main process, and pass keys to the renderer only through a secure IPC bridge (`preload.js`) rather than bundling them into renderer code directly.

---

## 6. Suggested Build Order (so you always have something working)

1. Dual audio capture + AssemblyAI transcription showing in two labeled panels — **test this alone first**
2. Manual transcript accumulation working correctly (scroll, labels correct)
3. "Get Answer" button wired to Claude API with a hardcoded test transcript — confirm prompt quality
4. Wire the real accumulated transcript into the button handler
5. Add resume/JD preload
6. Polish UI (overlay style, always-on-top, spinner state)
7. Dry-run test on a real call

---

## 7. Cost Estimate (rough, personal use)

- AssemblyAI streaming: ~$0.15-0.37/hour of audio depending on plan — a 45-min interview costs well under $1
- Claude API: ~15-20 button clicks per interview, each sending a growing transcript (a few thousand tokens by the end) — total cost per interview is typically well under $1 with Sonnet, even less with Haiku

Not something to optimize for a personal tool — just noting it won't add up to anything meaningful.
