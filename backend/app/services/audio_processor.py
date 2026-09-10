"""
Audio Processor — Real feature extraction from raw WAV/WebM audio bytes.
Uses only Python standard library + array math (no librosa/scipy needed).
All results are heuristic-based and labeled accordingly.
"""
import io
import math
import struct
import wave
from dataclasses import dataclass, field


@dataclass
class AudioFeatures:
    duration_ms: int
    sample_rate: int
    num_channels: int
    num_frames: int
    rms: float                          # Root mean square energy 0-1
    zcr: float                          # Zero crossing rate (normalized)
    spectral_centroid: float            # Approximate spectral centroid (Hz)
    spectral_flatness: float            # 0=tonal, 1=noise-like
    spectral_rolloff: float             # Hz where 85% of energy lies below
    pitch_hz: float | None              # Dominant pitch (None if no clear pitch)
    heuristic_authenticity: float       # 0-1, higher = more likely genuine
    mfcc_vector: list[float]            # 13-coefficient MFCC approximation
    is_valid: bool = True
    validation_message: str = ""
    pitch_std: float = 0.0              # Pitch std deviation across voiced speech frames (Hz)
    high_freq_flatness: float = 0.0     # Flatness in upper band (>3500Hz)
    voiced_ratio: float = 0.0           # Fraction of frames with detected fundamental pitch


def _decode_wav_bytes(audio_bytes: bytes) -> tuple[list[float], int, int]:
    """
    Attempt to decode bytes as WAV. Returns (samples_float_list, sample_rate, num_channels).
    Rejects raw WebM/EBML container bytes so headers never masquerade as audio.
    """
    # 1. Guard against compressed WebM container header bytes being unpacked as raw PCM
    if audio_bytes.startswith(b"\x1aE\xdf\xa3"):
        # WebM container requires Opus decompression; cannot be treated as PCM
        return [], 16000, 1

    # 2. Standard RIFF WAV decoding
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
            sr = wf.getframerate()
            nc = wf.getnchannels()
            sw = wf.getsampwidth()
            n_frames = wf.getnframes()
            raw = wf.readframes(n_frames)

            if sw == 2:
                fmt = f"<{len(raw) // 2}h"
                samples_int = struct.unpack(fmt, raw)
                peak = 32768.0
            elif sw == 1:
                fmt = f"<{len(raw)}b"
                samples_int = struct.unpack(fmt, raw)
                peak = 128.0
            else:
                # 4-byte int
                fmt = f"<{len(raw) // 4}i"
                samples_int = struct.unpack(fmt, raw)
                peak = 2147483648.0

            # Convert to float mono
            if nc > 1:
                mono = []
                for i in range(0, len(samples_int), nc):
                    chunk = samples_int[i:i + nc]
                    mono.append(sum(chunk) / nc / peak)
                samples_f = mono
            else:
                samples_f = [s / peak for s in samples_int]

            return samples_f, sr, nc
    except Exception:
        # If it has a RIFF header but failed, or raw PCM without header
        if audio_bytes.startswith(b"RIFF"):
            return [], 16000, 1
        
        # Raw 16-bit PCM fallback (only if not WebM/EBML)
        n = len(audio_bytes) // 2
        if n < 100:
            return [], 16000, 1
        fmt = f"<{n}h"
        try:
            samples_int = struct.unpack(fmt, audio_bytes[:n * 2])
        except struct.error:
            return [], 16000, 1
        return [s / 32768.0 for s in samples_int], 16000, 1


def _rms(samples: list[float]) -> float:
    if not samples:
        return 0.0
    return math.sqrt(sum(s * s for s in samples) / len(samples))


def _zcr(samples: list[float]) -> float:
    if len(samples) < 2:
        return 0.0
    crossings = sum(
        1 for i in range(1, len(samples)) if (samples[i] >= 0) != (samples[i - 1] >= 0)
    )
    return crossings / (len(samples) - 1)


def _fft_magnitude(samples: list[float]) -> list[float]:
    """Compute DFT magnitude spectrum using Cooley-Tukey FFT (pure Python)."""
    n = len(samples)
    if n == 0:
        return []
    p2 = 1
    while p2 < n:
        p2 <<= 1
    padded = samples + [0.0] * (p2 - n)
    spec = _fft_recursive(padded)
    half = p2 // 2
    return [abs(c) for c in spec[:half]]


def _fft_recursive(x: list[complex]) -> list[complex]:
    n = len(x)
    if n <= 1:
        return [complex(v) for v in x]
    even = _fft_recursive([x[i] for i in range(0, n, 2)])
    odd = _fft_recursive([x[i] for i in range(1, n, 2)])
    T = [math.e ** (complex(0, -2 * math.pi * k / n)) * odd[k] for k in range(n // 2)]
    return [even[k] + T[k] for k in range(n // 2)] + [even[k] - T[k] for k in range(n // 2)]


def _spectral_centroid(magnitudes: list[float], sample_rate: int) -> float:
    if not magnitudes or sum(magnitudes) == 0:
        return 0.0
    freqs = [i * sample_rate / (2 * len(magnitudes)) for i in range(len(magnitudes))]
    total = sum(magnitudes)
    return sum(f * m for f, m in zip(freqs, magnitudes)) / total


def _spectral_flatness(magnitudes: list[float]) -> float:
    """Ratio of geometric mean to arithmetic mean — 0 tonal, 1 noise-like."""
    if not magnitudes:
        return 0.0
    eps = 1e-10
    n = len(magnitudes)
    log_sum = sum(math.log(m + eps) for m in magnitudes)
    geom = math.exp(log_sum / n)
    arith = sum(magnitudes) / n
    if arith == 0:
        return 0.0
    return min(geom / arith, 1.0)


def _spectral_rolloff(magnitudes: list[float], sample_rate: int, percentile: float = 0.85) -> float:
    if not magnitudes:
        return 0.0
    total = sum(magnitudes)
    if total == 0:
        return 0.0
    threshold = total * percentile
    cumulative = 0.0
    freq_res = sample_rate / (2 * len(magnitudes))
    for i, m in enumerate(magnitudes):
        cumulative += m
        if cumulative >= threshold:
            return i * freq_res
    return sample_rate / 2


def _frame_pitch_autocorr(frame: list[float], sample_rate: int) -> float | None:
    """Estimate pitch of a single frame via autocorrelation in 65Hz-550Hz."""
    n = len(frame)
    if n < 128:
        return None
    min_lag = max(1, int(sample_rate / 550))   # max 550 Hz
    max_lag = min(n - 1, int(sample_rate / 65)) # min 65 Hz
    if min_lag >= max_lag:
        return None
    
    # Energy at zero lag
    e0 = sum(frame[i] * frame[i] for i in range(n))
    if e0 < 1e-5:
        return None

    best_lag = -1
    best_corr = 0.0
    for lag in range(min_lag, max_lag):
        corr = sum(frame[i] * frame[i + lag] for i in range(n - lag))
        if corr > best_corr:
            best_corr = corr
            best_lag = lag

    # Voiced threshold: correlation must be at least 30% of zero-lag energy
    if best_lag > 0 and (best_corr / e0) > 0.30:
        f0 = sample_rate / best_lag
        if 65 <= f0 <= 550:
            return f0
    return None


def _compute_frame_mfcc(mag: list[float], sample_rate: int, n_mfcc: int = 13) -> list[float]:
    """Compute 13 MFCCs from an FFT magnitude spectrum."""
    if not mag:
        return [0.0] * n_mfcc

    n_filters = 26
    n_fft = len(mag)
    low_freq_mel = 0
    high_freq_mel = 2595 * math.log10(1 + (sample_rate / 2) / 700)
    mel_points = [low_freq_mel + i * (high_freq_mel - low_freq_mel) / (n_filters + 1) for i in range(n_filters + 2)]
    hz_points = [700 * (10 ** (m / 2595) - 1) for m in mel_points]
    bin_points = [int(h * n_fft * 2 / sample_rate) for h in hz_points]

    filterbank = []
    for m in range(1, n_filters + 1):
        f_m_minus = bin_points[m - 1]
        f_m = bin_points[m]
        f_m_plus = bin_points[m + 1]
        energy = 0.0
        for k in range(max(0, f_m_minus), min(n_fft, f_m)):
            if f_m != f_m_minus:
                energy += mag[k] * (k - f_m_minus) / (f_m - f_m_minus)
        for k in range(max(0, f_m), min(n_fft, f_m_plus)):
            if f_m_plus != f_m:
                energy += mag[k] * (f_m_plus - k) / (f_m_plus - f_m)
        filterbank.append(math.log(max(energy, 1e-10)))

    # DCT-II to get MFCCs
    mfcc = []
    for n_c in range(n_mfcc):
        coeff = sum(
            filterbank[m] * math.cos(math.pi * n_c * (m + 0.5) / n_filters)
            for m in range(n_filters)
        )
        mfcc.append(coeff)
    return mfcc


def _analyze_entire_speech(
    samples: list[float],
    sample_rate: int,
    n_mfcc: int = 13,
) -> tuple[list[float], float | None, float, float, float]:
    """
    Multi-frame Voice Activity Detection (VAD) and feature extraction
    over the ENTIRE audio signal.
    Returns:
      (mean_mfcc, dominant_pitch, pitch_std, mean_flatness, high_freq_flatness)
    """
    frame_size = 512
    hop_size = 256
    n = len(samples)
    if n < frame_size:
        return [0.0] * n_mfcc, None, 0.0, 0.0, 0.0

    # 1. Segment into frames and compute RMS for VAD
    frames = []
    frame_rms_list = []
    for start in range(0, n - frame_size + 1, hop_size):
        frame = samples[start:start + frame_size]
        r = _rms(frame)
        frames.append(frame)
        frame_rms_list.append(r)

    if not frame_rms_list:
        return [0.0] * n_mfcc, None, 0.0, 0.0, 0.0

    max_rms = max(frame_rms_list)
    # Energy threshold for active speech frames
    vad_threshold = max(0.005, 0.08 * max_rms)

    speech_frames = [f for f, r in zip(frames, frame_rms_list) if r >= vad_threshold]
    if not speech_frames:
        speech_frames = frames

    # 2. Select up to 32 representative frames evenly distributed across speech
    max_frames_to_eval = 32
    if len(speech_frames) <= max_frames_to_eval:
        sampled_frames = speech_frames
    else:
        step = len(speech_frames) / max_frames_to_eval
        sampled_frames = [speech_frames[int(i * step)] for i in range(max_frames_to_eval)]

    # 3. Compute MFCCs and spectra across all sampled frames
    all_mfccs = []
    all_flatness = []
    all_hf_flatness = []
    pitches = []

    # Pre-calculate Hamming window
    hamm = [0.54 - 0.46 * math.cos(2 * math.pi * i / (frame_size - 1)) for i in range(frame_size)]

    for f in sampled_frames:
        windowed = [f[i] * hamm[i] for i in range(frame_size)]
        mag = _fft_magnitude(windowed)
        if mag:
            f_mfcc = _compute_frame_mfcc(mag, sample_rate, n_mfcc)
            all_mfccs.append(f_mfcc)
            
            # Overall flatness
            flat = _spectral_flatness(mag)
            all_flatness.append(flat)
            
            # High-frequency band flatness (> 3500 Hz)
            hf_start_bin = int(3500 * len(mag) * 2 / sample_rate)
            if hf_start_bin < len(mag):
                hf_mag = mag[hf_start_bin:]
                all_hf_flatness.append(_spectral_flatness(hf_mag))

        # Pitch on this frame
        p = _frame_pitch_autocorr(f, sample_rate)
        if p is not None:
            pitches.append(p)

    # 4. Average MFCC vector across all speech frames
    if all_mfccs:
        mean_mfcc = [
            sum(all_mfccs[i][c] for i in range(len(all_mfccs))) / len(all_mfccs)
            for c in range(n_mfcc)
        ]
    else:
        mean_mfcc = [0.0] * n_mfcc

    # 5. Pitch statistics
    if pitches:
        sorted_pitches = sorted(pitches)
        dominant_pitch = sorted_pitches[len(sorted_pitches) // 2]  # Median pitch
        pitch_mean = sum(pitches) / len(pitches)
        pitch_std = (
            math.sqrt(sum((p - pitch_mean) ** 2 for p in pitches) / len(pitches))
            if len(pitches) >= 2
            else 0.0
        )
    else:
        dominant_pitch = None
        pitch_std = 0.0

    mean_flatness = sum(all_flatness) / len(all_flatness) if all_flatness else 0.0
    mean_hf_flatness = sum(all_hf_flatness) / len(all_hf_flatness) if all_hf_flatness else 0.0

    return mean_mfcc, dominant_pitch, pitch_std, mean_flatness, mean_hf_flatness


def _heuristic_authenticity(
    flatness: float,
    zcr: float,
    pitch: float | None,
    pitch_std: float,
) -> float:
    """
    HEURISTIC ONLY — Higher = more likely genuine.
    Evaluates acoustic naturalness, formant dynamics, and pitch variation.
    """
    score = 0.5  # start neutral

    # Natural speech has moderate spectral flatness (0.05–0.35)
    if 0.04 < flatness < 0.35:
        score += 0.15
    elif flatness > 0.45:
        # Vocoder or synthetic noise
        score -= 0.20

    # Natural speech has moderate ZCR
    if 0.03 < zcr < 0.25:
        score += 0.15
    elif zcr < 0.01 or zcr > 0.4:
        score -= 0.15

    # Detectable pitch within natural human voice range
    if pitch is not None and 75 <= pitch <= 500:
        score += 0.10
        # Natural human speech has pitch variation (inflections, jitter)
        if pitch_std >= 12.0:
            score += 0.15
        elif pitch_std < 7.0:
            # Robotic monotone or quantized pitch
            score -= 0.20
    else:
        score -= 0.10

    return max(0.0, min(1.0, score))


def extract_features(audio_bytes: bytes) -> AudioFeatures:
    """
    Extract audio features from WAV bytes across the entire utterance.
    Handles silent / too-short audio gracefully.
    """
    if len(audio_bytes) < 44:  # smaller than smallest valid WAV header
        return AudioFeatures(
            duration_ms=0, sample_rate=16000, num_channels=1, num_frames=0,
            rms=0.0, zcr=0.0, spectral_centroid=0.0, spectral_flatness=0.0,
            spectral_rolloff=0.0, pitch_hz=None, heuristic_authenticity=0.0,
            mfcc_vector=[0.0] * 13, is_valid=False,
            validation_message="Audio too short or empty."
        )

    samples, sr, nc = _decode_wav_bytes(audio_bytes)
    n_frames = len(samples)

    if n_frames < 200:
        return AudioFeatures(
            duration_ms=0, sample_rate=sr, num_channels=nc, num_frames=n_frames,
            rms=0.0, zcr=0.0, spectral_centroid=0.0, spectral_flatness=0.0,
            spectral_rolloff=0.0, pitch_hz=None, heuristic_authenticity=0.0,
            mfcc_vector=[0.0] * 13, is_valid=False,
            validation_message="Audio too short — minimum 0.5 seconds required."
        )

    duration_ms = int(n_frames / sr * 1000)

    # Check silence
    rms_val = _rms(samples)
    if rms_val < 0.001:
        return AudioFeatures(
            duration_ms=duration_ms, sample_rate=sr, num_channels=nc, num_frames=n_frames,
            rms=rms_val, zcr=0.0, spectral_centroid=0.0, spectral_flatness=0.0,
            spectral_rolloff=0.0, pitch_hz=None, heuristic_authenticity=0.0,
            mfcc_vector=[0.0] * 13, is_valid=False,
            validation_message="Audio appears silent. Please speak clearly."
        )

    zcr_val = _zcr(samples)

    # Full-utterance multi-frame analysis
    (
        mean_mfcc,
        dominant_pitch,
        pitch_std,
        mean_flatness,
        hf_flatness,
    ) = _analyze_entire_speech(samples, sr)

    # FFT-based spectral centroid and rolloff on speech
    fft_samples = samples[:min(2048, len(samples))]
    magnitudes = _fft_magnitude(fft_samples)
    centroid = _spectral_centroid(magnitudes, sr) if magnitudes else 0.0
    rolloff = _spectral_rolloff(magnitudes, sr) if magnitudes else 0.0

    authenticity = _heuristic_authenticity(mean_flatness, zcr_val, dominant_pitch, pitch_std)

    return AudioFeatures(
        duration_ms=duration_ms,
        sample_rate=sr,
        num_channels=nc,
        num_frames=n_frames,
        rms=round(rms_val, 6),
        zcr=round(zcr_val, 6),
        spectral_centroid=round(centroid, 2),
        spectral_flatness=round(mean_flatness, 6),
        spectral_rolloff=round(rolloff, 2),
        pitch_hz=round(dominant_pitch, 1) if dominant_pitch else None,
        heuristic_authenticity=round(authenticity, 4),
        mfcc_vector=[round(c, 4) for c in mean_mfcc],
        is_valid=True,
        validation_message="OK",
        pitch_std=round(pitch_std, 2),
        high_freq_flatness=round(hf_flatness, 6),
        voiced_ratio=round(1.0 if dominant_pitch else 0.0, 2),
    )
