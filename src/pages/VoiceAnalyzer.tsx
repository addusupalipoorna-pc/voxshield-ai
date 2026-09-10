import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Upload,
  Play,
  RotateCw,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  UserCheck,
  Radio,
  FileAudio,
  ArrowRight,
  Info,
} from 'lucide-react';
import { analyzeVoice } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { startWavRecording, type WavRecorderSession } from '../lib/wavRecorder';

interface AnalysisResult {
  analysis_id: string;
  status: string;
  transcript: string;
  audio: any;
  features: any;
  deepfake_detection: any;
  speaker_verification: any;
  replay_detection: any;
  risk: any;
}

function PipelineStep({
  label,
  icon,
  status,
  result,
  detail,
}: {
  label: string;
  icon: React.ReactNode;
  status: 'idle' | 'running' | 'done' | 'warn' | 'fail';
  result?: string;
  detail?: string;
}) {
  const getBadgeStyle = () => {
    switch (status) {
      case 'done':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'warn':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'fail':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'running':
        return 'bg-blue-50 text-[#0B3B82] border-blue-200';
      default:
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  return (
    <div className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-all">
      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs text-slate-700">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">{label}</span>
          {result && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getBadgeStyle()}`}>
              {result}
            </span>
          )}
        </div>
        {detail && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{detail}</p>}
      </div>
    </div>
  );
}

function RiskGaugeInline({ score, level }: { score: number; level: string }) {
  const getColor = () => {
    if (level === 'SAFE' || score <= 30) return '#15803D';
    if (level === 'CAUTION' || score <= 60) return '#B45309';
    return '#B91C1C';
  };
  const color = getColor();
  const angle = (score / 100) * 180 - 90;

  return (
    <div className="text-center py-4">
      <div className="relative inline-block">
        <svg viewBox="0 0 200 110" width="180" height="100">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#E2E8F0" strokeWidth="14" strokeLinecap="round" />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 251} 251`}
            style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s ease' }}
          />
          <line
            x1="100"
            y1="100"
            x2={100 + 65 * Math.cos(((angle - 90) * Math.PI) / 180)}
            y2={100 + 65 * Math.sin(((angle - 90) * Math.PI) / 180)}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="100" cy="100" r="5" fill={color} />
          <text x="20" y="108" fontSize="10" fill="#64748B" textAnchor="middle">0</text>
          <text x="180" y="108" fontSize="10" fill="#64748B" textAnchor="middle">100</text>
        </svg>
        <div className="absolute bottom-2 left-0 right-0 text-center">
          <div className="text-2xl font-black text-slate-900 tracking-tight" style={{ color }}>
            {score.toFixed(0)}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {level} RISK
          </div>
        </div>
      </div>
    </div>
  );
}

function WaveformBar({ value }: { value: number }) {
  return (
    <div
      className="w-1 bg-[#155EAD] rounded-full transition-all duration-75"
      style={{
        height: `${Math.max(6, value * 64)}px`,
        opacity: Math.max(0.4, value),
      }}
    />
  );
}

export default function VoiceAnalyzer() {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'idle' | 'recording' | 'recorded' | 'analyzing' | 'done'>('idle');
  const [waveData, setWaveData] = useState<number[]>(new Array(48).fill(0.1));

  const wavSessionRef = useRef<WavRecorderSession | null>(null);
  const animFrameRef = useRef<number>(0);
  const speechRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = useCallback(async () => {
    setError('');
    setResult(null);
    setTranscript('');

    try {
      const session = await startWavRecording('voice_analysis.wav', 48);
      wavSessionRef.current = session;

      const animate = () => {
        if (wavSessionRef.current) {
          setWaveData(wavSessionRef.current.getWaveData());
          animFrameRef.current = requestAnimationFrame(animate);
        }
      };
      animate();

      setRecording(true);
      setStep('recording');

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const speech = new SpeechRecognition();
        speech.continuous = true;
        speech.interimResults = true;
        speech.onresult = (e: any) => {
          const t = Array.from(e.results)
            .map((r: any) => r[0].transcript)
            .join(' ');
          setTranscript(t);
        };
        speech.start();
        speechRef.current = speech;
      }
    } catch (e: any) {
      setError('Microphone access denied. Please verify browser permissions.');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    cancelAnimationFrame(animFrameRef.current);
    setWaveData(new Array(48).fill(0.1));

    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch {}
    }

    if (!wavSessionRef.current) return;
    const session = wavSessionRef.current;
    wavSessionRef.current = null;
    setRecording(false);

    try {
      const { blob } = await session.stop();
      setAudioBlob(blob);
      setStep('recorded');
    } catch (e: any) {
      setError('Failed to process audio recording');
      setStep('idle');
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioBlob(file);
    setStep('recorded');
    setResult(null);
    setError('');
  };

  const runAnalysis = async () => {
    if (!audioBlob) return;
    setAnalyzing(true);
    setStep('analyzing');
    setError('');
    try {
      const res = await analyzeVoice(audioBlob, transcript);
      setResult(res);
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Voice analysis failed. Ensure backend service is running.');
      setStep('recorded');
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setStep('idle');
    setAudioBlob(null);
    setResult(null);
    setTranscript('');
    setError('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
            <span>/</span>
            <span className="text-slate-800">Biometric Voice Analyzer</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
            Real-Time Voice Analysis Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluate acoustic features, 1:N speaker embeddings, anti-deepfake artifacts, and room-impulse replay signatures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/attack-simulator"
            className="px-3.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-all no-underline"
          >
            Attack Simulator
          </Link>
          <Link
            to="/command-center"
            className="px-3.5 py-1.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-semibold rounded-lg shadow-xs transition-all no-underline"
          >
            Command Center →
          </Link>
        </div>
      </div>

      {/* Guest Mode Notice if unauthenticated */}
      {!user && (
        <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between gap-4 text-xs text-slate-700">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-[#0B3B82] shrink-0" />
            <span>
              <strong>Guest Verification:</strong> Acoustic DSP, deepfake detection, and replay checks run locally. Sign in to test 1:N enrolled speaker matching and workstation command triggers.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/login" className="font-bold text-[#0B3B82] hover:underline">
              Sign In
            </Link>
            <span>•</span>
            <Link to="/register" className="font-bold text-[#0B3B82] hover:underline">
              Register
            </Link>
          </div>
        </div>
      )}

      {/* Main Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 6 cols: Audio Input & Recording & Pipeline */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Card 1: Input Control */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Mic className="w-4 h-4 text-[#0B3B82]" />
              Acoustic Audio Capture
            </h2>

            {/* Waveform Visualization Box */}
            <div className="h-20 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center gap-1.5 mb-4 overflow-hidden">
              {waveData.map((v, i) => (
                <WaveformBar key={i} value={recording ? v : 0.08} />
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mb-4">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={analyzing}
                  className="flex-1 py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  Record Audio
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 animate-pulse"
                >
                  <MicOff className="w-4 h-4" />
                  Stop Recording
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing || recording}
                className="px-4 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-2"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                Upload WAV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {audioBlob && (
              <div className="mb-4 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Sample captured — {(audioBlob.size / 1024).toFixed(1)} KB ready for analysis
              </div>
            )}

            {/* Transcript Textarea */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Spoken Command / Utterance
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Spoken words will auto-transcribe here, or you may enter command text directly..."
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all resize-none"
              />
            </div>

            {/* Run Analysis Trigger */}
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={runAnalysis}
                disabled={!audioBlob || analyzing}
                className="flex-1 py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Executing Neural Analysis...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Run Voice Analysis Pipeline
                  </>
                )}
              </button>
              {step !== 'idle' && (
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-3 border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-all"
                >
                  Reset
                </button>
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Card 2: Pipeline Steps */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0B3B82]" />
              Inspection Pipeline Architecture
            </h2>
            <div className="space-y-2.5">
              <PipelineStep
                label="Audio DSP Feature Extraction"
                icon={<Activity className="w-4 h-4 text-[#0B3B82]" />}
                status={result ? 'done' : analyzing ? 'running' : 'idle'}
                result={result?.features ? 'COMPLETE' : undefined}
                detail={
                  result?.features
                    ? `Duration: ${result.audio.duration_ms}ms • Sample Rate: ${result.audio.sample_rate}Hz • RMS Energy: ${result.features.rms.toFixed(4)}`
                    : 'Extracts pitch, zero-crossing, spectral roll-off, and energy'
                }
              />
              <PipelineStep
                label="Deepfake Detection (AASIST / GMM)"
                icon={<Shield className="w-4 h-4 text-[#0B3B82]" />}
                status={
                  result?.deepfake_detection
                    ? result.deepfake_detection.label === 'LIKELY_GENUINE'
                      ? 'done'
                      : 'fail'
                    : analyzing
                    ? 'running'
                    : 'idle'
                }
                result={result?.deepfake_detection?.label}
                detail={
                  result?.deepfake_detection
                    ? `Synthetic Probability: ${(result.deepfake_detection.synthetic_probability * 100).toFixed(1)}% • ${result.deepfake_detection.disclaimer || 'Acoustic artifact audit'}`
                    : 'Scans high-frequency phase discontinuities and vocoder artifacts'
                }
              />
              <PipelineStep
                label="1:N Speaker Identification"
                icon={<UserCheck className="w-4 h-4 text-[#0B3B82]" />}
                status={
                  result?.speaker_verification
                    ? result.speaker_verification.label === 'MATCH'
                      ? 'done'
                      : 'fail'
                    : analyzing
                    ? 'running'
                    : 'idle'
                }
                result={result?.speaker_verification?.label}
                detail={
                  result?.speaker_verification
                    ? `Similarity: ${result.speaker_verification.similarity !== null ? (result.speaker_verification.similarity * 100).toFixed(1) + '%' : 'N/A'} • Enrolled Profile: ${result.speaker_verification.has_profile ? 'Active' : 'Unenrolled'}`
                    : 'Matches 512-dim cosine embeddings against registered voice identities'
                }
              />
              <PipelineStep
                label="Physical Replay & Impulse Detection"
                icon={<Radio className="w-4 h-4 text-[#0B3B82]" />}
                status={
                  result?.replay_detection
                    ? result.replay_detection.label === 'CLEAR'
                      ? 'done'
                      : 'fail'
                    : analyzing
                    ? 'running'
                    : 'idle'
                }
                result={result?.replay_detection?.label}
                detail={
                  result?.replay_detection
                    ? result.replay_detection.reasons?.join(' • ') || 'No acoustic reflection detected'
                    : 'Analyzes room reverberation, speaker coloration, and device playback frequency response'
                }
              />
            </div>
          </div>
        </div>

        {/* Right 6 cols: Analysis Results */}
        <div className="lg:col-span-6 space-y-6">
          {result ? (
            <>
              {/* Risk Decision Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Zero-Trust Policy Verdict</h3>
                <RiskGaugeInline score={result.risk.score} level={result.risk.level} />
                <div
                  className={`inline-block px-6 py-2 rounded-xl text-xs font-black tracking-widest uppercase border ${
                    result.risk.decision === 'ALLOW'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : result.risk.decision === 'BLOCK'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  DECISION: {result.risk.decision}
                </div>
              </div>

              {/* Risk Factors Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Risk Contributing Factors</h3>
                <div className="space-y-3">
                  {result.risk.factors?.map((f: any) => (
                    <div key={f.name}>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-600">{f.name}</span>
                        <span className={f.score > 60 ? 'text-red-700' : f.score > 30 ? 'text-amber-700' : 'text-emerald-700'}>
                          {f.score.toFixed(0)}/100
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            f.score > 60 ? 'bg-red-600' : f.score > 30 ? 'bg-amber-500' : 'bg-emerald-600'
                          }`}
                          style={{ width: `${f.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audio DSP Parameters */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Acoustic Signal Parameters</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'RMS Energy', value: result.features.rms?.toFixed(4) },
                    { label: 'Zero Crossing Rate', value: result.features.zcr?.toFixed(4) },
                    { label: 'Spectral Centroid', value: result.features.spectral_centroid?.toFixed(0) + ' Hz' },
                    { label: 'Spectral Flatness', value: result.features.spectral_flatness?.toFixed(4) },
                    { label: 'Spectral Rolloff', value: result.features.spectral_rolloff?.toFixed(0) + ' Hz' },
                    { label: 'Fundamental Pitch', value: result.features.pitch_hz ? result.features.pitch_hz.toFixed(1) + ' Hz' : 'N/A' },
                  ].map((item) => (
                    <div key={item.label} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {item.label}
                      </span>
                      <span className="text-xs font-bold text-slate-800 mt-0.5 block">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Forensics Lab Link */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Telemetry ID:</span>{' '}
                  <span className="font-mono text-[#0B3B82] font-semibold">{result.analysis_id}</span>
                </div>
                <Link
                  to={`/forensics?id=${result.analysis_id}`}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[#0B3B82] font-bold shadow-xs transition-all no-underline"
                >
                  Open Forensics Lab →
                </Link>
              </div>
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 shadow-sm text-center flex flex-col items-center justify-center min-h-[440px]">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0B3B82] mb-4">
                <FileAudio className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Awaiting Audio Input</h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Record an audio sample using your microphone or upload a WAV file to execute the complete zero-trust voice analysis pipeline.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
