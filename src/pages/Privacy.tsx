import { useEffect, useState } from 'react';
import { Shield, Trash2, RotateCcw, Download, CheckCircle, AlertTriangle, FileText, Lock, Database } from 'lucide-react';
import { getSpeakerProfile, deleteSpeakerProfile, exportPrivacyData, deleteAnalysisHistory, resetVoiceProfile } from '../services/api';

export default function Privacy() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getSpeakerProfile()
      .then(p => { setProfile(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSpeakerProfile();
      setDeleted(true);
      setProfile({ has_profile: false });
    } catch (e: any) {
      alert(e.message);
    }
    setDeleting(false);
    setConfirmDelete(false);
  };

  const handleResetProfile = async () => {
    if (!window.confirm('Reset all enrolled voice samples? You will be redirected to complete voice re-enrollment.')) return;
    try {
      await resetVoiceProfile();
      window.location.href = '/identity-enrollment';
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-vs-blue uppercase tracking-wider mb-1">
          <Lock size={14} /> Zero-Trust Biometric Compliance
        </div>
        <h1 className="text-2xl font-bold text-vs-ink tracking-tight">Privacy & Data Governance</h1>
        <p className="text-sm text-vs-dim mt-1">
          Manage your mathematical voice templates, audit trail data, and GDPR/CCPA data portability preferences.
        </p>
      </div>

      {/* Data Privacy Notice Cards */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-vs-navy" />
          <h2 className="text-base font-bold text-vs-ink">Data Privacy Commitments</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: CheckCircle, color: 'text-vs-success', title: 'No Raw Audio Stored', desc: 'Only high-dimension mathematical feature vectors (MFCCs / x-vectors) are retained. Audio waveforms are discarded from memory immediately after inference.' },
            { icon: CheckCircle, color: 'text-vs-success', title: 'On-Premise Local Processing', desc: 'All biometric analysis and acoustic DSP models operate on secure local infrastructure without sending voice data to external consumer clouds.' },
            { icon: CheckCircle, color: 'text-vs-success', title: 'Right to Complete Erasure', desc: 'You retain total ownership to delete your acoustic profile and all associated mathematical vectors at any moment with irreversible cryptographic wipe.' },
            { icon: CheckCircle, color: 'text-vs-success', title: 'Explicit Biometric Consent', desc: 'Enrollment mandates affirmative legal consent logged with ISO timestamp and identity reference in the immutable system audit log.' },
            { icon: AlertTriangle, color: 'text-vs-warning', title: 'Audit Trail Retention', desc: 'Mathematical classification scores and security decisions are logged for compliance monitoring. No audio samples are embedded.' },
            { icon: AlertTriangle, color: 'text-vs-warning', title: 'Forensic Incident Records', desc: 'Threat incidents (replay, deepfake, synthetic clones) store attack metrics for SOC investigations without storing user voice.' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="p-4 bg-slate-50 border border-vs-line rounded-xl flex gap-3.5 items-start">
                <Icon size={18} className={`${item.color} shrink-0 mt-0.5`} />
                <div>
                  <div className="text-xs font-bold text-vs-ink mb-1">{item.title}</div>
                  <div className="text-xs text-vs-dim leading-relaxed">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice Profile Status */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-vs-navy" />
            <h2 className="text-base font-bold text-vs-ink">Acoustic Profile Status</h2>
          </div>
          {profile?.has_profile && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-vs-success border border-green-200">
              Active Biometric Profile
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-6 text-center text-xs text-vs-dim">Querying biometric keystore…</div>
        ) : deleted || !profile?.has_profile ? (
          <div className="p-5 bg-slate-50 border border-vs-line rounded-xl text-center">
            <p className="text-sm font-medium text-vs-dim">
              {deleted ? 'Biometric profile deleted successfully. All vector records have been purged.' : 'No active voice profile registered on this identity account.'}
            </p>
            <a
              href="/identity-enrollment"
              className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-vs-blue hover:text-vs-navy"
            >
              Register voice profile in Identity Enrollment →
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Profile Name', value: profile.profile.name },
                { label: 'Samples Enrolled', value: `${profile.profile.samples_count}/3` },
                { label: 'Embedding Architecture', value: profile.profile.model_version || 'ECAPA-TDNN' },
                { label: 'Consent Status', value: profile.profile.consent_given ? 'Affirmed' : 'Missing' },
                { label: 'Enrollment State', value: profile.profile.enrollment_complete ? 'Complete' : 'Pending' },
                { label: 'Quality Score', value: profile.profile.quality_score ? `${(profile.profile.quality_score * 100).toFixed(0)}%` : 'Calibrated' },
              ].map(item => (
                <div key={item.label} className="p-3 bg-slate-50 border border-vs-line rounded-xl">
                  <div className="text-[10px] font-semibold text-vs-dim uppercase tracking-wider mb-1">
                    {item.label}
                  </div>
                  <div className="text-xs font-bold text-vs-ink truncate">{String(item.value)}</div>
                </div>
              ))}
            </div>

            {/* Consent Notice */}
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-blue-900 leading-relaxed">
              <strong className="font-semibold text-vs-navy">Biometric Record Audit:</strong>{' '}
              Enrollment consent verified at time of registration. Vector fingerprinting active. Raw microphone captures are never written to disk or database.
              Created on: {new Date(profile.profile.created_at).toLocaleString()}
            </div>

            {/* Action Buttons */}
            {!confirmDelete ? (
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-300 text-vs-danger hover:bg-red-50 text-xs font-semibold transition-all"
                >
                  <Trash2 size={14} /> Delete Voice Profile
                </button>
                <button
                  onClick={handleResetProfile}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-vs-primary hover:bg-vs-primary-hover text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <RotateCcw size={14} /> Re-Enroll Voiceprint
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-3">
                <div className="text-xs font-bold text-vs-danger">
                  Confirm permanent deletion of voice profile?
                </div>
                <div className="text-xs text-vs-dim leading-relaxed">
                  This will wipe all {profile.profile.samples_count} stored feature embeddings. This action cannot be reversed. Voice verification will be unavailable until you re-enroll.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 rounded-lg bg-vs-danger hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 transition-all"
                  >
                    {deleting ? 'Purging…' : 'Yes, Delete Permanently'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-4 py-2 rounded-lg border border-vs-line bg-white text-vs-dim hover:bg-slate-50 text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Retention Policy Table */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-vs-navy" />
          <h2 className="text-base font-bold text-vs-ink">Data Retention Specification</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-vs-line">
                {['Data Classification', 'What is Stored', 'Retention Policy', 'User Erasure'].map(h => (
                  <th key={h} className="py-2.5 px-3 text-[11px] font-semibold text-vs-dim uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-vs-line">
              {[
                ['Raw Voice Audio', 'NEVER stored in files or databases', 'Purged upon inference (< 500ms)', 'Always purged'],
                ['MFCC & ECAPA Embeddings', 'Mathematical vector matrices only', 'Until profile deletion requested', 'Yes (via this portal)'],
                ['Inference Risk Scores', 'Calculated similarity & liveness metrics', '90-day security audit window', 'Archived for SOC'],
                ['Threat Incident Logs', 'Spoof indicators, replay metadata', '180-day compliance retention', 'Immutable audit'],
                ['Command Execution Ledger', 'Intent, destination agent, status', 'Immutable compliance trail', 'Admin view only'],
              ].map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3 font-semibold text-vs-ink">{row[0]}</td>
                  <td className="py-3 px-3 text-vs-dim">{row[1]}</td>
                  <td className="py-3 px-3 text-vs-dim">{row[2]}</td>
                  <td className="py-3 px-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                      row[3].includes('Yes') || row[3].includes('purged') ? 'bg-green-50 text-vs-success' : 'bg-slate-100 text-vs-dim'
                    }`}>
                      {row[3]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data Portability & Rights */}
      <div className="bg-white border border-vs-line shadow-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Download size={18} className="text-vs-navy" />
          <h2 className="text-base font-bold text-vs-ink">User Data Rights & Export (GDPR Article 20)</h2>
        </div>
        <p className="text-xs text-vs-dim leading-relaxed mb-4">
          Export all personal telemetry, biometric metadata, registered device pairings, and historical analysis logs in machine-readable JSON format, or purge your biometric analysis history.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              try {
                const data = await exportPrivacyData();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `voxshield_export_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              } catch (e: any) {
                alert('Export failed: ' + e.message);
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-vs-primary hover:bg-vs-primary-hover text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Download size={14} /> Export My Account Data (.JSON)
          </button>
          <button
            onClick={async () => {
              if (!confirm('Are you sure you want to delete all historical voice analyses? This will purge biometric analysis records.')) return;
              try {
                const res = await deleteAnalysisHistory();
                alert(`Purged ${res.deleted_count} voice analysis records.`);
              } catch (e: any) {
                alert('Deletion failed: ' + e.message);
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-300 text-vs-danger hover:bg-red-50 text-xs font-semibold transition-all"
          >
            <Trash2 size={14} /> Clear Analysis History
          </button>
        </div>
      </div>
    </div>
  );
}
