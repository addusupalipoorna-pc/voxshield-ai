# VoxShield AI — Voice & Audio Analysis Pipeline

## Architectural Principle: Truthful AI Reporting
VoxShield AI operates in strict accordance with the **Honesty Rule**:
- Mathematical heuristic prototypes are explicitly labeled `HEURISTIC` (e.g. MFCC cosine matching, audio signal spectrum flatness).
- When deep neural weights (e.g. ECAPA-TDNN, AASIST) are not configured, their readiness is reported as `UNAVAILABLE`.
- No fake 99.8% precision scores are generated to inflate dashboard appearance.

---

## 1. Capture & Live Client DSP
Microphone capture occurs directly in the browser via HTML5 `navigator.mediaDevices.getUserMedia()` and the Web Audio API.

A dedicated audio DSP node graph extracts real-time features:
- **RMS (Root Mean Square)**: Measures average audio signal energy.
- **ZCR (Zero-Crossing Rate)**: Measures high-frequency noise and voiced/unvoiced boundary transitions.
- **Spectral Centroid**: Identifies the center of gravity of the audio spectrum.
- **Spectral Rolloff**: Calculates the frequency below which 85% of spectral energy concentrates.
- **Spectral Flatness**: Detects tonal purity vs white noise/vocoder distribution.

Visual waveforms and spectrums are bound directly to live audio buffers without mock animations.

---

## 2. Server-Side Biometric Pipeline

```text
               Live Audio (WAV)
                     │
                     ▼
          [ Audio Sanitization & Validation ]
          - Max 25MB file size
          - Audio header & duration check
                     │
                     ▼
          [ Acoustic Feature Extraction ]
          - 13-dimensional MFCC vectors
          - Pitch tracking & noise floor
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
[ Speaker Verification ]   [ Replay Analysis ]
  - Enrolled vector comparison - Bandwidth cutoff
  - Cosine distance metric     - High-frequency loss
  - Match / Inconclusive       - Far-field reflection
         │                       │
         └───────────┬───────────┘
                     ▼
             [ Anti-Spoof Gate ]
             - Model check (AASIST)
             - If unavailable, report UNAVAILABLE
                     │
                     ▼
             [ Risk Evaluation ]
             - Multi-factor synthesis
```

---

## 3. Speaker Verification Architecture
The system supports two swappable backends:
1. **Prototype Heuristic Acoustic Matching (`HeuristicSpeakerVerification`)**:
   Computes cosine similarity between candidate 13-MFCC vectors and the enrolled user profile.
   - `similarity >= 0.82`: Match
   - `0.65 <= similarity < 0.82`: Inconclusive
   - `similarity < 0.65`: Mismatch
2. **Neural Biometric Embedding (`NeuralSpeakerVerification`)**:
   Designed for deep speaker embedding models (ECAPA-TDNN). Active when model weights are provided via `SPEAKER_MODEL_PATH`.

---

## 4. Anti-Spoofing & Deepfake Detection
1. **Heuristic Anti-Spoof (`HeuristicDeepfakeDetector`)**:
   Evaluates spectral roll-off anomalies, phase incoherence, and high-frequency loss typical of vocoded synthetic speech.
2. **Neural Deepfake Detection (`NeuralDeepfakeDetector`)**:
   Designed for RawNet2 or AASIST models. Active when weights are provided via `DEEPFAKE_MODEL_PATH`.
