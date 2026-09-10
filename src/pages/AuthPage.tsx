import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, Mail, Phone, User as UserIcon, CheckCircle2, AlertCircle, ArrowRight, KeyRound, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  forgotPassword,
  sendEmailOTP,
  verifyEmailOTP,
  sendPhoneOTP,
  verifyPhoneOTP,
  resendEmailOTP,
  resendPhoneOTP,
  loginRequestPhoneOTP,
  loginRequestEmailOTP,
} from '../services/api';
import { OTPInput } from '../components/OTPInput';

interface AuthPageProps {
  defaultMode?: 'LOGIN' | 'REGISTER';
}

type AuthMode = 
  | 'LOGIN_PASSWORD'
  | 'LOGIN_PHONE_OTP_REQUEST'
  | 'LOGIN_PHONE_OTP_VERIFY'
  | 'LOGIN_EMAIL_OTP_REQUEST'
  | 'LOGIN_EMAIL_OTP_VERIFY'
  | 'REGISTER'
  | 'VERIFY_REG_EMAIL_OTP'
  | 'VERIFY_REG_PHONE_OTP'
  | 'FORGOT';

export default function AuthPage({ defaultMode = 'LOGIN' }: AuthPageProps) {
  const { login, loginWithPhoneOTP, loginWithEmailOTP, register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>(() => {
    if (location.pathname === '/register') return 'REGISTER';
    return defaultMode === 'REGISTER' ? 'REGISTER' : 'LOGIN_PASSWORD';
  });

  useEffect(() => {
    if (location.pathname === '/register') {
      setMode('REGISTER');
    } else if (location.pathname === '/login' && mode === 'REGISTER') {
      setMode('LOGIN_PASSWORD');
    }
  }, [location.pathname]);

  // If already logged in and verified, redirect to dashboard
  useEffect(() => {
    if (user && mode !== 'VERIFY_REG_EMAIL_OTP' && mode !== 'VERIFY_REG_PHONE_OTP') {
      navigate('/dashboard');
    }
  }, [user, mode, navigate]);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(true);

  // OTP Flow states
  const [otpTargetDestination, setOtpTargetDestination] = useState('');
  const [otpMaskedDestination, setOtpMaskedDestination] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [otpDeliveryGuide, setOtpDeliveryGuide] = useState<string | null>(null);
  const [otpRealDelivered, setOtpRealDelivered] = useState(false);

  // Status states
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Clear notices on mode change
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setSuccessMsg('');
    setOtpError(null);
    setOtpSuccess(null);
    setOtpDevCode(null);
    setOtpDeliveryGuide(null);
    setOtpRealDelivered(false);
  };

  // Demo credential autofills
  const fillDemo = (demoEmail: string, demoPass: string, demoName?: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    if (demoName) setName(demoName);
    setError('');
    setSuccessMsg('');
  };

  // 1. Password Login
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim() || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err: any) {
      const msg = (err && err.message && err.message !== '[object Object]') ? err.message : 'Invalid email or password. Please verify your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 2. Request Phone Login OTP
  const handleRequestPhoneLoginOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!phone.trim()) {
      setError('Please enter your registered phone number (e.g., +919876543210).');
      return;
    }

    setLoading(true);
    try {
      const res = await loginRequestPhoneOTP(phone.trim());
      setOtpTargetDestination(phone.trim());
      setOtpMaskedDestination(res.masked_destination || phone.trim());
      setOtpSuccess(res.message || 'Verification code sent to your phone.');
      setOtpDevCode(res.dev_otp || res.demo_code || null);
      setOtpDeliveryGuide(res.delivery_guide || null);
      setOtpRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
      setMode('LOGIN_PHONE_OTP_VERIFY');
    } catch (err: any) {
      setError(err.message || 'Failed to send phone OTP.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Verify Phone Login OTP
  const handleVerifyPhoneLoginOTP = async (code: string) => {
    setOtpError(null);
    setIsOtpLoading(true);
    try {
      await loginWithPhoneOTP(otpTargetDestination, code);
      navigate('/dashboard');
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired phone verification code.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  // 4. Request Email Login OTP
  const handleRequestEmailLoginOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim()) {
      setError('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await loginRequestEmailOTP(email.trim());
      setOtpTargetDestination(email.trim());
      setOtpMaskedDestination(res.masked_destination || email.trim());
      setOtpSuccess(res.message || 'Verification code dispatched to your email.');
      setOtpDevCode(res.dev_otp || res.demo_code || null);
      setOtpDeliveryGuide(res.delivery_guide || null);
      setOtpRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
      setMode('LOGIN_EMAIL_OTP_VERIFY');
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch email OTP.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Verify Email Login OTP
  const handleVerifyEmailLoginOTP = async (code: string) => {
    setOtpError(null);
    setIsOtpLoading(true);
    try {
      await loginWithEmailOTP(otpTargetDestination, code);
      navigate('/dashboard');
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired email verification code.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  // 6. Registration Flow: Submit -> Account Created -> Send Email OTP
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!name.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!consent) {
      setError('Biometric processing consent is required for voice security verification.');
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

      // Account created! Trigger Email OTP
      try {
        const otpRes = await sendEmailOTP(email.trim(), 'REGISTRATION');
        setOtpTargetDestination(email.trim());
        setOtpMaskedDestination(otpRes.masked_destination || email.trim());
        setOtpSuccess('Account created! A 6-digit verification code has been dispatched to your email.');
        setOtpDevCode(otpRes.dev_otp || otpRes.demo_code || null);
        setOtpDeliveryGuide(otpRes.delivery_guide || null);
        setOtpRealDelivered(otpRes.provider_status === 'DELIVERED' || !!otpRes.real_delivery);
        setMode('VERIFY_REG_EMAIL_OTP');
      } catch (otpErr: any) {
        // Even if provider has no credentials in dev mode, transition to verify screen with message
        setOtpTargetDestination(email.trim());
        setOtpMaskedDestination(email.trim());
        setOtpError(otpErr.message || 'Email OTP delivery failed. Please check provider settings or resend.');
        setMode('VERIFY_REG_EMAIL_OTP');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // 7. Verify Registration Email OTP -> Trigger Phone OTP (or Voice Enrollment if no phone)
  const handleVerifyRegEmailOTP = async (code: string) => {
    setOtpError(null);
    setIsOtpLoading(true);
    try {
      await verifyEmailOTP(code, email.trim(), 'REGISTRATION');
      setOtpSuccess('Email verified successfully!');

      if (phone.trim()) {
        // Next: Send Phone OTP
        try {
          const phoneRes = await sendPhoneOTP(phone.trim(), email.trim(), 'REGISTRATION');
          setOtpTargetDestination(phone.trim());
          setOtpMaskedDestination(phoneRes.masked_destination || phone.trim());
          setOtpDevCode(phoneRes.dev_otp || phoneRes.demo_code || null);
          setOtpDeliveryGuide(phoneRes.delivery_guide || null);
          setOtpRealDelivered(phoneRes.provider_status === 'DELIVERED' || !!phoneRes.real_delivery);
          setMode('VERIFY_REG_PHONE_OTP');
        } catch (phoneErr: any) {
          setOtpTargetDestination(phone.trim());
          setOtpMaskedDestination(phone.trim());
          setOtpError(phoneErr.message || 'Phone OTP delivery notice. Please enter the received code or resend.');
          setMode('VERIFY_REG_PHONE_OTP');
        }
      } else {
        // No phone provided, proceed directly to voice enrollment
        navigate('/voice-enrollment');
      }
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired email verification code.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  // 8. Verify Registration Phone OTP -> Proceed to Voice Enrollment
  const handleVerifyRegPhoneOTP = async (code: string) => {
    setOtpError(null);
    setIsOtpLoading(true);
    try {
      await verifyPhoneOTP(code, phone.trim(), email.trim(), 'REGISTRATION');
      setOtpSuccess('Phone number verified successfully!');
      setTimeout(() => {
        navigate('/voice-enrollment');
      }, 800);
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired phone verification code.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  // 9. Forgot Password
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim()) {
      setError('Please enter your account email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccessMsg(res.message || 'If an account exists, a password reset email has been dispatched.');
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch reset instructions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden grid md:grid-cols-12 min-h-[640px]">
        
        {/* LEFT COLUMN: Enterprise Brand & Security Overview (White Theme) */}
        <div className="md:col-span-5 bg-slate-50 border-r border-slate-200 text-slate-900 p-8 md:p-10 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle geometric lines */}
          <div className="absolute inset-0 opacity-40 pointer-events-none">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="auth-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#E2E8F0" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#auth-grid)" />
            </svg>
          </div>

          <div className="relative z-10">
            {/* Logo */}
            <Link to="/" className="inline-flex items-center gap-3 no-underline group mb-10">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center group-hover:bg-blue-100/70 transition-all shadow-xs">
                <Shield className="w-5 h-5 text-[#0B3B82]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold text-[#0B3B82] tracking-tight leading-none">
                  VoxShield <span className="text-[#155EAD]">AI</span>
                </span>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mt-1">
                  SIH26104 Security Platform
                </span>
              </div>
            </Link>

            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0B3B82] text-xs font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-[#155EAD] animate-pulse" />
                Zero-Trust Voice Gateway
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
                Defend against voice cloning and AI impersonation.
              </h1>
              <p className="text-slate-600 text-sm leading-relaxed">
                Enterprise biometric authentication combining real-time spectral acoustics, deepfake detection, cryptographic hardware tokens, and dual-channel OTP verification.
              </p>
            </div>

            {/* Enterprise Security Features */}
            <div className="mt-8 space-y-3">
              <div className="flex items-start gap-3 text-sm text-slate-700 font-medium">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <span>Multi-factor voice + cryptographic OTP binding</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-slate-700 font-medium">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <span>E.164 phone normalization with instant SMS delivery</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-slate-700 font-medium">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <span>Zero plaintext credential exposure architecture</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-8 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>© 2026 VoxShield AI Security</span>
            <span className="text-[#0B3B82] font-bold">Enterprise Active</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Form & Verification Cards */}
        <div className="md:col-span-7 p-8 md:p-12 flex flex-col justify-center bg-white">
          
          {/* Top Mode Header / Step Tracker */}
          {mode === 'REGISTER' && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <span className="text-[#0B3B82] font-bold">Step 1: Account Credentials</span>
                <span>Step 2: Contact OTP</span>
                <span>Step 3: Voice Profile</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-[#0B3B82] h-full w-1/3 transition-all duration-300" />
              </div>
            </div>
          )}

          {(mode === 'VERIFY_REG_EMAIL_OTP' || mode === 'VERIFY_REG_PHONE_OTP') && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <span className="text-emerald-700 font-bold">✓ Step 1: Account</span>
                <span className="text-[#0B3B82] font-bold">
                  {mode === 'VERIFY_REG_EMAIL_OTP' ? 'Step 2: Email OTP' : 'Step 2: Phone OTP'}
                </span>
                <span>Step 3: Voice Profile</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className={`bg-[#0B3B82] h-full ${mode === 'VERIFY_REG_EMAIL_OTP' ? 'w-2/3' : 'w-5/6'} transition-all duration-300`} />
              </div>
            </div>
          )}

          {/* Tab Switcher for Sign In vs Register (only when in primary views) */}
          {(mode === 'LOGIN_PASSWORD' || mode === 'LOGIN_PHONE_OTP_REQUEST' || mode === 'LOGIN_EMAIL_OTP_REQUEST' || mode === 'REGISTER') && (
            <div className="flex bg-slate-100 p-1 rounded-xl mb-6 border border-slate-200">
              <button
                type="button"
                onClick={() => switchMode('LOGIN_PASSWORD')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode !== 'REGISTER'
                    ? 'bg-white text-[#0B3B82] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('REGISTER')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'REGISTER'
                    ? 'bg-white text-[#0B3B82] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Feedback Notices */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{typeof error === 'object' ? JSON.stringify(error) : (error === '[object Object]' ? 'Invalid email or password. Please verify credentials.' : String(error))}</span>
            </div>
          )}
          {successMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* VIEW 1: PASSWORD LOGIN */}
          {mode === 'LOGIN_PASSWORD' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Enterprise Sign In</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Access your security operations console and voice monitoring gateway.
                </p>
              </div>

              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Corporate Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="analyst@voxshield.ai"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Master Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('FORGOT')}
                      className="text-xs text-[#0B3B82] hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? 'Authenticating...' : 'Sign In with Password'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Alternative OTP Login Methods */}
              <div className="mt-6 pt-6 border-t border-slate-200">
                <p className="text-xs text-center text-slate-500 uppercase tracking-wider font-semibold mb-3">
                  Or Sign In Passwordless with OTP
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => switchMode('LOGIN_PHONE_OTP_REQUEST')}
                    className="py-2.5 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center gap-2 transition-all"
                  >
                    <Smartphone className="w-4 h-4 text-[#0B3B82]" />
                    Phone SMS OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('LOGIN_EMAIL_OTP_REQUEST')}
                    className="py-2.5 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center gap-2 transition-all"
                  >
                    <Mail className="w-4 h-4 text-[#0B3B82]" />
                    Email OTP
                  </button>
                </div>
              </div>

              {/* Demo Fill Helper */}
              <div className="mt-6 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">Demo Accounts: </span>
                  <span className="text-slate-500">analyst@voxshield.ai</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemo('analyst@voxshield.ai', 'Analyst@123', 'Security Analyst')}
                    className="text-[#0B3B82] font-bold hover:underline"
                  >
                    Analyst Auto-fill
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => fillDemo('admin@voxshield.ai', 'Admin@123', 'Security Administrator')}
                    className="text-[#0B3B82] font-bold hover:underline"
                  >
                    Admin
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: PHONE OTP LOGIN - REQUEST */}
          {mode === 'LOGIN_PHONE_OTP_REQUEST' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Login with Phone OTP</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Enter your registered phone number. A secure 6-digit code will be sent via SMS.
                </p>
              </div>

              <form onSubmit={handleRequestPhoneLoginOTP} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Phone Number (E.164 Format)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+919876543210"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Include country code (+91 for India).</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? 'Dispatching SMS...' : 'Send Verification Code'}
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('LOGIN_PASSWORD')}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-medium text-center"
                >
                  ← Back to Password Sign In
                </button>
              </form>
            </div>
          )}

          {/* VIEW 3: PHONE OTP LOGIN - VERIFY */}
          {mode === 'LOGIN_PHONE_OTP_VERIFY' && (
            <div>
              <OTPInput
                title="Verify your phone number"
                subtitle="Enter the 6-digit verification code sent to"
                destinationMasked={otpMaskedDestination}
                channel="PHONE"
                isLoading={isOtpLoading}
                error={otpError}
                successMessage={otpSuccess}
                devCode={otpDevCode}
                deliveryGuide={otpDeliveryGuide}
                isRealDelivered={otpRealDelivered}
                buttonLabel="Authenticate & Sign In"
                onComplete={handleVerifyPhoneLoginOTP}
                onResend={async () => {
                  try {
                    const res = await loginRequestPhoneOTP(otpTargetDestination);
                    setOtpSuccess(res.message || 'New code sent.');
                    setOtpDevCode(res.dev_otp || res.demo_code || null);
                    setOtpDeliveryGuide(res.delivery_guide || null);
                    setOtpRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
                  } catch (err: any) {
                    setOtpError(err.message || 'Resend cooldown in effect.');
                  }
                }}
              />
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN_PHONE_OTP_REQUEST')}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Change phone number
                </button>
              </div>
            </div>
          )}

          {/* VIEW 4: EMAIL OTP LOGIN - REQUEST */}
          {mode === 'LOGIN_EMAIL_OTP_REQUEST' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Login with Email OTP</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Enter your registered email address. We will dispatch a 6-digit one-time code.
                </p>
              </div>

              <form onSubmit={handleRequestEmailLoginOTP} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@enterprise.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? 'Dispatching Email...' : 'Send Verification Code'}
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('LOGIN_PASSWORD')}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-medium text-center"
                >
                  ← Back to Password Sign In
                </button>
              </form>
            </div>
          )}

          {/* VIEW 5: EMAIL OTP LOGIN - VERIFY */}
          {mode === 'LOGIN_EMAIL_OTP_VERIFY' && (
            <div>
              <OTPInput
                title="Verify your email address"
                subtitle="Enter the 6-digit verification code sent to"
                destinationMasked={otpMaskedDestination}
                channel="EMAIL"
                isLoading={isOtpLoading}
                error={otpError}
                successMessage={otpSuccess}
                devCode={otpDevCode}
                deliveryGuide={otpDeliveryGuide}
                isRealDelivered={otpRealDelivered}
                buttonLabel="Authenticate & Sign In"
                onComplete={handleVerifyEmailLoginOTP}
                onResend={async () => {
                  try {
                    const res = await loginRequestEmailOTP(otpTargetDestination);
                    setOtpSuccess(res.message || 'New code sent.');
                    setOtpDevCode(res.dev_otp || res.demo_code || null);
                    setOtpDeliveryGuide(res.delivery_guide || null);
                    setOtpRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
                  } catch (err: any) {
                    setOtpError(err.message || 'Resend cooldown in effect.');
                  }
                }}
              />
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN_EMAIL_OTP_REQUEST')}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Change email address
                </button>
              </div>
            </div>
          )}

          {/* VIEW 6: REGISTRATION FORM */}
          {mode === 'REGISTER' && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Create Enterprise Identity</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Enrolls you into the zero-trust voice defense network with dual-contact OTP verification.
                </p>
              </div>

              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Full Legal Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Col. Priya Sharma"
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="priya@enterprise.gov"
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Phone Number (E.164)
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+919876543210"
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Password (min 8 chars)
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Biometric Consent */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 rounded border-slate-300 text-[#0B3B82] focus:ring-[#0B3B82]"
                  />
                  <label htmlFor="consent" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                    I consent to cryptographic extraction of acoustic embeddings for anti-spoofing and identity verification under SIH26104 security guidelines.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? 'Creating Identity...' : 'Create Account & Send OTP'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* VIEW 7: REGISTRATION EMAIL OTP VERIFICATION */}
          {mode === 'VERIFY_REG_EMAIL_OTP' && (
            <div>
              <OTPInput
                title="Verify your email address"
                subtitle="Step 1 of 2: We sent a 6-digit verification code to"
                destinationMasked={otpMaskedDestination}
                channel="EMAIL"
                isLoading={isOtpLoading}
                error={otpError}
                successMessage={otpSuccess}
                devCode={otpDevCode}
                deliveryGuide={otpDeliveryGuide}
                isRealDelivered={otpRealDelivered}
                buttonLabel="Verify Email & Continue"
                onComplete={handleVerifyRegEmailOTP}
                onResend={async () => {
                  try {
                    const res = await resendEmailOTP(email.trim(), 'REGISTRATION');
                    setOtpSuccess(res.message || 'New verification code dispatched.');
                    setOtpDevCode(res.dev_otp || res.demo_code || null);
                    setOtpDeliveryGuide(res.delivery_guide || null);
                    setOtpRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
                  } catch (err: any) {
                    setOtpError(err.message || 'Resend cooldown in effect. Please wait.');
                  }
                }}
              />
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Verification required before enrollment.</span>
                {phone.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('VERIFY_REG_PHONE_OTP');
                      setOtpTargetDestination(phone.trim());
                      setOtpMaskedDestination(phone.trim());
                    }}
                    className="text-[#0B3B82] font-semibold hover:underline"
                  >
                    Skip to Phone OTP →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW 8: REGISTRATION PHONE OTP VERIFICATION */}
          {mode === 'VERIFY_REG_PHONE_OTP' && (
            <div>
              <OTPInput
                title="Verify your phone number"
                subtitle="Step 2 of 2: We sent a 6-digit verification code to"
                destinationMasked={otpMaskedDestination}
                channel="PHONE"
                isLoading={isOtpLoading}
                error={otpError}
                successMessage={otpSuccess}
                devCode={otpDevCode}
                deliveryGuide={otpDeliveryGuide}
                isRealDelivered={otpRealDelivered}
                buttonLabel="Verify Phone & Proceed"
                onComplete={handleVerifyRegPhoneOTP}
                onResend={async () => {
                  try {
                    const res = await resendPhoneOTP(phone.trim(), email.trim(), 'REGISTRATION');
                    setOtpSuccess(res.message || 'New SMS code dispatched.');
                    setOtpDevCode(res.dev_otp || res.demo_code || null);
                    setOtpDeliveryGuide(res.delivery_guide || null);
                    setOtpRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
                  } catch (err: any) {
                    setOtpError(err.message || 'Resend cooldown in effect. Please wait.');
                  }
                }}
              />
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Both contact points verify multi-layer trust.</span>
                <button
                  type="button"
                  onClick={() => navigate('/voice-enrollment')}
                  className="text-[#0B3B82] font-semibold hover:underline"
                >
                  Proceed to Voice Enrollment →
                </button>
              </div>
            </div>
          )}

          {/* VIEW 9: FORGOT PASSWORD */}
          {mode === 'FORGOT' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Reset Password</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Enter your email address to receive password reset authorization.
                </p>
              </div>

              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Account Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@enterprise.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? 'Dispatching...' : 'Send Reset Link'}
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('LOGIN_PASSWORD')}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-medium text-center"
                >
                  ← Back to Sign In
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
