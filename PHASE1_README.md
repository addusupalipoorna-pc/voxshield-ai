# VoxShield AI — Frontend (Phase 1: React Migration)

This is the React + TypeScript + Vite migration of the working browser-based voice
analyzer prototype. **All real microphone/DSP functionality from the original
single-file prototype is preserved** — it has been refactored into typed,
reusable components and a shared hook, not rewritten from scratch.

## What's real vs. simulated (unchanged from the prototype)

- Waveform, spectrum, RMS, ZCR, spectral centroid/rolloff/flatness, pitch (autocorrelation),
  3-sample enrollment, and cosine-similarity speaker matching are all computed live
  from actual microphone audio via the Web Audio API. Nothing is randomly generated.
- "Voice Authenticity" is explicitly labeled a **heuristic** (pitch stability +
  spectral flatness), not a trained deepfake/anti-spoofing model. See
  `src/lib/audioFeatures.ts` → `heuristicAuthenticity()`.
- The **Pipeline Status** panel on the dashboard honestly reports that the
  deepfake model, speaker-embedding model, replay detector, transcription
  service, risk engine, and laptop agent are all `UNAVAILABLE` in this build —
  because this phase is frontend-only. Nothing is faked as "online."

## Project structure

```
src/
  lib/audioFeatures.ts       Pure DSP functions (RMS, ZCR, spectral stats, pitch,
                              mel-ish bins, cosine similarity) — no React, fully
                              unit-testable in isolation.
  hooks/useVoiceAnalyzer.ts  Encapsulates mic lifecycle, the analysis loop,
                              enrollment recording, and live recognition state.
  types/index.ts             Shared types + demo threshold constants.
  components/
    AudioWaveform.tsx         Live waveform canvas (own rAF loop, reads AnalyserNode directly)
    SpectrumVisualizer.tsx    Live frequency-bar canvas
    AudioMetrics.tsx          Real-time feature readout panel
    VoiceEnrollment.tsx       3-sample voiceprint capture UI
    SpeakerVerification.tsx   Cosine-similarity score + MATCH/INCONCLUSIVE/MISMATCH chip
    AuthenticityResult.tsx    Heuristic authenticity score, labeled as such
    RiskIndicator.tsx         Honest pipeline/model status panel
    SecurityDecision.tsx      Local demo ALLOW/CAUTION/BLOCK banner
    RecordingControls.tsx     Start/stop microphone buttons
  App.tsx                     Assembles everything into the dashboard layout
```

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build, already verified to compile clean
```

No environment variables or backend are required for this phase — it runs
entirely in the browser.

## What's intentionally NOT here yet

Per the phased implementation plan, this is Phase 1 only. Not yet built:

- FastAPI backend, PostgreSQL, authentication (Phase 2–3)
- Server-side voice profile storage (Phase 4)
- Real speaker-embedding model (e.g. ECAPA-TDNN) and real deepfake/replay
  detection models (Phase 5–7)
- Speech-to-text, command interpretation, command allowlist (Phase 8–10)
- Backend risk engine, laptop agent, approval workflow (Phase 11–14)
- Incidents, forensics, dashboard-with-real-data, privacy center, audit logs
  (Phase 15–20)
- 3D shield, premium visual pass (Phase 21–22)

The "Pipeline Status" panel in the UI reflects this honestly rather than
pretending these exist.

## Next phase

Phase 2: stand up the FastAPI + PostgreSQL backend skeleton (auth, DB models,
`/health` and `/model-status` endpoints) so the frontend has something real to
talk to.
