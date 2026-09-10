export type SpeakerState = 'NO_PROFILE' | 'MATCH' | 'INCONCLUSIVE' | 'MISMATCH';

export type SecurityDecisionState = 'IDLE' | 'ALLOW' | 'CAUTION' | 'BLOCK';

export type MicState = 'IDLE' | 'REQUESTING' | 'LIVE' | 'ERROR';

export interface LiveMetrics {
  rms: number;
  zcr: number;
  centroid: number;
  rolloff: number;
  flatness: number;
  pitch: number;
  sampleRate: number;
}

export interface EnrollmentStatus {
  samplesCaptured: number;
  samplesRequired: number;
  isRecording: boolean;
  voiceprintReady: boolean;
  message: string;
}

export interface RecognitionResult {
  similarity: number | null; // cosine similarity 0-1, null if no voiceprint yet
  speakerState: SpeakerState;
  authenticity: number | null; // heuristic 0-1, null if no voiced signal
}

/**
 * Thresholds are demo defaults for the local heuristic pipeline, not
 * calibrated security standards. They will be superseded by the backend
 * risk engine (Phase 11) once it exists.
 */
export const SPEAKER_MATCH_THRESHOLD = 0.85;
export const SPEAKER_INCONCLUSIVE_THRESHOLD = 0.65;
export const AUTH_CAUTION_THRESHOLD = 0.4;
export const AUTH_WARN_THRESHOLD = 0.7;
