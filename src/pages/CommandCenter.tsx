import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Shield,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  Mail,
  Smartphone,
  RotateCw,
  UserCheck,
  Radio,
  FileCheck,
  Lock,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import {
  processVoiceCommand,
  continueCommand,
  cancelCommand,
  requestApproval,
  requestOTP,
  getCommandHistory,
  getDevices,
  requestHostAccess,
  verifyHostAccess,
  type ProcessCommandResponse,
} from '../services/api';
import { startWavRecording, type WavRecorderSession } from '../lib/wavRecorder';

type Stage =
  | 'idle'
  | 'recording'
  | 'analyzing'
  | 'waiting_continue'
  | 'awaiting_approval'
  | 'approved'
  | 'blocked'
  | 'executed'
  | 'cancelled';

function CommandBadge({ status }: { status: string }) {
  const getBadgeConfig = () => {
    switch (status) {
      case 'WAITING_FOR_CONTINUE':
        return 'bg-blue-50 text-[#0B3B82] border-blue-200';
      case 'APPROVAL_REQUIRED':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'APPROVED':
      case 'EXECUTED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'BLOCK':
      case 'BLOCKED':
      case 'REJECTED':
      case 'FAILED':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getBadgeConfig()}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('idle');
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processResult, setProcessResult] = useState<ProcessCommandResponse | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [hostMeta, setHostMeta] = useState<any>({
    is_host_owner: true,
    has_host_access: true,
    owner_phone_masked: '+91 ******7166',
    owner_email_masked: 'poo******@gmail.com',
  });
  const [showHostOtpModal, setShowHostOtpModal] = useState(false);
  const [hostOtpCode, setHostOtpCode] = useState('');
  const [hostOtpLoading, setHostOtpLoading] = useState(false);
  const [hostOtpError, setHostOtpError] = useState('');
  const [waveData, setWaveData] = useState<number[]>(new Array(48).fill(0.1));
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  const wavSessionRef = useRef<WavRecorderSession | null>(null);
  const speechRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const animFrameRef = useRef<number>(0);

  const refreshHistoryAndDevices = useCallback(async () => {
    try {
      const hist = await getCommandHistory();
      setHistory(hist.commands || []);
    } catch {}
    try {
      const devRes = await getDevices();
      const devList = devRes.devices || [];
      setDevices(devList);
      setHostMeta({
        is_host_owner: devRes.is_host_owner ?? true,
        has_host_access: devRes.has_host_access ?? true,
        host_available: devRes.host_available ?? true,
        owner_phone_masked: devRes.owner_phone_masked || '+91 ******7166',
        owner_email_masked: devRes.owner_email_masked || 'poo******@gmail.com',
      });
      if (devList.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devList[0].id);
      }
    } catch {}
  }, [selectedDeviceId]);

  const handleRequestHostAccess = async () => {
    setHostOtpLoading(true);
    setHostOtpError('');
    try {
      const res = await requestHostAccess();
      setShowHostOtpModal(true);
      setStatusMessage(res.message || 'OTP verification code sent to Poorna.');
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch host access OTP.');
    } finally {
      setHostOtpLoading(false);
    }
  };

  const handleVerifyHostAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostOtpCode.trim() || hostOtpCode.trim().length !== 6) {
      setHostOtpError('Please enter the 6-digit passcode.');
      return;
    }
    setHostOtpLoading(true);
    setHostOtpError('');
    try {
      const res = await verifyHostAccess(hostOtpCode.trim());
      setStatusMessage(res.message || 'Access granted!');
      setShowHostOtpModal(false);
      setHostOtpCode('');
      await refreshHistoryAndDevices();
    } catch (err: any) {
      setHostOtpError(err.message || 'Invalid or expired passcode.');
    } finally {
      setHostOtpLoading(false);
    }
  };

  useEffect(() => {
    refreshHistoryAndDevices();
    const timer = setInterval(refreshHistoryAndDevices, 5000);
    return () => clearInterval(timer);
  }, [refreshHistoryAndDevices]);

  function isDeviceOnline(devOrLastSeen: any): boolean {
    if (!devOrLastSeen) return false;
    const lastSeenAt = typeof devOrLastSeen === 'string' ? devOrLastSeen : devOrLastSeen.last_seen_at;
    const status = typeof devOrLastSeen === 'object' ? devOrLastSeen.status : 'ACTIVE';
    const isActive = typeof devOrLastSeen === 'object' ? devOrLastSeen.is_active : true;

    if (isActive === false || status === 'REVOKED') return false;
    if (!lastSeenAt) return true;

    const s = lastSeenAt.endsWith('Z') || lastSeenAt.includes('+') ? lastSeenAt : lastSeenAt + 'Z';
    const diff = (Date.now() - new Date(s).getTime()) / 1000;
    return diff < 300 || diff < 0;
  }

  const startRecording = useCallback(async () => {
    setError('');
    setStatusMessage('');
    setTranscript('');
    transcriptRef.current = '';
    setProcessResult(null);

    try {
      const session = await startWavRecording('voice_command.wav', 48);
      wavSessionRef.current = session;

      const animate = () => {
        if (wavSessionRef.current) {
          setWaveData(wavSessionRef.current.getWaveData());
          animFrameRef.current = requestAnimationFrame(animate);
        }
      };
      animate();

      setRecording(true);
      setStage('recording');

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const speech = new SR();
        speech.continuous = true;
        speech.interimResults = true;
        speech.onresult = (e: any) => {
          const detectedTranscript = Array.from(e.results)
            .map((r: any) => r[0].transcript)
            .join(' ')
            .trim();
          transcriptRef.current = detectedTranscript;
          setTranscript(detectedTranscript);
        };
        speech.start();
        speechRef.current = speech;
      }
    } catch (e: any) {
      setError('Microphone access denied: ' + (e.message || 'Check browser permissions'));
      setStage('idle');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    cancelAnimationFrame(animFrameRef.current);
    setRecording(false);
    setWaveData(new Array(48).fill(0.1));

    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch {}
    }

    if (!wavSessionRef.current) return;
    const session = wavSessionRef.current;
    wavSessionRef.current = null;

    setStage('analyzing');
    try {
      const { file: audioFile } = await session.stop();
      const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
      const result = await processVoiceCommand(
        audioFile,
        selectedDevice?.device_name || selectedDevice?.name || undefined,
        transcriptRef.current,
      );
      setProcessResult(result);
      setTranscript(result.transcript);

      const isBlocked =
        result.decision === 'BLOCK' ||
        result.decision === 'BLOCKED' ||
        result.decision === 'REJECTED' ||
        !result.person_detected?.is_authorized ||
        result.person_detected?.is_deepfake ||
        result.intent === 'UNKNOWN';

      if (isBlocked) {
        setStage('blocked');
        setError(
          result.person_detected?.is_deepfake
            ? 'Zero-Trust Violation: Synthetic / AI voice detected. Command execution permanently blocked.'
            : !result.person_detected?.is_authorized
            ? `Zero-Trust Violation: Impostor / Unknown User voice detected (${result.person_detected?.speaker_match_pct || 0}% match). Access blocked.`
            : result.intent === 'UNKNOWN'
            ? 'Execution blocked: Command intent is not in the allowlist. Supported: Open Notepad, Open WhatsApp, Open Calculator, Open Chrome.'
            : (result.message || 'Execution blocked: Voice authenticity or security policy failed.')
        );
      } else if (result.decision === 'APPROVAL_REQUIRED') {
        setStage('awaiting_approval');
        setStatusMessage('High-risk action: Secondary email/OTP approval required.');
      } else if (result.decision === 'WAITING_FOR_CONTINUE') {
        setStage('waiting_continue');
        setStatusMessage('Command verified. Waiting for user CONTINUE confirmation.');
      } else if (result.decision === 'APPROVED' || result.decision === 'EXECUTED') {
        setStage('approved');
        setStatusMessage('Command confirmed and claimed by laptop agent.');
      } else {
        setStage('waiting_continue');
      }
      await refreshHistoryAndDevices();
    } catch (e: any) {
      setError(e.message || 'Voice command pipeline failed');
      setStage('idle');
    }
  }, [devices, selectedDeviceId, refreshHistoryAndDevices]);

  const handleContinue = async () => {
    if (!processResult?.command_id) return;
    setLoadingAction(true);
    setError('');
    try {
      const res = await continueCommand(processResult.command_id, selectedDeviceId || undefined);
      setStage('approved');
      setStatusMessage(res.message || 'Command confirmed! Laptop agent is claiming and executing.');
      await refreshHistoryAndDevices();
    } catch (e: any) {
      setError(e.message || 'Failed to authorize command');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRunCommand = async (cmdId: string) => {
    setLoadingAction(true);
    setError('');
    try {
      const res = await continueCommand(cmdId, selectedDeviceId || undefined);
      setStage('approved');
      setStatusMessage(res.message || 'Command confirmed! Laptop agent is claiming and executing.');
      await refreshHistoryAndDevices();
    } catch (e: any) {
      setError(e.message || 'Failed to authorize command');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCancel = async () => {
    if (!processResult?.command_id) return;
    setLoadingAction(true);
    try {
      await cancelCommand(processResult.command_id);
      setStage('cancelled');
      setStatusMessage('Command execution cancelled by user.');
      await refreshHistoryAndDevices();
    } catch (e: any) {
      setError(e.message || 'Failed to cancel command');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRequestApprovalEmail = async () => {
    if (!processResult?.command_id) return;
    try {
      const res = await requestApproval(processResult.command_id, selectedDeviceId);
      if (!res.email_sent && res.approve_url) {
        const url = new URL(res.approve_url);
        navigate(url.pathname);
      } else {
        setStatusMessage('Approval email dispatched to your registered inbox.');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRequestOTPApproval = async () => {
    if (!processResult?.command_id) return;
    try {
      await requestOTP(processResult.command_id);
      navigate(`/verify-command/${processResult.command_id}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const reset = () => {
    setStage('idle');
    setRecording(false);
    setTranscript('');
    transcriptRef.current = '';
    setProcessResult(null);
    setError('');
    setStatusMessage('');
  };

  const person = processResult?.person_detected;
  const devBinding = processResult?.device_binding;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
            <span>/</span>
            <span className="text-slate-800">Security Operations Interface</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
            Voice Command Security Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Voice-to-action pipeline with 1:N speaker recognition, anti-deepfake policy verification, and laptop CONTINUE execution gating.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0B3B82] text-xs font-bold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Zero-Trust Gateway
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 6 cols: Microphone & Device Selection */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Card: Recording Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
            
            {/* Microphone Circle */}
            <button
              type="button"
              onClick={recording ? stopRecording : stage === 'idle' ? startRecording : undefined}
              className={`w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center transition-all duration-300 shadow-sm ${
                recording
                  ? 'bg-red-50 border-2 border-red-500 text-red-600 animate-pulse scale-105'
                  : 'bg-blue-50/70 border-2 border-[#0B3B82] text-[#0B3B82] hover:bg-blue-100/50 hover:scale-102'
              }`}
            >
              {recording ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
            </button>

            {/* Stage Guidance */}
            <div className="text-xs font-bold uppercase tracking-wider mb-2">
              {stage === 'idle' && <span className="text-slate-500">Ready • Click microphone to speak command</span>}
              {stage === 'recording' && <span className="text-red-600 animate-pulse">● Listening... Speak authorized command now</span>}
              {stage === 'analyzing' && <span className="text-[#0B3B82]">Processing 1:N speaker identification & anti-spoof checks...</span>}
              {stage === 'waiting_continue' && <span className="text-emerald-700">Voice Authenticated • Confirmation Required</span>}
              {stage === 'awaiting_approval' && <span className="text-amber-700">High-Risk • Additional Secondary Verification Required</span>}
              {stage === 'approved' && <span className="text-emerald-700">Command Confirmed & Claimed by Laptop Agent ✓</span>}
              {stage === 'blocked' && <span className="text-red-700">Execution Blocked by Zero-Trust Policy ✗</span>}
              {stage === 'cancelled' && <span className="text-slate-500">Command Cancelled</span>}
            </div>

            {/* Waveform Visualization */}
            <div className="h-12 bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center justify-center gap-1.5 mb-4 overflow-hidden">
              {waveData.map((v, i) => (
                <div
                  key={i}
                  className="w-1 bg-[#155EAD] rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, (recording ? v : 0.08) * 36)}px`,
                    opacity: Math.max(0.4, v),
                  }}
                />
              ))}
            </div>

            {/* Spoken Transcript Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs mb-6">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Detected Utterance
              </span>
              <p className="text-slate-800 font-medium italic">
                {transcript ? `"${transcript}"` : 'Spoken command words will appear here in real-time...'}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {stage === 'idle' && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex-1 py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <Mic className="w-4 h-4" />
                  Start Voice Command
                </button>
              )}
              {recording && (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 animate-pulse"
                >
                  <MicOff className="w-4 h-4" />
                  Stop & Validate
                </button>
              )}
              {stage !== 'idle' && !recording && (
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-all"
                >
                  ↺ New Command
                </button>
              )}
            </div>

            {/* Status Notices */}
            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs text-left flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {statusMessage && (
              <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-[#0B3B82] text-xs text-left flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{statusMessage}</span>
              </div>
            )}
          </div>

          {/* Card: Target Laptop Binding */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Laptop className="w-4 h-4 text-[#0B3B82]" />
                Target Laptop Execution Binding
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Hardware Enclave
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Voice commands can only execute on workstations paired with cryptographic agent heartbeats.
            </p>

            <div className="space-y-2">
              {devices.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-3">
                  <div className="flex items-center gap-2 text-slate-700 font-bold">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>No Personal Workstation Enclave Registered</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Workstations are strictly isolated for zero-trust privacy. You can register your own laptop in Settings, or request verified OTP access to Poorna's laptop.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => navigate('/settings')}
                      className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs text-center"
                    >
                      Register My Laptop
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestHostAccess}
                      disabled={hostOtpLoading}
                      className="px-3 py-2 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-60 cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {hostOtpLoading ? 'Sending OTP to Poorna...' : "Request Access to Host Laptop (Poorna)"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {devices.map((dev) => {
                    const online = isDeviceOnline(dev);
                    const isSelected = selectedDeviceId === dev.id;
                    const isDelegated = Boolean(dev.is_delegated);
                    return (
                      <div
                        key={dev.id}
                        onClick={() => setSelectedDeviceId(dev.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50/60 border-[#0B3B82] shadow-xs'
                            : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                            {dev.device_name || dev.name}
                            {isDelegated && (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                OTP Verified
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {dev.platform || 'Windows 11'} • Agent v{dev.agent_version || '1.0.0'}
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            online
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`} />
                          {online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    );
                  })}
                  {!hostMeta.is_host_owner && !hostMeta.has_host_access && (
                    <button
                      type="button"
                      onClick={handleRequestHostAccess}
                      disabled={hostOtpLoading}
                      className="w-full py-2 px-3 bg-blue-50/50 hover:bg-blue-50 border border-dashed border-blue-200 text-[#0B3B82] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-2"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {hostOtpLoading ? 'Sending OTP to Poorna...' : "Also Connect to Poorna's Laptop (Requires OTP)"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right 6 cols: Person Detected & Execution Gate */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* SECTION 28 & 29: COMMAND OPERATIONS CARD */}
          {processResult ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              
              {/* Top Banner: Status and Risk */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                    {processResult.decision === 'BLOCKED' || processResult.decision === 'BLOCK'
                      ? 'Blocked Command Operation'
                      : 'Pending Command Operation'}
                  </span>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                    {processResult.intent.replace(/_/g, ' ')}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                      processResult.risk_level === 'LOW'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : processResult.risk_level === 'HIGH' || processResult.risk_level === 'CRITICAL'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    RISK: {processResult.risk_level}
                  </span>
                  <CommandBadge status={processResult.decision} />
                </div>
              </div>

              {/* Speaker & Device Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Speaker</span>
                  <span className={`font-bold mt-0.5 block ${person?.is_authorized && !person?.is_deepfake ? 'text-slate-900' : 'text-red-700 font-extrabold'}`}>
                    {person?.is_deepfake
                      ? 'AI Synthetic Impostor'
                      : person?.is_authorized
                      ? (person?.name || 'Poorna Chandar')
                      : 'Unknown User'}
                  </span>
                  <span className={`text-[10px] font-semibold ${person?.is_authorized && !person?.is_deepfake ? 'text-emerald-700' : 'text-red-600'}`}>
                    {person?.is_deepfake
                      ? 'Deepfake Impersonation Rejected'
                      : person?.is_authorized
                      ? `${person?.speaker_match_pct || 94}% Confidence Match`
                      : `${person?.speaker_match_pct || 0}% Match • Impostor / Unenrolled`}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Device</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {devBinding?.device_name || "Poorna's Windows Laptop"}
                  </span>
                  <span className={`text-[10px] font-medium ${person?.is_authorized && !person?.is_deepfake ? 'text-slate-500' : 'text-red-600 font-semibold'}`}>
                    {person?.is_authorized && !person?.is_deepfake ? 'Local Agent Enclave' : 'Execution Blocked (Zero-Trust)'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Voice Authenticity</span>
                  <span className={`font-bold mt-0.5 block ${!person?.is_deepfake ? 'text-emerald-700' : 'text-red-700 font-extrabold'}`}>
                    {!person?.is_deepfake ? '✓ Genuine Voice' : '✗ Synthetic / Deepfake'}
                  </span>
                  <span className={`text-[10px] font-semibold ${!person?.is_deepfake ? 'text-emerald-600' : 'text-red-600'}`}>
                    {!person?.is_deepfake ? 'Natural acoustic impulse' : 'Vocoder / TTS Artifacts Detected'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Replay Analysis</span>
                  <span className={`font-bold mt-0.5 block ${!person?.is_replay ? 'text-emerald-700' : 'text-red-700 font-extrabold'}`}>
                    {!person?.is_replay ? '✓ Clear (Live Impulse)' : '✗ Replay Artifacts'}
                  </span>
                  <span className={`text-[10px] font-semibold ${!person?.is_replay ? 'text-emerald-600' : 'text-red-600'}`}>
                    {!person?.is_replay ? 'Live vocal tract impulse' : 'Acoustic replay detected'}
                  </span>
                </div>
              </div>

              {/* SECTION: ZERO-TRUST BLOCKED ALERT */}
              {(processResult.decision === 'BLOCKED' || processResult.decision === 'BLOCK' || !person?.is_authorized || person?.is_deepfake || processResult.intent === 'UNKNOWN') && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-red-700">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    EXECUTION BLOCKED BY ZERO-TRUST POLICY
                  </div>
                  <p className="text-xs text-red-800 leading-relaxed font-medium">
                    {person?.is_deepfake
                      ? 'Security violation: Synthetic / AI-generated voice or deepfake impersonation detected. High-frequency vocoder phase artifacts and unnatural pitch invariance identified. Command execution permanently blocked on workstation.'
                      : !person?.is_authorized
                      ? `Security violation: Voice identity does not match authorized owner (${person?.name && person?.name !== 'Unknown User' ? person.name : 'Poorna'}). Impostor or unknown user detected (${person?.speaker_match_pct || 0}% match). Command execution blocked on laptop.`
                      : processResult.intent === 'UNKNOWN'
                      ? 'Command intent is not recognized or not allowlisted. Supported actions: Open Notepad, Open WhatsApp, Open Calculator, Open Chrome, Lock Workstation.'
                      : processResult.message || 'Execution blocked by security policy.'}
                  </p>
                </div>
              )}

              {/* Utterance Quote */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 italic">
                "{processResult.transcript}"
              </div>

              {/* SECTION 29: HIGH-RISK ADDITIONAL VERIFICATION BANNER (Only when not blocked) */}
              {stage !== 'blocked' &&
                processResult.decision !== 'BLOCKED' &&
                processResult.decision !== 'BLOCK' &&
                person?.is_authorized &&
                processResult.intent !== 'UNKNOWN' &&
                (processResult.risk_level === 'HIGH' || processResult.risk_level === 'CRITICAL' || stage === 'awaiting_approval') && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ADDITIONAL VERIFICATION REQUIRED
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    This command involves sensitive actions. Policy requires secondary verification before entering the local laptop CONTINUE gate.
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-amber-900 pt-1">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      Voice verification
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      Speaker identity
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      Anti-spoof checks
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      Email approval link
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      OTP verification code
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                      Laptop CONTINUE gate
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleRequestApprovalEmail}
                      className="py-2.5 px-3 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5 text-amber-700" />
                      Email Approval Link
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestOTPApproval}
                      className="py-2.5 px-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-cyan-300" />
                      Enter 6-Digit OTP
                    </button>
                  </div>
                </div>
              )}

              {/* SECTION: ZERO-TRUST DENIED GUIDANCE */}
              {(stage === 'blocked' || processResult.decision === 'BLOCKED' || processResult.decision === 'BLOCK') && (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 leading-relaxed font-medium">
                    <strong>Zero-Trust Policy: Execution Denied.</strong> Workstation execution is strictly restricted to enrolled authorized user Poorna. This security violation has been logged to the audit ledger.
                  </div>
                  <button
                    type="button"
                    onClick={reset}
                    className="w-full py-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    ↺ Authenticate as Enrolled User
                  </button>
                </div>
              )}

              {/* SECTION 28: CONTINUATION GATING BUTTONS */}
              {stage === 'waiting_continue' && (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-[#0B3B82] leading-relaxed">
                    <strong>Status: WAITING FOR USER CONFIRMATION.</strong> The command has been verified by biometric policy and will execute on your Windows Laptop once you press CONTINUE.
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleContinue}
                      disabled={loadingAction}
                      className="flex-2 py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loadingAction ? 'Authorizing...' : 'CONTINUE'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={loadingAction}
                      className="flex-1 py-3 bg-white border border-red-300 hover:bg-red-50 text-red-700 text-xs font-bold rounded-xl transition-all shadow-xs"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}

              {stage === 'approved' && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold block">Command Confirmed and Claimed</span>
                      <span>Laptop agent has executed the action. Security audit notification sent.</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={loadingAction}
                    className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0B3B82] text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    {loadingAction ? 'Opening...' : 'Open Again / Re-Execute Anytime'}
                  </button>
                </div>
              )}

              {stage === 'blocked' && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5">
                  <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <div>
                    <span className="font-bold block">Execution Blocked</span>
                    <span>Impersonation detected or speaker match fell below zero-trust threshold.</span>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 shadow-sm text-center flex flex-col items-center justify-center min-h-[380px]">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0B3B82] mb-3">
                <FileCheck className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Awaiting Voice Command</h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Click the microphone to speak a command (e.g. "Open WhatsApp", "Lock workstation"). The system will identify the speaker and bind to your trusted laptop.
              </p>
            </div>
          )}

          {/* Recent Commands Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Recent Command Operations
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No voice commands executed yet.</p>
            ) : (
              <div className="space-y-2">
                {history.slice(0, 5).map((cmd) => (
                  <div
                    key={cmd.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{cmd.intent.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] text-slate-400 ml-2">
                        {new Date(cmd.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CommandBadge status={cmd.status} />
                      <button
                        type="button"
                        onClick={() => handleRunCommand(cmd.id)}
                        disabled={loadingAction}
                        className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-[#0B3B82] text-[11px] font-bold rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Open or re-run this command anytime"
                      >
                        <ArrowRight className="w-3 h-3 text-[#0B3B82]" />
                        Run
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* HOST ENCLAVE ACCESS OTP VERIFICATION MODAL */}
      {showHostOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0B3B82]">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Host Enclave Verification</h3>
                  <span className="text-xs font-semibold text-slate-400">Owner Authorization Required</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHostOtpModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Verification Code Dispatched</span>
              </div>
              <p className="text-[12px] text-slate-700 leading-relaxed">
                For security, a 6-digit authorization code was sent directly to <strong>Poorna's Phone ({hostMeta.owner_phone_masked || '+91 ******7166'})</strong> and Email.
              </p>
              <p className="text-[11px] font-medium text-slate-500">
                Ask Poorna for the verification passcode to authorize command execution on their laptop.
              </p>
            </div>

            {hostOtpError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {hostOtpError}
              </div>
            )}

            <form onSubmit={handleVerifyHostAccess} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Enter 6-Digit Passcode
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={hostOtpCode}
                  onChange={(e) => setHostOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full text-center tracking-[0.6em] text-2xl font-mono font-bold py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white text-slate-900"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowHostOtpModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={hostOtpLoading || hostOtpCode.length !== 6}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {hostOtpLoading ? 'Verifying...' : 'Verify & Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
