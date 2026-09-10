import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Clock, AlertTriangle, CheckCircle, XCircle, Loader2, Mic, Activity, Server, ArrowRight } from 'lucide-react';

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

interface ApprovalDetails {
  approval_id: string;
  command_id: string;
  intent: string;
  description: string;
  risk: string;
  transcript: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  seconds_remaining: number;
  is_expired: boolean;
}

type PageState = 'loading' | 'ready' | 'confirming' | 'approved' | 'rejected' | 'expired' | 'error';

const RISK_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  LOW: { color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
  MEDIUM: { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  HIGH: { color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  CRITICAL: { color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
};

function Countdown({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) { onExpire(); return; }
    const id = setInterval(() => setRemaining(r => {
      if (r <= 1) { clearInterval(id); onExpire(); return 0; }
      return r - 1;
    }), 1000);
    return () => clearInterval(id);
  }, []);

  const pct = Math.max(0, remaining / seconds);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const color = pct > 0.5 ? '#15803D' : pct > 0.2 ? '#B45309' : '#B91C1C';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#E2E8F0" strokeWidth="6" />
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct)}`}
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono font-bold text-xs" style={{ color }}>
            {mins}:{String(secs).padStart(2, '0')}
          </span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-vs-dim">Expires in</span>
    </div>
  );
}

export default function ApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = useState<PageState>('loading');
  const [details, setDetails] = useState<ApprovalDetails | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingDecision, setPendingDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!token) { setState('error'); setErrorMsg('No approval token in URL.'); return; }
    try {
      const data: ApprovalDetails = await apiFetch(`/commands/approval/${token}`);
      setDetails(data);
      if (data.is_expired) { setState('expired'); return; }
      setState('ready');
    } catch (e: any) {
      const msg: string = e.message || 'Unknown error';
      if (msg.includes('expired') || msg.includes('410')) setState('expired');
      else { setState('error'); setErrorMsg(msg); }
    }
  }, [token]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  const handleDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!token) return;
    setPendingDecision(decision);
    setState('confirming');
    try {
      const endpoint = decision === 'APPROVED' ? '/commands/approve' : '/commands/reject';
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ token }) });
      setState(decision === 'APPROVED' ? 'approved' : 'rejected');
    } catch (e: any) {
      setPendingDecision(null);
      setState('error');
      setErrorMsg(e.message || 'Failed to process decision.');
    }
  };

  const riskConfig = RISK_CONFIG[details?.risk || 'LOW'] || { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {/* Loading */}
        {state === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 text-center bg-white p-8 rounded-2xl border border-vs-line shadow-card"
          >
            <div className="relative">
              <Shield size={44} className="text-vs-navy" />
              <Loader2 size={20} className="animate-spin absolute -bottom-1 -right-1 text-vs-blue" />
            </div>
            <p className="text-sm font-medium text-vs-dim">Loading approval request details…</p>
          </motion.div>
        )}

        {/* Ready */}
        {state === 'ready' && details && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-lg"
          >
            {/* Header branding */}
            <div className="flex items-center justify-between mb-5 px-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-vs-navy flex items-center justify-center text-white shadow-sm">
                  <Shield size={22} />
                </div>
                <div>
                  <h1 className="text-base font-bold text-vs-ink tracking-tight">VOXSHIELD AI</h1>
                  <span className="inline-block text-[11px] font-semibold text-vs-blue tracking-wider uppercase">
                    Security Approval Gateway
                  </span>
                </div>
              </div>
              <Countdown seconds={details.seconds_remaining} onExpire={() => setState('expired')} />
            </div>

            {/* Main Approval Card */}
            <div className="bg-white rounded-2xl border border-vs-line shadow-enterprise overflow-hidden">
              {/* Risk Banner */}
              <div
                className="px-6 py-3.5 flex items-center justify-between border-b"
                style={{
                  backgroundColor: riskConfig.bg,
                  borderColor: riskConfig.border,
                }}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={17} style={{ color: riskConfig.color }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: riskConfig.color }}>
                    {details.risk} Risk Execution Request
                  </span>
                </div>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: riskConfig.bg,
                    color: riskConfig.color,
                    border: `1px solid ${riskConfig.border}`,
                  }}
                >
                  {details.risk}
                </span>
              </div>

              <div className="p-6 space-y-5">
                {/* Command Details */}
                <div>
                  <label className="text-[11px] font-semibold tracking-wider uppercase text-vs-dim block mb-1.5">
                    Target Command
                  </label>
                  <p className="text-lg font-bold text-vs-ink leading-snug">{details.description}</p>
                  <div className="mt-2">
                    <span className="inline-block px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-xs font-mono font-medium text-vs-ink">
                      {details.intent}
                    </span>
                  </div>
                </div>

                {/* Voice Transcript */}
                {details.transcript && (
                  <div className="bg-slate-50 border border-vs-line rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-vs-dim uppercase tracking-wider mb-1.5">
                      <Mic size={13} className="text-vs-blue" />
                      Voice Input Transcript
                    </div>
                    <p className="italic text-sm text-vs-ink">
                      "{details.transcript}"
                    </p>
                  </div>
                )}

                {/* Meta Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-vs-line rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-vs-dim uppercase tracking-wider mb-1">
                      <Activity size={12} className="text-vs-dim" />
                      State
                    </div>
                    <span className="text-xs font-bold text-vs-ink uppercase">{details.status}</span>
                  </div>
                  <div className="bg-slate-50 border border-vs-line rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-vs-dim uppercase tracking-wider mb-1">
                      <Server size={12} className="text-vs-dim" />
                      Command Ref
                    </div>
                    <span className="text-xs font-mono font-medium text-vs-ink">
                      {details.command_id.slice(0, 10)}…
                    </span>
                  </div>
                </div>

                {/* Warning Banner */}
                <div className="flex items-start gap-3 rounded-xl p-3.5 bg-amber-50/70 border border-amber-200">
                  <AlertTriangle size={16} className="text-vs-amber mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Approving this request will immediately queue the command for dispatch to your registered laptop agent.
                    Only approve if you initiated this instruction. <strong>Reject if unexpected.</strong>
                  </p>
                </div>

                {/* Decision Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleDecision('APPROVED')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm bg-vs-primary hover:bg-vs-primary-hover text-white shadow-sm transition-all"
                  >
                    <CheckCircle size={17} />
                    APPROVE COMMAND
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleDecision('REJECTED')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm border border-red-300 text-vs-danger hover:bg-red-50 transition-all"
                  >
                    <XCircle size={17} />
                    REJECT
                  </motion.button>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-vs-dim mt-4">
              VoxShield AI Zero-Trust Defense · Single-use cryptographically bound token
            </p>
          </motion.div>
        )}

        {/* Confirming State */}
        {state === 'confirming' && (
          <motion.div
            key="confirming"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 text-center bg-white p-8 rounded-2xl border border-vs-line shadow-card"
          >
            <Loader2 size={44} className="animate-spin text-vs-primary" />
            <p className="text-sm font-semibold text-vs-ink">
              Registering {pendingDecision?.toLowerCase()} decision on ledger…
            </p>
          </motion.div>
        )}

        {/* Approved State */}
        {state === 'approved' && (
          <motion.div
            key="approved"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 text-center max-w-md bg-white p-8 rounded-2xl border border-vs-line shadow-enterprise"
          >
            <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-vs-success">
              <CheckCircle size={36} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-vs-ink mb-1.5">Command Approved</h2>
              <p className="text-sm text-vs-dim leading-relaxed">
                The security validation token has been redeemed. The command is now authorized and queued for laptop execution.
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

        {/* Rejected State */}
        {state === 'rejected' && (
          <motion.div
            key="rejected"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 text-center max-w-md bg-white p-8 rounded-2xl border border-vs-line shadow-enterprise"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-vs-danger">
              <XCircle size={36} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-vs-ink mb-1.5">Command Rejected</h2>
              <p className="text-sm text-vs-dim leading-relaxed">
                The command execution request has been blocked and aborted. A security audit entry has been recorded.
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-vs-line bg-slate-50 text-vs-ink hover:bg-slate-100 transition-all"
            >
              Return to Dashboard
            </button>
          </motion.div>
        )}

        {/* Expired State */}
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
              <h2 className="text-xl font-bold text-vs-ink mb-1.5">Approval Link Expired</h2>
              <p className="text-sm text-vs-dim leading-relaxed">
                For your security, approval links expire after a short window. Please initiate a new command from the Command Center.
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

        {/* Error State */}
        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5 text-center max-w-md bg-white p-8 rounded-2xl border border-vs-line shadow-enterprise"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-vs-danger">
              <Shield size={36} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-vs-ink mb-1.5">Invalid Approval Request</h2>
              <p className="text-sm text-vs-dim leading-relaxed">{errorMsg || 'This approval link is invalid or has already been used.'}</p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-vs-line bg-slate-50 text-vs-ink hover:bg-slate-100 transition-all"
            >
              Return to Dashboard
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
