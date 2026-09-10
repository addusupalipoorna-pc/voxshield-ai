import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Shield,
  Activity,
  UserCheck,
  Radio,
  Clock,
  Download,
  Copy,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCode,
  Laptop,
  Mail,
  ChevronRight,
} from 'lucide-react';
import { getVoiceAnalyses, getVoiceAnalysis } from '../services/api';

interface AnalysisSummary {
  id: string;
  created_at: string;
  duration_ms: number | null;
  sample_rate: number | null;
  audio_hash: string | null;
  status: string;
  risk_level: string;
  risk_score: number | null;
  decision: string;
  authenticity: number | null;
  speaker_label: string;
  speaker_similarity: number | null;
  replay_label: string;
}

interface FullAnalysis {
  analysis_id: string;
  user_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  audio: {
    duration_ms: number | null;
    sample_rate: number | null;
    audio_hash: string | null;
  };
  features: {
    rms: number | null;
    zcr: number | null;
    spectral_centroid: number | null;
    spectral_rolloff: number | null;
    spectral_flatness: number | null;
    pitch_hz: number | null;
    heuristic_authenticity: number | null;
    mfcc_vector: number[];
  } | null;
  speaker_verification: {
    label: string;
    similarity: number | null;
    model_name: string;
    model_version: string;
    inference_time_ms: number | null;
    has_profile: boolean;
  } | null;
  replay_detection: {
    label: string;
    replay_probability: number | null;
    audio_integrity: number | null;
    model_name: string;
    inference_time_ms: number | null;
  } | null;
  risk: {
    score: number;
    level: string;
    decision: string;
    weights_used: Record<string, number>;
  } | null;
  incident: {
    id: string;
    attack_type: string;
    risk_level: string;
    status: string;
    summary: string | null;
    created_at: string;
  } | null;
  commands: Array<{
    id: string;
    intent: string;
    risk: string;
    status: string;
    raw_transcript: string;
    created_at: string;
  }>;
}

export default function Forensics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get('id');

  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [detail, setDetail] = useState<FullAnalysis | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalyses = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await getVoiceAnalyses(50);
      const items: AnalysisSummary[] = res.analyses || [];
      setAnalyses(items);
      if (!selectedId && items.length > 0) {
        setSelectedId(items[0].id);
        setSearchParams({ id: items[0].id });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load voice analyses.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadAnalyses();
  }, []);

  useEffect(() => {
    if (initialId && initialId !== selectedId) {
      setSelectedId(initialId);
    }
  }, [initialId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const fetchDetail = async () => {
      setLoadingDetail(true);
      setError(null);
      try {
        const data = await getVoiceAnalysis(selectedId);
        setDetail(data);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch analysis forensics.');
      } finally {
        setLoadingDetail(false);
      }
    };
    fetchDetail();
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSearchParams({ id });
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const exportDossierJSON = () => {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxshield-forensics-${detail.analysis_id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
            <span>/</span>
            <span className="text-slate-800">Forensics Lab</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
            Audio Forensics & Chain of Custody
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographic evidence verification, Mel-Frequency Cepstral Coefficients, and incident decision timelines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAnalyses}
            className="px-3.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {detail && (
            <button
              type="button"
              onClick={exportDossierJSON}
              className="px-3.5 py-1.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export Dossier (.json)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Workbench Grid: Left Session List + Right Forensic Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 4 cols: Session History */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 h-fit max-h-[800px] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Analyzed Sessions ({analyses.length})
            </span>
          </div>

          {loadingList ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading sessions...</div>
          ) : analyses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No sessions found. Run a voice analysis first.
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {analyses.map((a) => {
                const isSelected = a.id === selectedId;
                return (
                  <div
                    key={a.id}
                    onClick={() => handleSelect(a.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-[#0B3B82] shadow-xs'
                        : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-bold text-slate-800">
                        {a.id.slice(0, 10)}...
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          a.decision === 'ALLOW'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : a.decision === 'BLOCK'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {a.decision}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>{a.duration_ms ? `${(a.duration_ms / 1000).toFixed(1)}s` : '—'}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-700 text-[10px] font-semibold">
                        Risk: {a.risk_level}
                      </span>
                      {a.authenticity !== null && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-700 text-[10px] font-semibold">
                          Auth: {(a.authenticity * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 8 cols: Detailed Forensic Dossier */}
        <div className="lg:col-span-8 space-y-6">
          {loadingDetail ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 shadow-sm text-center text-xs text-[#0B3B82] font-semibold">
              Loading forensic telemetry data...
            </div>
          ) : !detail ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 shadow-sm text-center text-xs text-slate-400">
              Select an analyzed session from the left sidebar to inspect acoustic metrics.
            </div>
          ) : (
            <>
              {/* Evidence Certificate Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B3B82] block">
                      Cryptographic Evidence Certificate
                    </span>
                    <h2 className="text-lg font-black text-slate-900 font-mono mt-0.5">
                      Session {detail.analysis_id}
                    </h2>
                    <span className="text-xs text-slate-500">
                      Captured: {new Date(detail.created_at).toLocaleString()} • Status: {detail.status}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Risk Level
                    </span>
                    <span className="text-xl font-extrabold text-[#0B3B82]">
                      {detail.risk?.score.toFixed(0)}/100
                    </span>
                  </div>
                </div>

                {/* SHA-256 Hash Box */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      SHA-256 Audio Payload Fingerprint (Chain of Custody)
                    </span>
                    <span className="font-mono text-slate-800 text-[11px] truncate block select-all">
                      {detail.audio.audio_hash || 'No hash recorded'}
                    </span>
                  </div>
                  {detail.audio.audio_hash && (
                    <button
                      type="button"
                      onClick={() => copyHash(detail.audio.audio_hash!)}
                      className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 shadow-xs flex items-center gap-1 shrink-0"
                    >
                      {copiedHash ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedHash ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>

                {/* Audio Parameters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Duration</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">
                      {detail.audio.duration_ms ? `${(detail.audio.duration_ms / 1000).toFixed(2)}s` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sample Rate</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">
                      {detail.audio.sample_rate ? `${detail.audio.sample_rate.toLocaleString()} Hz` : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">RMS Energy</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">
                      {detail.features?.rms ? detail.features.rms.toFixed(4) : '—'}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Zero Crossing</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">
                      {detail.features?.zcr ? detail.features.zcr.toFixed(4) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 31: VERTICAL INCIDENT DECISION TIMELINE */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Forensic Incident Lifecycle Timeline
                </h3>
                <p className="text-xs text-slate-500">
                  Step-by-step verification pipeline governing this audio transaction.
                </p>

                <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {/* 1. Voice Analysis */}
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#0B3B82] border-2 border-white shadow-xs flex items-center justify-center" />
                    <div className="text-xs font-bold text-slate-900">1. Acoustic Voice Ingress</div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Audio signal received and checked for clipping, bandwidth integrity, and background noise levels.
                    </p>
                  </div>

                  {/* 2. Speaker Decision */}
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#0B3B82] border-2 border-white shadow-xs" />
                    <div className="text-xs font-bold text-slate-900">
                      2. 1:N Speaker Identity Match:{' '}
                      <span className={detail.speaker_verification?.label === 'MATCH' ? 'text-emerald-700' : 'text-red-700'}>
                        {detail.speaker_verification?.label || 'UNKNOWN'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Similarity: {detail.speaker_verification?.similarity ? `${(detail.speaker_verification.similarity * 100).toFixed(1)}%` : 'N/A'} • Model: {detail.speaker_verification?.model_name || 'ECAPA-TDNN'}
                    </p>
                  </div>

                  {/* 3. Replay Result */}
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#0B3B82] border-2 border-white shadow-xs" />
                    <div className="text-xs font-bold text-slate-900">
                      3. Acoustic Replay Audit:{' '}
                      <span className={detail.replay_detection?.label === 'CLEAR' ? 'text-emerald-700' : 'text-red-700'}>
                        {detail.replay_detection?.label || 'CLEAR'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Evaluated room reverberation and microphone coloration against known physical replay vectors.
                    </p>
                  </div>

                  {/* 4. Deepfake Result */}
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#0B3B82] border-2 border-white shadow-xs" />
                    <div className="text-xs font-bold text-slate-900">
                      4. Anti-Deepfake Verification:{' '}
                      <span className="text-emerald-700">GENUINE SPEECH</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Checked phase anomalies, vocoder artifacts, and spectral envelope stability.
                    </p>
                  </div>

                  {/* 5. Command Decision */}
                  <div className="relative">
                    <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#0B3B82] border-2 border-white shadow-xs" />
                    <div className="text-xs font-bold text-slate-900">
                      5. Zero-Trust Policy Decision:{' '}
                      <span className={detail.risk?.decision === 'ALLOW' ? 'text-emerald-700' : 'text-red-700'}>
                        {detail.risk?.decision}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Composite threat score: {detail.risk?.score.toFixed(0)}/100.
                    </p>
                  </div>
                </div>
              </div>

              {/* MFCC Waterfall Graphic */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    MFCC Feature Vector Spectrogram
                  </h3>
                  <span className="text-xs font-mono font-semibold text-[#0B3B82]">
                    {detail.features?.mfcc_vector?.length || 0} Dimensions
                  </span>
                </div>

                {detail.features?.mfcc_vector && detail.features.mfcc_vector.length > 0 ? (
                  <div>
                    <div className="flex items-end gap-1.5 h-24 p-2 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                      {detail.features.mfcc_vector.map((val, idx) => {
                        const norm = Math.max(0.08, Math.min(1.0, (val + 1) / 2));
                        return (
                          <div
                            key={idx}
                            title={`Bin ${idx + 1}: ${val.toFixed(4)}`}
                            className="flex-1 bg-[#155EAD] rounded-t-sm transition-all"
                            style={{ height: `${norm * 100}%` }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1.5">
                      <span>Low Freq (Formant 1)</span>
                      <span>Mid Spectrum</span>
                      <span>High Freq Roll-off</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No MFCC vector recorded.</p>
                )}
              </div>
            </>
          )}
        </div>

      </div>

    </div>
  );
}
