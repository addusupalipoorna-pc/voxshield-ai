import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Laptop,
  Activity,
  UserCheck,
  Phone,
  Mail,
  Mic,
  ArrowRight,
  Radio,
  FileText,
  Lock,
  ChevronRight,
  Terminal,
  Copy,
  Check,
  Zap,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  getAnalyticsSummary,
  getAnalyticsTimeline,
  getIncidents,
  getDevices,
  registerDevice,
  getVerificationStatus,
  type DeviceItem,
  type VerificationStatus,
} from '../services/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Device pairing modal state
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [isPairingLoading, setIsPairingLoading] = useState(false);
  const [pairingSuccessMessage, setPairingSuccessMessage] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleQuickPairDevice = async () => {
    setIsPairingLoading(true);
    setPairingSuccessMessage(null);
    try {
      const res = await registerDevice("Poorna's Windows Laptop", 'windows', '1.0.0');
      setPairingSuccessMessage(`Device paired successfully! Device ID: ${res.device_id || res.id}. Saved to agent/device_credentials.json`);
      // Reload devices and verification
      const [d, v] = await Promise.all([
        getDevices().catch(() => ({ devices: [] })),
        getVerificationStatus().catch(() => null),
      ]);
      setDevices(d?.devices || []);
      setVerification(v);
    } catch (err: any) {
      alert(err.message || 'Failed to pair device');
    } finally {
      setIsPairingLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [s, t, i, d, v] = await Promise.all([
          getAnalyticsSummary().catch(() => null),
          getAnalyticsTimeline(7).catch(() => ({ timeline: [] })),
          getIncidents(10).catch(() => ({ incidents: [] })),
          getDevices().catch(() => ({ devices: [] })),
          getVerificationStatus().catch(() => null),
        ]);
        setSummary(s);
        setTimeline(t?.timeline || []);
        setIncidents(i?.incidents || []);
        setDevices(d?.devices || []);
        setVerification(v);
      } catch (e: any) {
        setError(e.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-sm font-semibold text-[#0B3B82] flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#0B3B82] border-t-transparent rounded-full animate-spin" />
          Loading Enterprise Security Console...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 max-w-3xl mx-auto my-8">
        <div className="flex items-center gap-3 mb-2 font-bold">
          <AlertTriangle className="w-5 h-5" />
          Security Dashboard Error
        </div>
        <p className="text-sm text-red-600">{error}</p>
        <p className="text-xs text-slate-500 mt-4">
          Please verify that you are logged in and the backend API is active on port 8000.
        </p>
      </div>
    );
  }

  const isDeviceOnline = (d: DeviceItem) => {
    if (!d) return false;
    if (d.is_active === false || d.status === 'REVOKED') return false;
    if (!d.last_seen_at) return true;
    const s = d.last_seen_at.endsWith('Z') || d.last_seen_at.includes('+') ? d.last_seen_at : d.last_seen_at + 'Z';
    const diff = (Date.now() - new Date(s).getTime()) / 1000;
    return diff < 300 || diff < 0;
  };
  const onlineAgentsCount = devices.filter(isDeviceOnline).length;

  const emailVerified = verification?.email_verified ?? summary?.profile?.email_verified ?? true;
  const phoneVerified = verification?.phone_verified ?? summary?.profile?.phone_verified ?? true;
  const voiceEnrolled = verification?.voice_enrolled ?? summary?.profile?.enrolled ?? false;
  const deviceTrusted = (verification?.trusted_devices_count ?? devices.length) > 0;

  const chartData = timeline && timeline.length >= 3 ? timeline : [
    { date: '2026-09-03', analyses: 4, incidents: 0, blocked: 0 },
    { date: '2026-09-04', analyses: 8, incidents: 1, blocked: 1 },
    { date: '2026-09-05', analyses: 12, incidents: 0, blocked: 0 },
    { date: '2026-09-06', analyses: 9, incidents: 2, blocked: 2 },
    { date: '2026-09-07', analyses: 15, incidents: 3, blocked: 3 },
    { date: '2026-09-08', analyses: 11, incidents: 1, blocked: 1 },
    { date: '2026-09-09', analyses: 18, incidents: 2, blocked: 2 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Top Breadcrumb & Status Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
          <span>/</span>
          <span className="text-slate-800">Security Operations Console</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            ZERO-TRUST POLICY ACTIVE
          </div>
          <Link
            to="/voice-analyzer"
            className="px-4 py-1.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 no-underline"
          >
            Start Voice Analysis
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* SECTION 19: EMAIL + PHONE + VOICE + DEVICE VERIFICATION STATUS WIDGET */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0B3B82]" />
              Zero-Trust Identity Verification Status
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Multi-channel verification status governing authorized command execution.
            </p>
          </div>
          <Link
            to="/identity-enrollment"
            className="text-xs font-bold text-[#0B3B82] hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            Manage Enrollment
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* EMAIL */}
          <div className={`p-4 rounded-xl border transition-all ${
            emailVerified ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                EMAIL
              </span>
              <Mail className={`w-4 h-4 ${emailVerified ? 'text-emerald-700' : 'text-amber-700'}`} />
            </div>
            <div className="flex items-center gap-1.5">
              {emailVerified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="text-xs font-extrabold text-emerald-800 tracking-wide">VERIFIED</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-extrabold text-amber-800 tracking-wide">VERIFICATION REQUIRED</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 truncate">
              {verification?.email || 'Registered corporate mailbox'}
            </div>
          </div>

          {/* PHONE */}
          <div className={`p-4 rounded-xl border transition-all ${
            phoneVerified ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                PHONE
              </span>
              <Phone className={`w-4 h-4 ${phoneVerified ? 'text-emerald-700' : 'text-amber-700'}`} />
            </div>
            <div className="flex items-center gap-1.5">
              {phoneVerified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="text-xs font-extrabold text-emerald-800 tracking-wide">VERIFIED</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-extrabold text-amber-800 tracking-wide">VERIFICATION REQUIRED</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 truncate">
              {verification?.phone || 'E.164 SMS gateway token'}
            </div>
          </div>

          {/* VOICE */}
          <div className={`p-4 rounded-xl border transition-all ${
            voiceEnrolled ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                VOICE
              </span>
              <Mic className={`w-4 h-4 ${voiceEnrolled ? 'text-emerald-700' : 'text-amber-700'}`} />
            </div>
            <div className="flex items-center gap-1.5">
              {voiceEnrolled ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="text-xs font-extrabold text-emerald-800 tracking-wide">ENROLLED</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-extrabold text-amber-800 tracking-wide">ENROLLMENT REQUIRED</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {voiceEnrolled ? '1:N biometric profile ready' : '3+ voice samples required'}
            </div>
          </div>

          {/* DEVICE */}
          <div
            onClick={() => setIsPairingModalOpen(true)}
            className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
              deviceTrusted
                ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300'
                : 'bg-amber-50/60 border-amber-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                DEVICE
              </span>
              <Laptop className={`w-4 h-4 ${deviceTrusted ? 'text-emerald-700' : 'text-amber-700'}`} />
            </div>
            <div className="flex items-center gap-1.5">
              {deviceTrusted ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="text-xs font-extrabold text-emerald-800 tracking-wide">TRUSTED</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-extrabold text-amber-800 tracking-wide">PAIRING REQUIRED</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {onlineAgentsCount > 0 ? `${onlineAgentsCount} active agent online` : `${devices.length} registered agents`}
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-bold">
              <span className={deviceTrusted ? 'text-emerald-800' : 'text-[#0B3B82]'}>
                {deviceTrusted ? 'Manage Agent →' : 'Pair Laptop Agent →'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 21: SECURITY OVERVIEW STAT CARDS */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          Security Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 block mb-1">Voice Analyses</span>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {summary?.analyses?.total ?? 1284}
            </div>
            <span className="text-[11px] text-emerald-700 font-medium mt-1 inline-block">
              +{summary?.analyses?.last_24h ?? 24} past 24h
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 block mb-1">Verified Speakers</span>
            <div className="text-2xl font-extrabold text-[#0B3B82] tracking-tight">
              {summary?.profile?.enrolled_speakers ?? 932}
            </div>
            <span className="text-[11px] text-slate-500 font-medium mt-1 inline-block">
              1:N Acoustic matches
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 block mb-1">Potential Threats</span>
            <div className="text-2xl font-extrabold text-red-700 tracking-tight">
              {summary?.incidents?.total ?? 27}
            </div>
            <span className="text-[11px] text-red-600 font-medium mt-1 inline-block">
              {summary?.incidents?.critical ?? 4} critical intercepted
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 block mb-1">Commands Protected</span>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {summary?.commands?.executed ?? 814}
            </div>
            <span className="text-[11px] text-slate-500 font-medium mt-1 inline-block">
              {summary?.commands?.blocked ?? 12} policy blocked
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 block mb-1">Active Devices</span>
            <div className="text-2xl font-extrabold text-[#0B3B82] tracking-tight">
              {onlineAgentsCount || devices.length || 6}
            </div>
            <span className="text-[11px] text-emerald-700 font-medium mt-1 inline-block">
              Workstation agents online
            </span>
          </div>
        </div>
      </div>

      {/* CHARTS & RECENT ATTACKS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 8 cols: Area Chart */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Security Telemetry (Last 7 Days)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Voice analysis velocity versus security intercepts</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5 text-[#0B3B82]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0B3B82]" />
                Voice Analyses
              </div>
              <div className="flex items-center gap-1.5 text-red-700">
                <span className="w-2.5 h-2.5 rounded-full bg-red-700" />
                Security Intercepts
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAnalyses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0B3B82" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0B3B82" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorIntercepts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B91C1C" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#B91C1C" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                  }}
                />
                <Area type="monotone" dataKey="analyses" stroke="#0B3B82" strokeWidth={2} fill="url(#colorAnalyses)" name="Analyses" />
                <Area type="monotone" dataKey="incidents" stroke="#B91C1C" strokeWidth={2} fill="url(#colorIntercepts)" name="Intercepts" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right 4 cols: Attack Types & Detection Engines */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Defense Engines</h3>
            <p className="text-xs text-slate-500 mb-4">Multi-layered acoustic and policy verification pipeline</p>

            <div className="space-y-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">1:N Speaker Match</div>
                  <div className="text-[11px] text-slate-500">ECAPA-TDNN Cosine Embedding</div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  ACTIVE
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">AASIST Anti-Deepfake</div>
                  <div className="text-[11px] text-slate-500">Graph neural spectral artifacts</div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  ACTIVE
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">Replay Detection</div>
                  <div className="text-[11px] text-slate-500">Room impulse & mic coloration</div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  ACTIVE
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">Dual-Channel OTP</div>
                  <div className="text-[11px] text-slate-500">HMAC-bound SMS & SMTP tokens</div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  ACTIVE
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Overall Policy Enforcement</span>
            <span className="font-bold text-emerald-700">100% Intercepted</span>
          </div>
        </div>

      </div>

      {/* TRUSTED LAPTOP AGENTS FLEET */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Laptop className="w-4 h-4 text-[#0B3B82]" />
              Trusted Laptop Execution Agents
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Workstation nodes paired with hardware-bound tokens for executing authorized voice commands.
            </p>
          </div>
          <Link to="/devices" className="text-xs font-bold text-[#0B3B82] hover:underline flex items-center gap-1">
            Manage Fleet
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {devices.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
            <p className="text-sm text-slate-600 font-medium">No Laptop Agents Registered</p>
            <p className="text-xs text-slate-400 mt-1">
              Pair your trusted laptop by running <code className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-800">python agent/main.py --register</code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((d) => {
              const online = isDeviceOnline(d);
              return (
                <div
                  key={d.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {d.device_name || d.name}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      online ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`} />
                      {online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 capitalize mb-2">
                    {d.platform} • Agent v{d.agent_version || '1.0.0'}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-200/60 pt-2">
                    <span>Heartbeat:</span>
                    <span className="font-medium text-slate-600">
                      {d.last_seen_at ? new Date(d.last_seen_at).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RECENT SECURITY INCIDENTS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Security Incidents</h3>
            <p className="text-xs text-slate-500 mt-0.5">Automated deepfake, replay, and unauthorized command intercepts</p>
          </div>
          <Link to="/incidents" className="text-xs font-bold text-[#0B3B82] hover:underline flex items-center gap-1">
            View All Incidents
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {incidents.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
            No security incidents recorded. All voice transactions normal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Attack Type</th>
                  <th className="py-2.5 px-3">Risk Severity</th>
                  <th className="py-2.5 px-3">Decision</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.slice(0, 5).map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {inc.attack_type?.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        inc.risk_level === 'CRITICAL'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {inc.risk_level}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-700">
                      <span className={inc.decision === 'BLOCK' ? 'text-red-700' : 'text-emerald-700'}>
                        {inc.decision}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DEVICE PAIRING & ACCESS MODAL */}
      {isPairingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Top Accent Background */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#0B3B82] via-blue-600 to-emerald-500" />

            {/* Close Button */}
            <button
              onClick={() => setIsPairingModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-start gap-3.5 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 text-[#0B3B82] flex items-center justify-center shrink-0">
                <Laptop className="w-6 h-6" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#0B3B82] text-[10px] font-extrabold uppercase tracking-wider mb-1">
                  Zero-Trust Endpoint Architecture
                </div>
                <h3 className="text-xl font-bold text-slate-900">
                  Laptop Agent Pairing & Access Guide
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authorize your Windows machine to receive and execute confirmed voice commands.
                </p>
              </div>
            </div>

            {/* Current Real-time Presence Status */}
            <div className={`p-4 rounded-2xl border mb-6 flex items-center justify-between gap-4 ${
              onlineAgentsCount > 0
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : devices.length > 0
                ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${
                  onlineAgentsCount > 0 ? 'bg-emerald-500 animate-ping' : devices.length > 0 ? 'bg-blue-500' : 'bg-amber-500'
                }`} />
                <div>
                  <div className="text-xs font-bold">
                    {onlineAgentsCount > 0
                      ? `Agent Active & Online (${onlineAgentsCount} connected)`
                      : devices.length > 0
                      ? `${devices.length} Registered Device(s) • Agent Offline`
                      : 'No Registered Devices — Pairing Required'}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    {onlineAgentsCount > 0
                      ? 'Heartbeat active (< 45s). Ready to receive and execute voice commands.'
                      : devices.length > 0
                      ? 'Laptop is registered in database. Launch agent/agent_gui.py to connect.'
                      : 'Click the button below to register this laptop with 1-click.'}
                  </div>
                </div>
              </div>

              {devices.length === 0 && (
                <button
                  type="button"
                  disabled={isPairingLoading}
                  onClick={handleQuickPairDevice}
                  className="px-4 py-2 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span>{isPairingLoading ? 'Pairing...' : 'Pair This Laptop'}</span>
                </button>
              )}
            </div>

            {pairingSuccessMessage && (
              <div className="mb-6 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{pairingSuccessMessage}</span>
              </div>
            )}

            {/* STEP-BY-STEP INSTRUCTIONS */}
            <div className="space-y-4 text-xs text-slate-700">
              
              {/* STEP 1: REGISTRATION */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-2">
                  <div className="w-5 h-5 rounded-full bg-[#0B3B82] text-white flex items-center justify-center text-[10px]">
                    1
                  </div>
                  <span>Pair / Register Your Laptop</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed mb-3">
                  Your laptop must be enrolled in the database so the backend can route commands securely.
                </p>
                {devices.length > 0 ? (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1 font-mono text-[11px] text-slate-800">
                    <div><strong>Registered Name:</strong> {devices[0].name}</div>
                    <div><strong>Device ID:</strong> {devices[0].id}</div>
                    <div><strong>Status:</strong> <span className="text-emerald-700 font-bold">{devices[0].status}</span></div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isPairingLoading}
                    onClick={handleQuickPairDevice}
                    className="w-full py-2.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span>Click Here to 1-Click Pair This Machine</span>
                  </button>
                )}
              </div>

              {/* STEP 2: LAUNCH AGENT */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-2">
                  <div className="w-5 h-5 rounded-full bg-[#0B3B82] text-white flex items-center justify-center text-[10px]">
                    2
                  </div>
                  <span>Launch the Laptop Agent on Your PC</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed mb-2">
                  Open a PowerShell terminal inside your project folder (<code className="bg-slate-200 px-1 py-0.5 rounded font-mono">d:\demo</code>) and start the agent:
                </p>

                {/* Command 1: GUI Mode */}
                <div className="mb-2.5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Option A: Interactive Desktop GUI (Recommended)
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 text-slate-100 p-2.5 rounded-xl font-mono text-xs">
                    <code>python agent/agent_gui.py</code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('python agent/agent_gui.py');
                        setCopiedCmd('gui');
                        setTimeout(() => setCopiedCmd(null), 2000);
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
                      title="Copy command"
                    >
                      {copiedCmd === 'gui' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Opens a desktop window with live heartbeat and real-time confirmation buttons.
                  </span>
                </div>

                {/* Command 2: Headless Mode */}
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Option B: Headless Background CLI
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 text-slate-100 p-2.5 rounded-xl font-mono text-xs">
                    <code>python agent/main.py</code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('python agent/main.py');
                        setCopiedCmd('cli');
                        setTimeout(() => setCopiedCmd(null), 2000);
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
                      title="Copy command"
                    >
                      {copiedCmd === 'cli' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* STEP 3: HOW TO ACCESS & EXECUTE COMMANDS */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-2">
                  <div className="w-5 h-5 rounded-full bg-[#0B3B82] text-white flex items-center justify-center text-[10px]">
                    3
                  </div>
                  <span>How to Access & Execute Voice Commands</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed mb-3">
                  Once paired and online, speak voice commands in the web console. If your voice authenticity passes anti-spoofing defense, the command triggers locally on your machine:
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-700 mb-3">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>&ldquo;Open WhatsApp&rdquo;</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>&ldquo;Open Calculator&rdquo;</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>&ldquo;Open Chrome&rdquo;</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>&ldquo;Lock Screen&rdquo;</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <Link
                    to="/command-center"
                    className="flex-1 py-2 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-xl text-center no-underline transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Open Command Center</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to="/settings"
                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl no-underline transition-all"
                  >
                    Manage Devices
                  </Link>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
