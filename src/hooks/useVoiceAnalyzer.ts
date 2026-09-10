import { useCallback, useRef, useState } from 'react';
import {
  buildFeatureVector,
  cosineSimilarity,
  averageVectors,
  heuristicAuthenticity,
} from '../lib/audioFeatures';
import { SPEAKER_MATCH_THRESHOLD, SPEAKER_INCONCLUSIVE_THRESHOLD } from '../types';
import type { EnrollmentStatus, LiveMetrics, MicState, RecognitionResult } from '../types';

const FFT_SIZE = 2048;
const METRICS_UPDATE_MS = 120; // throttle React state updates; canvas drawing runs its own rAF loop
const ENROLL_SAMPLE_MS = 2500;
const SAMPLES_REQUIRED = 3;

export function useVoiceAnalyzer() {
  const [micState, setMicState] = useState<MicState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentStatus>({
    samplesCaptured: 0,
    samplesRequired: SAMPLES_REQUIRED,
    isRecording: false,
    voiceprintReady: false,
    message: 'Start the microphone first, then record 3 samples.',
  });
  const [recognition, setRecognition] = useState<RecognitionResult>({
    similarity: null,
    speakerState: 'NO_PROFILE',
    authenticity: null,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastMetricsUpdateRef = useRef<number>(0);

  const timeDataRef = useRef<Float32Array | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);

  // Enrollment / recognition state kept in refs so the rAF loop always sees fresh values
  const enrolledSamplesRef = useRef<number[][]>([]);
  const voiceprintRef = useRef<number[] | null>(null);
  const isRecordingRef = useRef(false);
  const recordBufferRef = useRef<number[][]>([]);
  const recordStartRef = useRef(0);

  const getAnalyser = useCallback(() => analyserRef.current, []);
  const getSampleRate = useCallback(() => audioCtxRef.current?.sampleRate ?? 0, []);

  const finishEnrollmentSample = useCallback(() => {
    isRecordingRef.current = false;
    const avg = averageVectors(recordBufferRef.current);
    enrolledSamplesRef.current = [...enrolledSamplesRef.current, avg];
    recordBufferRef.current = [];

    const count = enrolledSamplesRef.current.length;
    if (count >= SAMPLES_REQUIRED) {
      voiceprintRef.current = averageVectors(enrolledSamplesRef.current);
      setEnrollment({
        samplesCaptured: count,
        samplesRequired: SAMPLES_REQUIRED,
        isRecording: false,
        voiceprintReady: true,
        message: 'Voiceprint saved from 3 samples. Live speaker-match is now active.',
      });
    } else {
      setEnrollment({
        samplesCaptured: count,
        samplesRequired: SAMPLES_REQUIRED,
        isRecording: false,
        voiceprintReady: false,
        message: `Sample ${count} of ${SAMPLES_REQUIRED} captured. Record the next one.`,
      });
    }
  }, []);

  const loop = useCallback(() => {
    const analyser = analyserRef.current;
    const audioCtx = audioCtxRef.current;
    const timeData = timeDataRef.current;
    const freqData = freqDataRef.current;
    if (!analyser || !audioCtx || !timeData || !freqData) return;

    analyser.getFloatTimeDomainData(timeData as Float32Array<ArrayBuffer>);
    analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);

    const { vec, raw } = buildFeatureVector(timeData, freqData, audioCtx.sampleRate);

    if (isRecordingRef.current) {
      recordBufferRef.current.push(vec);
      if (performance.now() - recordStartRef.current >= ENROLL_SAMPLE_MS) {
        finishEnrollmentSample();
      }
    } else if (voiceprintRef.current) {
      const similarity = cosineSimilarity(vec, voiceprintRef.current);
      const speakerState =
        similarity >= SPEAKER_MATCH_THRESHOLD
          ? 'MATCH'
          : similarity >= SPEAKER_INCONCLUSIVE_THRESHOLD
            ? 'INCONCLUSIVE'
            : 'MISMATCH';
      const authenticity = heuristicAuthenticity(raw);
      setRecognition({ similarity, speakerState, authenticity });
    }

    const now = performance.now();
    if (now - lastMetricsUpdateRef.current >= METRICS_UPDATE_MS) {
      lastMetricsUpdateRef.current = now;
      setLiveMetrics({
        rms: raw.rms,
        zcr: raw.zcr,
        centroid: raw.centroid,
        rolloff: raw.rolloff,
        flatness: raw.flatness,
        pitch: raw.pitch,
        sampleRate: audioCtx.sampleRate,
      });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [finishEnrollmentSample]);

  const start = useCallback(async () => {
    setError(null);
    setMicState('REQUESTING');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx: AudioContext = new AudioContextCtor();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      timeDataRef.current = new Float32Array(analyser.fftSize);
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      setMicState('LIVE');
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied or unavailable.');
      setMicState('ERROR');
    }
  }, [loop]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setMicState('IDLE');
    setLiveMetrics(null);
  }, []);

  const recordSample = useCallback(() => {
    if (enrolledSamplesRef.current.length >= SAMPLES_REQUIRED) return;
    isRecordingRef.current = true;
    recordBufferRef.current = [];
    recordStartRef.current = performance.now();
    setEnrollment((prev) => ({
      ...prev,
      isRecording: true,
      message: `Recording sample ${prev.samplesCaptured + 1} of ${SAMPLES_REQUIRED} — speak naturally for ~2.5s.`,
    }));
  }, []);

  const resetVoiceprint = useCallback(() => {
    enrolledSamplesRef.current = [];
    voiceprintRef.current = null;
    isRecordingRef.current = false;
    recordBufferRef.current = [];
    setEnrollment({
      samplesCaptured: 0,
      samplesRequired: SAMPLES_REQUIRED,
      isRecording: false,
      voiceprintReady: false,
      message: 'Voiceprint cleared. Record 3 new samples.',
    });
    setRecognition({ similarity: null, speakerState: 'NO_PROFILE', authenticity: null });
  }, []);

  return {
    micState,
    error,
    liveMetrics,
    enrollment,
    recognition,
    getAnalyser,
    getSampleRate,
    start,
    stop,
    recordSample,
    resetVoiceprint,
  };
}
