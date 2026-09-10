import React, { useState } from 'react';
import { Shield, X, Eye, EyeOff, Lock, Mail, User as UserIcon, Phone, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { forgotPassword } from '../services/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (token: string, user: any) => void;
}

export default function AuthModal({ isOpen, onClose, onLoginSuccess }: AuthModalProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');

  // Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);

  // States
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      if (onLoginSuccess) {
        onLoginSuccess('', {});
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!name.trim()) {
      setError('Full name is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!consent) {
      setError('You must consent to voice processing to proceed');
      return;
    }
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        consent,
      });
      if (onLoginSuccess) {
        onLoginSuccess('', {});
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccessMsg(res.message || 'If an account exists, a password reset link has been dispatched.');
    } catch (err: any) {
      setError(err.message || 'Failed to process request');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: 'LOGIN' | 'REGISTER' | 'FORGOT') => {
    setMode(m);
    setError('');
    setSuccessMsg('');
  };

  const isDev = import.meta.env.DEV;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-vs-line rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 pb-0 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-vs-navy flex items-center justify-center text-white shadow-sm">
              <Shield size={20} />
            </div>
            <div>
              <div className="text-base font-bold text-vs-ink">VoxShield AI</div>
              <div className="text-[11px] font-semibold text-vs-blue uppercase tracking-wider">
                Identity & Access Gate
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-vs-line flex items-center justify-center text-vs-dim hover:bg-slate-50 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode switcher tabs */}
        {mode !== 'FORGOT' && (
          <div className="flex border-b border-vs-line px-6 mt-5 gap-6">
            {(['LOGIN', 'REGISTER'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`pb-3 text-xs font-bold tracking-wider transition-all border-b-2 ${
                  mode === m
                    ? 'border-vs-primary text-vs-primary'
                    : 'border-transparent text-vs-dim hover:text-vs-ink'
                }`}
              >
                {m === 'LOGIN' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </button>
            ))}
          </div>
        )}

        {/* Form Body */}
        <form
          onSubmit={mode === 'LOGIN' ? handleLogin : mode === 'REGISTER' ? handleRegister : handleForgot}
          className="p-6 space-y-4"
        >
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-vs-danger">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{typeof error === 'object' ? JSON.stringify(error) : (error === '[object Object]' ? 'Authentication failed. Please check credentials.' : String(error))}</span>
            </div>
          )}

          {/* Success Message */}
          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-xs text-vs-success">
              <CheckCircle size={15} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Register: Full Name */}
          {mode === 'REGISTER' && (
            <div>
              <label className="block text-[11px] font-semibold text-vs-dim uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Connor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-vs-line rounded-xl text-xs text-vs-ink placeholder:text-slate-400 focus:bg-white focus:border-vs-primary focus:outline-none transition-all"
                />
                <UserIcon size={14} className="absolute left-3 top-3 text-vs-dim" />
              </div>
            </div>
          )}

          {/* Email Address */}
          <div>
            <label className="block text-[11px] font-semibold text-vs-dim uppercase tracking-wider mb-1.5">
              Work Email
            </label>
            <div className="relative">
              <input
                type="email"
                required
                placeholder="name@organization.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-vs-line rounded-xl text-xs text-vs-ink placeholder:text-slate-400 focus:bg-white focus:border-vs-primary focus:outline-none transition-all"
              />
              <Mail size={14} className="absolute left-3 top-3 text-vs-dim" />
            </div>
          </div>

          {/* Register: Phone Number */}
          {mode === 'REGISTER' && (
            <div>
              <label className="block text-[11px] font-semibold text-vs-dim uppercase tracking-wider mb-1.5">
                Mobile Number (For SMS OTP)
              </label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-vs-line rounded-xl text-xs text-vs-ink placeholder:text-slate-400 focus:bg-white focus:border-vs-primary focus:outline-none transition-all"
                />
                <Phone size={14} className="absolute left-3 top-3 text-vs-dim" />
              </div>
            </div>
          )}

          {/* Password (Login or Register) */}
          {mode !== 'FORGOT' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[11px] font-semibold text-vs-dim uppercase tracking-wider">
                  Password
                </label>
                {mode === 'LOGIN' && (
                  <button
                    type="button"
                    onClick={() => switchMode('FORGOT')}
                    className="text-[11px] font-semibold text-vs-blue hover:text-vs-navy"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-vs-line rounded-xl text-xs text-vs-ink placeholder:text-slate-400 focus:bg-white focus:border-vs-primary focus:outline-none transition-all"
                />
                <Lock size={14} className="absolute left-3 top-3 text-vs-dim" />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-3 text-vs-dim hover:text-vs-ink"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Register: Confirm Password */}
          {mode === 'REGISTER' && (
            <div>
              <label className="block text-[11px] font-semibold text-vs-dim uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-vs-line rounded-xl text-xs text-vs-ink placeholder:text-slate-400 focus:bg-white focus:border-vs-primary focus:outline-none transition-all"
                />
                <Lock size={14} className="absolute left-3 top-3 text-vs-dim" />
              </div>
            </div>
          )}

          {/* Register: Biometric Consent */}
          {mode === 'REGISTER' && (
            <label className="flex items-start gap-2 text-xs text-vs-dim leading-relaxed cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 rounded border-vs-line text-vs-primary focus:ring-vs-primary"
              />
              <span>
                I agree to the mathematical biometric feature extraction & Zero-Trust verification terms.
              </span>
            </label>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-vs-primary hover:bg-vs-primary-hover text-white text-xs font-bold shadow-sm disabled:opacity-50 transition-all mt-2"
          >
            {loading ? (
              'Processing…'
            ) : mode === 'LOGIN' ? (
              'SIGN IN TO CONSOLE'
            ) : mode === 'REGISTER' ? (
              'CREATE ENTERPRISE IDENTITY'
            ) : (
              'SEND PASSWORD RESET LINK'
            )}
          </button>

          {/* Forgot Password Back Button */}
          {mode === 'FORGOT' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className="text-xs text-vs-dim hover:text-vs-ink"
              >
                ← Return to Sign In
              </button>
            </div>
          )}

          {/* Dev Seed Shortcuts */}
          {isDev && mode === 'LOGIN' && (
            <div className="pt-3 border-t border-vs-line">
              <div className="text-[10px] font-semibold text-vs-dim uppercase tracking-wider text-center mb-2">
                Quick Dev Test Credentials
              </div>
              <div className="flex gap-2">
                {[
                  { label: 'Admin', email: 'admin@voxshield.ai', pass: 'Admin@123' },
                  { label: 'Analyst', email: 'analyst@voxshield.ai', pass: 'Analyst@123' },
                  { label: 'Operator', email: 'operator@voxshield.ai', pass: 'Operator@123' },
                ].map((acc) => (
                  <button
                    key={acc.label}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword(acc.pass);
                    }}
                    className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-vs-ink text-[11px] font-medium transition-colors"
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
