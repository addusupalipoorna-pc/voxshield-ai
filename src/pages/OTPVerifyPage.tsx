import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, CheckCircle, RefreshCw, Loader2, KeyRound, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { OTPInput } from '../components/OTPInput';

const BASE = '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('voxshield_access_token') || localStorage.getItem('voxshield_token');
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

type PageState = 'entry' | 'verifying' | 'verified' | 'failed' | 'expired' | 'locked';

const EXPIRE_SECONDS = 300; // 5 minutes

export default function OTPVerifyPage() {
  const { commandId } = useParams<{ commandId: string }>();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [state, setState] = useState<PageState>('entry');
  const [errorMsg, setErrorMsg] = useState('');
  const [remaining, setRemaining] = useState(EXPIRE_SECONDS);
  const [resendCount, setResendCount] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(5);

  // Countdown timer
  useEffect(() => {
    if (state !== 'entry' && state !== 'verifying') return;
    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(id); setState('expired'); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const handleVerify = async (codeToVerify: string) => {
    if (!commandId || codeToVerify.length !== 6) return;
    setState('verifying');
    setErrorMsg('');
    try {
      await apiFetch('/commands/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ command_id: commandId, code: codeToVerify }),
      });
      setState('verified');
    } catch (e: any) {
      const msg: string = e.message || 'Verification failed';
      if (msg.includes('expired')) { setState('expired'); return; }
      if (msg.includes('attempts') && msg.includes('No more')) {
        setState('locked');
        return;
      }
      const match = msg.match(/(\d+) attempt/);
      if (match) setAttemptsLeft(parseInt(match[1]));
      else setAttemptsLeft(a => Math.max(0, a - 1));

      setState('entry');
      setErrorMsg(msg);
      setCode('');
    }
  };

  const handleResend = async () => {
    if (!commandId || resendCooldown > 0 || resendCount >= 3) return;
    try {
      await apiFetch('/commands/request-otp', {
        method: 'POST',
        body: JSON.stringify({ command_id: commandId }),
      });
      setResendCount(c => c + 1);
      setResendCooldown(60);
      setRemaining(EXPIRE_SECONDS);
      setCode('');
      setErrorMsg('');
      setState('entry');
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to resend OTP.');
    }
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timerColor = remaining > 60 ? '#15803D' : remaining > 30 ? '#B45309' : '#B91C1C';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans">
      <AnimatePresence mode="wait">
        {/* Entry state */}
        {(state === 'entry' || state === 'verifying') && (
          <motion.div
            key="entry"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-md"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5 px-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vs-navy flex items-center justify-center text-white shadow-sm">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h1 className="text-base font-bold text-vs-ink tracking-tight">VOXSHIELD AI</h1>
                  <span className="inline-block text-[11px] font-semibold text-vs-blue tracking-wider uppercase">
                    Two-Factor Authorization
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
                <Clock size={13} style={{ color: timerColor }} />
                <span className="font-mono font-bold text-xs" style={{ color: timerColor }}>
                  {mins}:{String(secs).padStart(2, '0')}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-vs-line shadow-enterprise overflow-hidden p-6">
              <OTPInput
                title="Enter Verification Code"
                subtitle="A high-assurance 6-digit code has been dispatched to authorize this voice action."
                channel="EMAIL"
                length={6}
                isLoading={state === 'verifying'}
                error={errorMsg}
                cooldownSeconds={resendCooldown > 0 ? resendCooldown : 60}
                onComplete={(c) => handleVerify(c)}
                onResend={handleResend}
                buttonLabel="CONFIRM VERIFICATION"
              />

              {/* Attempts indicator */}
              {attemptsLeft < 5 && attemptsLeft > 0 && (
                <p className="text-center text-xs font-medium text-amber-700 mt-4 bg-amber-50 py-1.5 px-3 rounded-lg border border-amber-200">
                  {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before lockout
                </p>
              )}
            </div>

            <p className="text-center text-xs text-vs-dim mt-4">
              VoxShield AI Command Gate · Command ID: {commandId?.slice(0, 8)}…
            </p>
          </motion.div>
        )}

        {/* Verified */}
        {state === 'verified' && (
          <motion.div
            key="verified"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 text-center max-w-md bg-white p-8 rounded-2xl border border-vs-line shadow-enterprise"
          >
            <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-vs-success">
              <CheckCircle size={36} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-vs-ink mb-1.5">Verification Successful</h2>
              <p className="text-sm text-vs-dim leading-relaxed">
                Code verified. The command is approved and scheduled for dispatch to your registered laptop agent.
              </p>
            </div>
            <button
              onClick={() => navigate('/command-center')}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-vs-primary hover:bg-vs-primary-hover text-white shadow-sm transition-all"
            >
              Open Command Center <ArrowRight size={15} />
            </button>
          </motion.div>
        )}

        {/* Expired */}
        {state === 'expired' && (
          <motion.div
            key="expired"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 text-center max-w-md bg-white p-8 rounded-2xl border border-vs-line shadow-enterprise"
          >
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-vs-amber">
              <Clock size={36} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-vs-ink mb-1.5">Code Expired</h2>
              <p className="text-sm text-vs-dim leading-relaxed">
                Your verification token has expired. Please initiate a new voice command from the Command Center.
              </p>
            </div>
            <button
              onClick={() => navigate('/command-center')}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-vs-primary hover:bg-vs-primary-hover text-white shadow-sm transition-all"
            >
              Go to Command Center
            </button>
          </motion.div>
        )}

        {/* Locked */}
        {state === 'locked' && (
          <motion.div
            key="locked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 text-center max-w-md bg-white p-8 rounded-2xl border border-vs-line shadow-enterprise"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-vs-danger">
              <Shield size={36} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-vs-ink mb-1.5">Account Safeguard Triggered</h2>
              <p className="text-sm text-vs-dim leading-relaxed">
                Maximum verification attempts exceeded. For your security, this execution token has been locked out.
              </p>
            </div>
            <button
              onClick={() => navigate('/command-center')}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-vs-line bg-slate-50 text-vs-ink hover:bg-slate-100 transition-all"
            >
              Back to Command Center
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
