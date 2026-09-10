import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  ArrowRight,
  ExternalLink,
  Laptop,
  UserCheck,
  FileText,
} from 'lucide-react';
import { getIncidents, updateIncident } from '../services/api';

const ATTACK_LABELS: Record<string, string> = {
  AI_VOICE: 'AI Voice Clone',
  SPEAKER_MISMATCH: 'Speaker Mismatch',
  REPLAY_ATTACK: 'Replay Attack',
  CRITICAL_COMMAND_BLOCKED: 'Critical Command Intercept',
  SUSPICIOUS_PATTERN: 'Suspicious Acoustic Pattern',
  UNKNOWN: 'Unknown Threat',
};

const STATUS_OPTIONS = ['NEW', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'];

function StatusBadge({ status }: { status: string }) {
  const getStyle = () => {
    switch (status) {
      case 'NEW':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'INVESTIGATING':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getStyle()}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function Incidents() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getIncidents(50)
      .then((r) => {
        setIncidents(r.incidents || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleUpdateStatus = async (incidentId: string, status: string) => {
    setSaving(true);
    try {
      const updated = await updateIncident(incidentId, { status, analyst_notes: notes });
      setIncidents((prev) => prev.map((i) => (i.id === incidentId ? { ...i, ...updated } : i)));
      setSelected((s: any) => (s?.id === incidentId ? { ...s, ...updated } : s));
    } catch (e) {}
    setSaving(false);
  };

  const filtered = filter ? incidents.filter((i) => i.status === filter) : incidents;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
          <span>/</span>
          <span className="text-slate-800">Security Incidents & Intercepts</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
          Security Incident Center
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Review, investigate, and audit voice biometric anomalies, deepfake threats, and unauthorized command attempts.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['', 'NEW', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'].map((s) => {
          const count = s ? incidents.filter((i) => i.status === s).length : incidents.length;
          const active = filter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
                active
                  ? 'bg-[#0B3B82] text-white border-[#0B3B82] shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s ? s.replace(/_/g, ' ') : 'All Incidents'} ({count})
            </button>
          );
        })}
      </div>

      {/* Main Grid: Table (Left) + Detail Panel (Right) */}
      <div className={`grid gap-6 ${selected ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>
        
        {/* Table View (Requirement 30: Incident, Severity, Speaker, Command, Device, Status, Time) */}
        <div className={`${selected ? 'lg:col-span-7' : 'w-full'} bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden`}>
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading incident telemetry...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No incidents found. System is currently secure.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="py-3 px-4">Incident</th>
                    <th className="py-3 px-3">Severity</th>
                    <th className="py-3 px-3">Speaker</th>
                    <th className="py-3 px-3">Command</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((inc) => {
                    const isSelected = selected?.id === inc.id;
                    return (
                      <tr
                        key={inc.id}
                        onClick={() => {
                          setSelected(inc);
                          setNotes(inc.analyst_notes || '');
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-800 block">
                            {ATTACK_LABELS[inc.attack_type] || inc.attack_type}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            {inc.id.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              inc.risk_level === 'CRITICAL' || inc.risk_level === 'HIGH'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : inc.risk_level === 'CAUTION' || inc.risk_level === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {inc.risk_level}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-medium">
                          {inc.speaker_name || 'Unknown Speaker'}
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-mono text-[11px] truncate max-w-[120px]">
                          {inc.command_intent || '—'}
                        </td>
                        <td className="py-3 px-3">
                          <StatusBadge status={inc.status} />
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400 text-[11px] whitespace-nowrap">
                          {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Incident Detail Panel */}
        {selected && (
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Incident Investigation
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {ATTACK_LABELS[selected.attack_type] || selected.attack_type}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Risk Severity</span>
                <span className="font-bold text-slate-800 mt-0.5 block">{selected.risk_level}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Policy Decision</span>
                <span className={`font-bold mt-0.5 block ${selected.decision === 'BLOCK' ? 'text-red-700' : 'text-emerald-700'}`}>
                  {selected.decision}
                </span>
              </div>
            </div>

            {/* Summary */}
            {selected.summary && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
                {selected.summary}
              </div>
            )}

            {/* Forensics Lab Deep Link */}
            {selected.analysis_id && (
              <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[#0B3B82] block">Acoustic Forensics Available</span>
                  <span className="text-[11px] font-mono text-slate-500">ID: {selected.analysis_id.slice(0, 16)}...</span>
                </div>
                <Link
                  to={`/forensics?id=${selected.analysis_id}`}
                  className="px-3 py-1 bg-white border border-slate-200 text-[#0B3B82] font-bold rounded-lg shadow-xs hover:bg-slate-50 no-underline text-xs flex items-center gap-1"
                >
                  Inspect →
                </Link>
              </div>
            )}

            {/* Update Workflow Status */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Update Investigation Status
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleUpdateStatus(selected.id, s)}
                    disabled={saving || selected.status === s}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                      selected.status === s
                        ? 'bg-[#0B3B82] text-white border-[#0B3B82]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add analyst investigation notes..."
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white resize-none"
              />

              <button
                type="button"
                onClick={() => handleUpdateStatus(selected.id, selected.status)}
                disabled={saving}
                className="mt-2.5 px-4 py-2 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Analyst Notes'}
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
