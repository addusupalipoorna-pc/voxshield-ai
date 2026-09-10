import { useCallback, useState } from 'react';
import { createChatCompletion, EXPERIENTIAL_API_KEY } from '../lib/llmClient';
import type { LiveMetrics, RecognitionResult, EnrollmentStatus } from '../types';

export type AnalystState = 'IDLE' | 'LOADING' | 'DONE' | 'ERROR' | 'NO_KEY';

export interface AIAnalystResult {
  state: AnalystState;
  text: string;
  error: string | null;
  analyze: (
    metrics: LiveMetrics | null,
    recognition: RecognitionResult,
    enrollment: EnrollmentStatus,
  ) => void;
  clear: () => void;
}

function buildSystemPrompt(): string {
  return `You are an expert voice biometrics analyst embedded in VoxShield AI — a real-time voice security system.
Your job is to interpret raw acoustic features extracted directly from a user's microphone and explain what they reveal about the speaker's voice, identity, and authenticity signal.

Be concise (3-5 sentences). Be honest about what heuristics can and cannot determine.
Mention concrete numbers from the data. Speak in clear, professional language — not overly technical, not dumbed down.
Do NOT claim the system has trained ML models — it uses signal-processing heuristics only in this build.`;
}

function buildUserPrompt(
  metrics: LiveMetrics,
  recognition: RecognitionResult,
  enrollment: EnrollmentStatus,
): string {
  const { rms, zcr, centroid, rolloff, flatness, pitch, sampleRate } = metrics;

  const pitchStr = pitch > 0 ? `${pitch.toFixed(1)} Hz` : 'not detected (unvoiced/silent frame)';
  const authStr =
    recognition.authenticity !== null
      ? `${(recognition.authenticity * 100).toFixed(0)}%`
      : 'N/A (no voiced signal)';
  const simStr =
    recognition.similarity !== null
      ? `${(recognition.similarity * 100).toFixed(1)}%`
      : 'N/A (no voiceprint enrolled)';

  return `Analyze the following live voice capture snapshot from VoxShield AI:

**Signal features (real-time, Web Audio API @ ${sampleRate} Hz):**
- RMS amplitude: ${rms.toFixed(4)}
- Zero-Crossing Rate: ${zcr.toFixed(4)}
- Spectral Centroid: ${centroid.toFixed(1)} Hz
- Spectral Rolloff (85% energy): ${rolloff.toFixed(1)} Hz
- Spectral Flatness: ${flatness.toFixed(4)} (0=tonal, 1=noise)
- Estimated Pitch (F0): ${pitchStr}

**Speaker recognition (cosine-similarity heuristic):**
- Voiceprint: ${enrollment.voiceprintReady ? `enrolled (${enrollment.samplesCaptured} samples)` : 'not enrolled'}
- Cosine similarity: ${simStr}
- Speaker state: ${recognition.speakerState}
- Heuristic authenticity: ${authStr}

Give a concise expert interpretation of what these numbers reveal about this voice signal.`;
}

export function useAIAnalyst(): AIAnalystResult {
  const [state, setState] = useState<AnalystState>(() =>
    EXPERIENTIAL_API_KEY ? 'IDLE' : 'NO_KEY',
  );
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setState(EXPERIENTIAL_API_KEY ? 'IDLE' : 'NO_KEY');
    setText('');
    setError(null);
  }, []);

  const analyze = useCallback(
    (
      metrics: LiveMetrics | null,
      recognition: RecognitionResult,
      enrollment: EnrollmentStatus,
    ) => {
      if (!metrics) return;
      if (!EXPERIENTIAL_API_KEY) {
        setState('NO_KEY');
        return;
      }

      setState('LOADING');
      setText('');
      setError(null);

      createChatCompletion({
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(metrics, recognition, enrollment) },
        ],
        temperature: 0.6,
        stream: false,
      })
        .then((data: { choices?: { message?: { content?: string } }[] }) => {
          const content = data?.choices?.[0]?.message?.content ?? '';
          setText(content);
          setState('DONE');
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Unknown error from AI service.';
          setError(msg);
          setState('ERROR');
        });
    },
    [],
  );

  return { state, text, error, analyze, clear };
}
