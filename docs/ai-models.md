# VoxShield AI — AI Models & Detection Services

## Truth in Telemetry
VoxShield AI enforces honest reporting regarding AI model availability. Under no circumstances are synthetic accuracy metrics (such as "99.8% precision") fabricated to simulate active neural networks.

Every analysis and status endpoint indicates the true operating mode:
- **`ONLINE`**: A verified neural network model is loaded and performing inference.
- **`HEURISTIC`**: A mathematical audio signal processing algorithm is running as a prototype.
- **`UNAVAILABLE`**: The neural model weights or cloud API keys are not installed/configured.
- **`SIMULATION`**: An explicit scenario generated within the Attack Simulator for demonstration purposes.

---

## 1. Detection Services Breakdown

### Speaker Verification
- **Current Mode**: `HEURISTIC` (Acoustic Cosine Matching)
- **Implementation**: `HeuristicSpeakerVerification`
- **Methodology**: Extracts 13-dimensional Mel-Frequency Cepstral Coefficients (MFCCs) across 25ms Hamming-windowed frames, and calculates cosine similarity against enrolled sample vectors.
- **Production Extension**: `NeuralSpeakerVerification` interface supports loading pre-trained ECAPA-TDNN or SpeechBrain speaker embeddings via `SPEAKER_MODEL_PATH`.

### Deepfake & Anti-Spoofing Detection
- **Current Mode**: `HEURISTIC` / `UNAVAILABLE`
- **Implementation**: `HeuristicDeepfakeDetector` & `NeuralDeepfakeDetector`
- **Methodology**: Evaluates spectral rolloff distortion, high-frequency cutoff, phase irregularities, and temporal energy variance characteristic of neural vocoders.
- **Production Extension**: Architected for AASIST (Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention) or RawNet2.

### Replay Attack Detection
- **Current Mode**: `HEURISTIC`
- **Implementation**: `HeuristicReplayDetector`
- **Methodology**: Inspects low-frequency noise floor elevation, acoustic transmission room impulse response artifacts, and far-field transducer distortion.

### Automatic Speech Recognition (STT)
- **Current Mode**: `ONLINE` (when `OPENAI_API_KEY` is provided) / `UNAVAILABLE`
- **Implementation**: `OpenAITranscriptionService` (Whisper API)
- **Fallback**: Native browser `webkitSpeechRecognition` with clear user interface attribution.
