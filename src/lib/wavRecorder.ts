/**
 * wavRecorder.ts — Production-grade Linear PCM WAV Audio Recorder.
 *
 * Captures raw microphone audio directly via the Web Audio API (Float32 PCM)
 * and encodes it into a standard, uncompressed 16-bit 16,000 Hz Mono RIFF/WAVE Blob.
 *
 * Why this is necessary for Cyber Security & Biometrics:
 * Browsers using `MediaRecorder` produce compressed WebM/Opus container files.
 * The EBML/WebM container headers caused biometrics to evaluate container bytes
 * rather than the speaker's true acoustic voiceprint. This recorder outputs
 * pure, genuine RIFF PCM audio that acoustic and anti-spoofing pipelines can accurately evaluate.
 */

export interface WavRecorderSession {
  stop: () => Promise<{ blob: Blob; file: File; durationMs: number }>;
  cancel: () => void;
  getWaveData: () => number[];
}

/**
 * Downsample Float32 audio buffer from inputSampleRate to targetSampleRate (e.g. 16,000 Hz)
 */
function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (targetSampleRate === inputSampleRate) {
    return buffer;
  }
  if (targetSampleRate > inputSampleRate) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Encode Float32 PCM samples into a standard 16-bit Mono Linear PCM WAV Blob.
 */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(0, 'RIFF');
  /* file length minus 8 bytes */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type & format */
  writeString(8, 'WAVE');
  /* format chunk identifier */
  writeString(12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (1 is linear PCM) */
  view.setUint16(20, 1, true);
  /* channel count (1 = mono) */
  view.setUint16(22, 1, true);
  /* sample rate (16000 Hz) */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sampleRate * channelCount * bytesPerSample) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channelCount * bytesPerSample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Convert Float32 to 16-bit signed PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    const intVal = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, Math.floor(intVal), true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Start a raw 16kHz PCM audio recording session.
 */
export async function startWavRecording(
  filename = 'voice_command.wav',
  fftBins = 48
): Promise<WavRecorderSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
    },
  });

  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtxClass();
  const inputSampleRate = audioCtx.sampleRate;
  const targetSampleRate = 16000;

  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  source.connect(analyser);

  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const recordedChunks: Float32Array[] = [];
  let totalRawSamples = 0;
  const startTime = performance.now();

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const copy = new Float32Array(inputData.length);
    copy.set(inputData);
    recordedChunks.push(copy);
    totalRawSamples += copy.length;
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  const getWaveData = (): number[] => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return Array.from(data.slice(0, fftBins)).map((v) => v / 255);
  };

  const cancel = () => {
    try {
      processor.disconnect();
      source.disconnect();
      analyser.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
    } catch {}
  };

  const stop = async (): Promise<{ blob: Blob; file: File; durationMs: number }> => {
    const elapsed = Math.round(performance.now() - startTime);

    processor.disconnect();
    source.disconnect();
    analyser.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    try {
      await audioCtx.close();
    } catch {}

    const merged = new Float32Array(totalRawSamples);
    let offset = 0;
    for (const chunk of recordedChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const downsampled = downsampleBuffer(merged, inputSampleRate, targetSampleRate);
    const blob = encodeWav(downsampled, targetSampleRate);
    const file = new File([blob], filename, { type: 'audio/wav' });

    return {
      blob,
      file,
      durationMs: elapsed,
    };
  };

  return {
    stop,
    cancel,
    getWaveData,
  };
}
