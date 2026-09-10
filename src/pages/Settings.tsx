import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getDevices,
  registerDevice,
  revokeDevice,
  deleteDevice,
  getVerificationStatus,
  type DeviceItem,
  type VerificationStatus,
} from '../services/api';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Laptop,
  Mail,
  Phone,
  Mic,
  Clock,
  KeyRound,
  Trash2,
  Ban,
  Plus,
} from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [newDeviceCreds, setNewDeviceCreds] = useState<any>(null);
  const [actionError, setActionError] = useState('');
  const [verification, setVerification] = useState<VerificationStatus | null>(null);

  const fetchDevices = async () => {
    try {
      const data = await getDevices();
      setDevices(data.devices || []);
    } catch {
      // ignore
    } finally {
      setLoadingDevices(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const status = await getVerificationStatus();
      setVerification(status);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchStatus();
  }, []);

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim()) return;
    setRegistering(true);
    setActionError('');
    try {
      const res = await registerDevice(newDeviceName.trim());
      setNewDeviceCreds(res);
      setNewDeviceName('');
      await fetchDevices();
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message || 'Failed to register device');
    } finally {
      setRegistering(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeDevice(id);
      await fetchDevices();
      await fetchStatus();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this trusted device?')) return;
    try {
      await deleteDevice(id);
      await fetchDevices();
      await fetchStatus();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const emailVerified = verification?.email_verified ?? (user as any)?.email_verified ?? true;
  const phoneVerified = verification?.phone_verified ?? (user as any)?.phone_verified ?? true;
  const voiceEnrolled = verification?.voice_enrolled ?? (user as any)?.voice_enrolled ?? false;
  const trustedDevicesCount = verification?.trusted_devices_count ?? devices.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          System Settings & Credentials
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your zero-trust biometric profile, dual-contact verification channels, and trusted workstation devices.
        </p>
      </div>

      {/* SECTION 20: VERIFICATION STATUS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0B3B82]" />
              Zero-Trust Verification Status
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Current cryptographic and biometric clearance levels for this account.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#0B3B82] text-xs font-bold border border-blue-200">
            FIPS / SIH26104
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Email */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Email Verification
              </span>
              <span className="text-xs text-slate-700 font-medium truncate block mt-0.5 max-w-[180px]">
                {verification?.email || user?.email || '—'}
              </span>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              emailVerified ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {emailVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {emailVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>

          {/* Phone */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Phone Verification
              </span>
              <span className="text-xs text-slate-700 font-medium truncate block mt-0.5 max-w-[180px]">
                {verification?.phone || user?.phone || 'Not provided'}
              </span>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              phoneVerified ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {phoneVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {phoneVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>

          {/* Voice */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Voice Biometrics
              </span>
              <span className="text-xs text-slate-700 font-medium block mt-0.5">
                1:N Acoustic Model
              </span>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              voiceEnrolled ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {voiceEnrolled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {voiceEnrolled ? 'Enrolled' : 'Not Enrolled'}
            </span>
          </div>

          {/* Trusted Devices Count */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Trusted Devices
              </span>
              <span className="text-xs text-slate-700 font-medium block mt-0.5">
                Paired Workstations
              </span>
            </div>
            <span className="text-sm font-extrabold text-[#0B3B82] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
              {trustedDevicesCount} active
            </span>
          </div>

          {/* Recent Authentication Timestamp */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between sm:col-span-2">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Recent Authentication
              </span>
              <span className="text-xs text-slate-700 font-medium block mt-0.5">
                Last validated session login
              </span>
            </div>
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {user?.last_login_at
                ? new Date(user.last_login_at).toLocaleString()
                : new Date().toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* User Profile Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          User Profile Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</span>
            <span className="text-sm font-bold text-slate-800 mt-1 block">{user?.name || '—'}</span>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Corporate Role</span>
            <span className="text-sm font-bold text-[#0B3B82] mt-1 block">{user?.role || 'USER'}</span>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Identity Status</span>
            <span className="text-sm font-bold text-emerald-700 mt-1 block">
              {user?.is_active ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">User ID</span>
            <span className="text-xs font-mono text-slate-600 mt-1 block truncate">{user?.id || '—'}</span>
          </div>
        </div>
      </div>

      {/* Trusted Laptop Devices Management */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Laptop className="w-4 h-4 text-[#0B3B82]" />
              Trusted Laptop Devices Fleet
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Authorized endpoint workstations permitted to execute confirmed voice commands.
            </p>
          </div>
        </div>

        {/* Register Device Form */}
        <form onSubmit={handleRegisterDevice} className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
            placeholder="e.g., Secure Windows Laptop (HQ)"
            required
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
          />
          <button
            type="submit"
            disabled={registering}
            className="px-5 py-2.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
            {registering ? 'Registering...' : 'Register Device'}
          </button>
        </form>

        {actionError && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            {actionError}
          </div>
        )}

        {/* New Device Credentials Box */}
        {newDeviceCreds && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                New Device Registered Successfully
              </span>
              <button
                onClick={() => setNewDeviceCreds(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Dismiss
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-2">
              Copy these credentials into your laptop agent configuration immediately:
            </p>
            <div className="bg-white p-3 rounded-lg border border-emerald-200 font-mono text-xs text-slate-800 space-y-1 select-all">
              <div><strong>DEVICE_ID:</strong> {newDeviceCreds.device?.device_id}</div>
              <div><strong>DEVICE_TOKEN:</strong> {newDeviceCreds.device_token}</div>
            </div>
          </div>
        )}

        {/* Device Table */}
        {loadingDevices ? (
          <div className="text-xs text-slate-500 py-4">Loading registered devices...</div>
        ) : devices.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-500 text-xs">
            No trusted devices registered yet. Register your Windows machine to allow the VoxShield Laptop Agent to poll commands.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Device Name</th>
                  <th className="py-2.5 px-3">Device ID</th>
                  <th className="py-2.5 px-3">Platform</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Last Seen</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{d.device_name}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{(d.device_id || d.id).slice(0, 12)}…</td>
                    <td className="py-2.5 px-3 text-slate-600 capitalize">{d.platform}</td>
                    <td className="py-2.5 px-3 text-slate-600">v{d.agent_version}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        d.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {d.last_seen_at ? new Date(d.last_seen_at).toLocaleTimeString() : 'Never'}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      {d.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(d.id)}
                          className="px-2 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded text-[10px] font-bold border border-amber-200 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        className="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded text-[10px] font-bold border border-red-200 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
