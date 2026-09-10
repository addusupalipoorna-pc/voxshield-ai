import { useEffect, useState } from 'react';
import { Shield, Users, Activity, Terminal, CheckCircle, AlertTriangle, Clock, RefreshCw, Server, Cpu } from 'lucide-react';
import { getModelStatus, getAdminUsers, getAuditLogs } from '../services/api';

export default function AdminDashboard() {
  const [modelStatus, setModelStatus] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    setRefreshing(true);
    getModelStatus().then(setModelStatus).catch(() => {});
    getAdminUsers(20)
      .then((res) => setUsers(res.users || []))
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
    getAuditLogs(20)
      .then((res) => setAuditLogs(res.audit_logs || []))
      .catch(() => {})
      .finally(() => {
        setLoadingLogs(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'ONLINE':
        return { bg: 'bg-green-50', text: 'text-vs-success', border: 'border-green-200', label: 'ONLINE' };
      case 'HEURISTIC':
      case 'HEURISTIC_ONLY':
        return { bg: 'bg-amber-50', text: 'text-vs-warning', border: 'border-amber-200', label: 'HEURISTIC' };
      case 'DEGRADED':
        return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'DEGRADED' };
      default:
        return { bg: 'bg-red-50', text: 'text-vs-danger', border: 'border-red-200', label: s || 'UNAVAILABLE' };
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-vs-blue uppercase tracking-wider mb-1">
            <Shield size={14} /> SOC Administration Portal
          </div>
          <h1 className="text-2xl font-bold text-vs-ink tracking-tight">Security Center Administration</h1>
          <p className="text-sm text-vs-dim mt-1">
            Real-time biometric engine status, registered identity directory, and immutable SIEM audit logs.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-vs-line bg-white hover:bg-slate-50 text-vs-ink text-xs font-semibold shadow-sm transition-all"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh Telemetry
        </button>
      </div>

      {/* Model Services Readiness Grid */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-vs-navy" />
            <h2 className="text-base font-bold text-vs-ink">Pipeline Services Status & Truthful Readiness</h2>
          </div>
          {modelStatus?.timestamp && (
            <span className="text-xs text-vs-dim flex items-center gap-1">
              <Clock size={12} /> Checked: {new Date(modelStatus.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {modelStatus?.services?.map((svc: any) => {
            const badge = getStatusBadge(svc.status);
            return (
              <div key={svc.key} className="p-4 bg-slate-50 border border-vs-line rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-vs-ink truncate pr-2">{svc.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}>
                      {badge.label}
                    </span>
                  </div>
                  {svc.note && (
                    <p className="text-[11px] text-vs-dim leading-relaxed mb-2">{svc.note}</p>
                  )}
                </div>
                {svc.version && (
                  <div className="text-[10px] font-mono text-vs-dim">
                    Build: <span className="font-semibold text-vs-ink">v{svc.version}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Registered System Users Table */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-vs-navy" />
          <h2 className="text-base font-bold text-vs-ink">Registered User Directory (PostgreSQL / SQLite)</h2>
        </div>

        {loadingUsers ? (
          <div className="py-8 text-center text-xs text-vs-dim">Loading registered user records…</div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center text-xs text-vs-dim">No registered users in database.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-vs-line">
                  {['Name', 'Email / Identifier', 'Role', 'Status', 'Verified', 'Registered Date'].map((h) => (
                    <th key={h} className="py-2.5 px-3 text-[11px] font-semibold text-vs-dim uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-line">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-semibold text-vs-ink">{u.name}</td>
                    <td className="py-3 px-3 font-mono text-vs-dim">{u.email}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : u.role === 'SECURITY_ANALYST'
                            ? 'bg-blue-50 text-vs-blue border border-blue-200'
                            : 'bg-slate-100 text-vs-dim border border-slate-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.is_active ? 'bg-green-50 text-vs-success' : 'bg-red-50 text-vs-danger'
                      }`}>
                        {u.is_active ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1 font-medium">
                        {u.is_verified ? (
                          <><CheckCircle size={13} className="text-vs-success" /> Verified</>
                        ) : (
                          <span className="text-vs-dim">Unverified</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-vs-dim">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Audit Trail */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-vs-navy" />
          <h2 className="text-base font-bold text-vs-ink">Security Audit Trail (Latest 20 Events)</h2>
        </div>

        {loadingLogs ? (
          <div className="py-8 text-center text-xs text-vs-dim">Loading SIEM audit events…</div>
        ) : auditLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-vs-dim">No security audit logs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-vs-line">
                  {['Timestamp', 'Action', 'Target Entity', 'Resource ID', 'Details Snapshot'].map((h) => (
                    <th key={h} className="py-2.5 px-3 text-[11px] font-semibold text-vs-dim uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-vs-line">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-vs-dim whitespace-nowrap font-mono text-[11px]">
                      {log.created_at ? new Date(log.created_at).toLocaleTimeString() : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-vs-navy border border-blue-200 text-[10px] font-mono font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-vs-ink">{log.resource_type || '—'}</td>
                    <td className="py-3 px-3 font-mono text-vs-dim text-[11px]">
                      {log.resource_id ? `${String(log.resource_id).slice(0, 10)}…` : '—'}
                    </td>
                    <td className="py-3 px-3 text-vs-dim max-w-xs truncate font-mono text-[11px]">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Laptop Agent Setup Guidance */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Terminal size={18} className="text-vs-navy" />
          <h2 className="text-base font-bold text-vs-ink">Laptop Daemon Agent Configuration</h2>
        </div>
        <p className="text-xs text-vs-dim leading-relaxed mb-3">
          Run the VoxShield host agent on authorized developer or administrator laptops to securely poll and execute approved voice automation commands:
        </p>
        <div className="p-4 bg-slate-50 text-slate-800 rounded-xl font-mono text-xs mb-3 border border-slate-200">
          <code className="text-[#0B3B82] font-semibold">cd agent</code><br />
          <code className="text-slate-700">python main.py --register</code>
        </div>
        <p className="text-xs text-vs-dim">
          The agent generates local cryptographic certificates saved in <code className="text-vs-navy font-mono bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[11px]">device_credentials.json</code> and polls <code className="text-vs-navy font-mono bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[11px]">/api/v1/agent/pending</code> via mTLS-equivalent auth.
        </p>
      </div>
    </div>
  );
}
