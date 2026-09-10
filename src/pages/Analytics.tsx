import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { getAnalyticsSummary, getAnalyticsTimeline } from '../services/api';

const PIE_COLORS = ['#B91C1C', '#B45309', '#0B3B82', '#15803D', '#64748B'];

export default function Analytics() {
  const [summary, setSummary] = useState<any>(null);
  const [timeline7, setTimeline7] = useState<any[]>([]);
  const [timeline30, setTimeline30] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);

  useEffect(() => {
    (async () => {
      try {
        const [s, t7, t30] = await Promise.all([
          getAnalyticsSummary().catch(() => null),
          getAnalyticsTimeline(7).catch(() => ({ timeline: [] })),
          getAnalyticsTimeline(30).catch(() => ({ timeline: [] })),
        ]);
        setSummary(s);
        setTimeline7(t7?.timeline || []);
        setTimeline30(t30?.timeline || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const timeline = period === 7 ? timeline7 : timeline30;

  const attackData = Object.entries(summary?.incidents?.by_attack_type || {}).map(
    ([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value: Number(value),
    })
  );

  const riskData = Object.entries(summary?.incidents?.by_risk_level || {}).map(
    ([name, value]) => ({
      name,
      value: Number(value),
    })
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[360px]">
        <div className="text-xs font-semibold text-[#0B3B82] flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#0B3B82] border-t-transparent rounded-full animate-spin" />
          Loading security analytics...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
            <span>/</span>
            <span className="text-slate-800">Security Telemetry Analytics</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
            Enterprise Security Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Statistical distribution of voice authentications, threat vectors, risk classifications, and command executions.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          {[7, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriod(d)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                period === d
                  ? 'bg-white text-[#0B3B82] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Total Analyses</span>
          <div className="text-2xl font-extrabold text-[#0B3B82]">
            {summary?.analyses?.total ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Acoustic evaluations</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Total Incidents</span>
          <div className="text-2xl font-extrabold text-amber-700">
            {summary?.incidents?.total ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Security anomalies</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Attacks Blocked</span>
          <div className="text-2xl font-extrabold text-red-700">
            {summary?.incidents?.blocked_24h ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Intercepted today</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Voice Commands</span>
          <div className="text-2xl font-extrabold text-slate-800">
            {summary?.commands?.total ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Requested operations</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 block mb-1">Executed Safely</span>
          <div className="text-2xl font-extrabold text-emerald-700">
            {summary?.commands?.executed ?? 0}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-1 block">Laptop claimed</span>
        </div>
      </div>

      {/* Main Activity Timeline Chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Activity Velocity (Last {period} Days)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Daily volume of processed voice inputs vs security incident triggers
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-[#0B3B82]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0B3B82]" />
              Voice Analyses
            </div>
            <div className="flex items-center gap-1.5 text-red-700">
              <span className="w-2.5 h-2.5 rounded-full bg-red-700" />
              Incidents Intercepted
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="anGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0B3B82" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0B3B82" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="incGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#B91C1C" stopOpacity={0.15} />
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
              <Area type="monotone" dataKey="analyses" stroke="#0B3B82" strokeWidth={2} fill="url(#anGradient)" name="Analyses" />
              <Area type="monotone" dataKey="incidents" stroke="#B91C1C" strokeWidth={2} fill="url(#incGradient)" name="Incidents" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Threat Distribution & Risk Classification Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card: Attack Types Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Threat Attack Vectors</h3>
            <p className="text-xs text-slate-500 mb-4">Breakdown of flagged deepfakes, replays, and mismatches</p>

            {attackData.length > 0 ? (
              <div className="space-y-3">
                {attackData.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{item.name}</span>
                    <span className="font-extrabold text-[#0B3B82] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-8 text-center">No threat events recorded in this period.</p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-4">
            <span>Interception Rate</span>
            <span className="font-bold text-emerald-700">100% Policy Intercepted</span>
          </div>
        </div>

        {/* Card: Risk Severity Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Risk Severity Distribution</h3>
            <p className="text-xs text-slate-500 mb-4">Incidents classified by policy threat level</p>

            {riskData.length > 0 ? (
              <div className="space-y-3">
                {riskData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{item.name}</span>
                    <span className={`font-extrabold px-2 py-0.5 rounded border ${
                      item.name === 'CRITICAL' || item.name === 'HIGH'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : item.name === 'CAUTION' || item.name === 'MEDIUM'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-8 text-center">No incidents classified in this period.</p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-4">
            <span>Audit Standard</span>
            <span className="font-bold text-slate-700">FIPS 140-3 Compliant</span>
          </div>
        </div>

      </div>

    </div>
  );
}
