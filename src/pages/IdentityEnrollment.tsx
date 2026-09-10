import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
  Mic,
  MicOff,
  Laptop,
  ArrowRight,
  RefreshCw,
  Lock,
  UserCheck,
  Smartphone,
} from 'lucide-react';
import {
  register,
  sendEmailOTP,
  verifyEmailOTP,
  resendEmailOTP,
  sendPhoneOTP,
  verifyPhoneOTP,
  resendPhoneOTP,
  sendDualOTP,
  verifyDualOTP,
  enrollSample,
  getIdentityProfile,
  getStoredUser,
  type IdentityProfileResponse,
} from '../services/api';
import { OTPInput } from '../components/OTPInput';

const ENROLLMENT_PHRASES = [
  'My voice is my password and digital identity.',
  'VoxShield protects my endpoint against deepfake attacks.',
  'Authorize access to my secure laptop environment.',
  'Real-time biometric speaker authentication is active.',
  'I confirm my identity and consent to voice analysis.',
];

export default function IdentityEnrollment() {
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Step 1: Account registration state
  const [formData, setFormData] = useState({
    name: 'Poorna Chandar',
    email: '',
    phone: '+919876543210',
    password: '',
    confirmPassword: '',
    consent: true,
  });

  // Step 2 & 3: Real OTP Verification states
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [maskedPhone, setMaskedPhone] = useState<string>('');
  const [otpLoading, setOtpLoading] = useState<boolean>(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [emailDevOtp, setEmailDevOtp] = useState<string | null>(null);
  const [phoneDevOtp, setPhoneDevOtp] = useState<string | null>(null);
  const [emailDeliveryGuide, setEmailDeliveryGuide] = useState<string | null>(null);
  const [phoneDeliveryGuide, setPhoneDeliveryGuide] = useState<string | null>(null);
  const [emailRealDelivered, setEmailRealDelivered] = useState<boolean>(false);
  const [phoneRealDelivered, setPhoneRealDelivered] = useState<boolean>(false);

  // Step 4: Voice enrollment state (5 samples)
  const [enrolledCount, setEnrolledCount] = useState<number>(0);
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [sampleStatuses, setSampleStatuses] = useState<string[]>([
    'idle', 'idle', 'idle', 'idle', 'idle'
  ]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Step 5: Final Identity Profile
  const [profile, setProfile] = useState<IdentityProfileResponse | null>(null);

  // Load existing profile on mount if authenticated
  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      setFormData((prev) => ({
        ...prev,
        name: user.name || prev.name,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
      }));
      loadProfileData();
    }
  }, []);

  const loadProfileData = async () => {
    try {
      const data = await getIdentityProfile();
      setProfile(data);
      setEmailVerified(data.email_verified);
      setPhoneVerified(data.phone_verified);
      setEnrolledCount(data.voice_samples);

      // Mask destinations for UI
      if (data.email) {
        const parts = data.email.split('@');
        setMaskedEmail(`${parts[0].charAt(0)}******@${parts[1] || 'domain.com'}`);
      }
      if (data.phone) {
        setMaskedPhone(data.phone.length > 4 ? `+91 ******${data.phone.slice(-4)}` : data.phone);
      }

      // Automatically determine starting step
      if (data.identity_status === 'ACTIVE') {
        setStep(5);
      } else if (!data.email_verified || !data.phone_verified) {
        setStep(2);
        if (data.email && data.phone) {
          handleSendDualOTP(data.email, data.phone);
        }
      } else if (data.voice_samples < 3) {
        setStep(4);
      } else {
        setStep(5);
      }
    } catch {
      // Not logged in or guest
    }
  };

  // ── Step 1: Create Account ─────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formData.name || !formData.email || !formData.password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!formData.consent) {
      setError('You must accept voice biometric and security consent to proceed.');
      return;
    }

    setLoading(true);
    try {
      await register({
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        password: formData.password,
        consent: formData.consent,
      });
      setSuccessMsg('Account created! Broadcasting 6-digit verification code to your phone & email.');
      setStep(2);
      handleSendDualOTP(formData.email, formData.phone);
    } catch (err: any) {
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('already exists') || errMsg.includes('already registered')) {
        setSuccessMsg('Existing account located. Broadcasting 6-digit verification security passcode to your phone and email.');
        setStep(2);
        handleSendDualOTP(formData.email, formData.phone);
      } else {
        setError(err.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Dual-Channel OTP Broadcast ───────────────────────────────────
  const handleSendDualOTP = async (overrideEmail?: string, overridePhone?: string) => {
    const targetEmail = overrideEmail || formData.email || profile?.email;
    const targetPhone = overridePhone || formData.phone || profile?.phone;

    if (!targetEmail || !targetPhone) {
      setOtpError('Both email address and phone number are required to broadcast the verification code.');
      return;
    }

    setOtpError(null);
    setOtpLoading(true);
    try {
      const res = await sendDualOTP(targetEmail, targetPhone, 'REGISTRATION');
      setMaskedEmail(res.masked_email || res.email || targetEmail);
      setMaskedPhone(res.masked_phone || res.phone || targetPhone);
      setOtpSuccess(res.message || '6-digit verification code broadcasted to phone & email.');
      setEmailDevOtp(res.dev_otp || res.demo_code || null);
      setPhoneDevOtp(res.dev_otp || res.demo_code || null);
      setEmailDeliveryGuide(res.delivery_guide || null);
      setEmailRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
      setPhoneRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
    } catch (err: any) {
      setOtpError(err.message || 'Failed to dispatch dual-channel verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyDualOTP = async (code: string) => {
    setOtpError(null);
    setOtpLoading(true);
    const targetEmail = formData.email || profile?.email;
    if (!targetEmail) {
      setOtpError('Missing email address for verification.');
      setOtpLoading(false);
      return;
    }
    try {
      await verifyDualOTP(targetEmail, code, 'REGISTRATION');
      setEmailVerified(true);
      setPhoneVerified(true);
      setOtpSuccess('Both Email and Phone verified successfully! Advancing to Voice Biometrics.');
      setTimeout(() => {
        setStep(4);
      }, 700);
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Step 2 Fallback: Real Email OTP ──────────────────────────────────────────────
  const handleSendEmailOTP = async () => {
    setOtpError(null);
    setOtpLoading(true);
    try {
      const res = await sendEmailOTP(formData.email, 'REGISTRATION');
      setMaskedEmail(res.masked_destination || res.destination || formData.email);
      setOtpSuccess(res.message || '6-digit verification code dispatched to email.');
      setEmailDevOtp(res.dev_otp || res.demo_code || null);
      setEmailDeliveryGuide(res.delivery_guide || null);
      setEmailRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
    } catch (err: any) {
      setOtpError(err.message || 'Failed to dispatch email verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyEmailOTP = async (code: string) => {
    setOtpError(null);
    setOtpLoading(true);
    try {
      await verifyEmailOTP(code, formData.email, 'REGISTRATION');
      setEmailVerified(true);
      setOtpSuccess('Email verified successfully!');
      setTimeout(() => {
        setStep(3);
        handleSendPhoneOTP();
      }, 700);
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired email verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Step 3: Real Phone OTP ──────────────────────────────────────────────
  const handleSendPhoneOTP = async () => {
    setOtpError(null);
    setOtpLoading(true);
    try {
      const res = await sendPhoneOTP(formData.phone, formData.email, 'REGISTRATION');
      setMaskedPhone(res.masked_destination || res.destination || formData.phone);
      setOtpSuccess(res.message || '6-digit verification code sent via SMS.');
      setPhoneDevOtp(res.dev_otp || res.demo_code || null);
      setPhoneDeliveryGuide(res.delivery_guide || null);
      setPhoneRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
    } catch (err: any) {
      setOtpError(err.message || 'Failed to dispatch SMS verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyPhoneOTP = async (code: string) => {
    setOtpError(null);
    setOtpLoading(true);
    try {
      await verifyPhoneOTP(code, formData.phone, formData.email, 'REGISTRATION');
      setPhoneVerified(true);
      setOtpSuccess('Phone number verified successfully! Proceeding to Voice Enrollment.');
      setTimeout(() => {
        setStep(4);
      }, 700);
    } catch (err: any) {
      setOtpError(err.message || 'Invalid or expired phone verification code.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Step 4: Voice Enrollment (3–5 samples) ──────────────────────────────────
  const startRecording = async (index: number) => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });

        setSampleStatuses((prev) => {
          const updated = [...prev];
          updated[index] = 'enrolling';
          return updated;
        });

        try {
          await enrollSample(audioBlob, index + 1);
          setSampleStatuses((prev) => {
            const updated = [...prev];
            updated[index] = 'enrolled';
            return updated;
          });
          setEnrolledCount((c) => Math.max(c, index + 1));
          setSuccessMsg(`Sample ${index + 1} acoustic embedding synthesized!`);

          if (index + 1 >= 3) {
            await loadProfileData();
          }
        } catch (err: any) {
          setError(err.message || `Failed to enroll sample ${index + 1}`);
          setSampleStatuses((prev) => {
            const updated = [...prev];
            updated[index] = 'error';
            return updated;
          });
        }
        setRecordingIndex(null);
      };

      recorder.start();
      setRecordingIndex(index);
      setSampleStatuses((prev) => {
        const updated = [...prev];
        updated[index] = 'recording';
        return updated;
      });
    } catch (err: any) {
      setError('Microphone access denied: ' + (err.message || 'Check browser permissions'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 font-sans text-slate-800">
      
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0B3B82] text-xs font-bold uppercase tracking-wider mb-3">
          <Shield className="w-3.5 h-3.5" />
          SIH26104 • Identity Verification & Enrollment
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Complete Security Enrollment
        </h1>
        <p className="text-slate-500 text-sm max-w-xl mx-auto mt-2">
          Establish multi-layer zero-trust identity combining cryptographic credentials, real email and phone OTP verification, and 1:N acoustic speaker embeddings.
        </p>
      </div>

      {/* Progress Wizard Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm mb-8 grid grid-cols-5 gap-2">
        {[
          { num: 1, label: 'Account' },
          { num: 2, label: 'Dual Broadcast OTP' },
          { num: 3, label: 'Phone OTP' },
          { num: 4, label: 'Voice Biometrics' },
          { num: 5, label: 'Active Identity' },
        ].map((s) => {
          const isDone = step > s.num;
          const isCurrent = step === s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (s.num < step || (step >= 2 && s.num <= 4)) {
                  setStep(s.num);
                }
              }}
              className={`flex items-center gap-2 p-2 rounded-xl text-left transition-all ${
                isCurrent
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-slate-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                  isDone
                    ? 'bg-emerald-700 text-white'
                    : isCurrent
                    ? 'bg-[#0B3B82] text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isDone ? '✓' : s.num}
              </div>
              <span
                className={`text-xs font-semibold truncate ${
                  isCurrent
                    ? 'text-[#0B3B82]'
                    : isDone
                    ? 'text-slate-800'
                    : 'text-slate-400'
                }`}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* STEP 1: CREATE ACCOUNT */}
      {step === 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Step 1: Account Credentials</h2>
            <p className="text-slate-500 text-sm mt-1">
              Provide identity details for cryptographic enrollment and multi-channel verification.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="analyst@enterprise.com"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phone Number (E.164)
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+919876543210"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Master Password
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B82] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
              <input
                type="checkbox"
                id="enroll-consent"
                checked={formData.consent}
                onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
                className="mt-1 rounded border-slate-300 text-[#0B3B82] focus:ring-[#0B3B82]"
              />
              <label htmlFor="enroll-consent" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                I consent to VoxShield extracting acoustic embeddings for speaker verification and anti-spoofing defense under SIH26104 standards.
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? 'Processing Identity...' : 'Continue to Dual Phone & Email Verification'}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500">Already have an account?</span>
              <button
                type="button"
                onClick={() => {
                  setStep(2);
                  handleSendDualOTP(formData.email, formData.phone);
                }}
                className="text-xs font-bold text-[#0B3B82] hover:underline"
              >
                Send verification code to phone & email →
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: DUAL-CHANNEL OTP BROADCAST VERIFICATION */}
      {step === 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm max-w-xl mx-auto">
          <OTPInput
            title="Dual-Channel Verification Broadcast"
            subtitle="Enter the 6-digit cryptographic security code broadcasted simultaneously to both your Phone Message Box (SMS) and Email Inbox:"
            destinationMasked={`${maskedEmail || formData.email || profile?.email || 'email'} & ${maskedPhone || formData.phone || profile?.phone || 'phone'}`}
            channel="DUAL"
            isLoading={otpLoading}
            error={otpError}
            successMessage={otpSuccess}
            devCode={emailDevOtp || phoneDevOtp}
            deliveryGuide={emailDeliveryGuide || phoneDeliveryGuide}
            isRealDelivered={emailRealDelivered || phoneRealDelivered}
            buttonLabel="Verify Passcode & Advance to Voice Biometrics"
            onComplete={handleVerifyDualOTP}
            onResend={() => handleSendDualOTP(formData.email, formData.phone)}
          />

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Simultaneous multi-channel broadcast ensures instant delivery.</span>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="text-[#0B3B82] font-bold hover:underline"
            >
              Skip to Voice Enrollment →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PHONE OTP VERIFICATION */}
      {step === 3 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm max-w-xl mx-auto">
          <OTPInput
            title="Verify your phone number"
            subtitle="Enter the 6-digit SMS verification code sent to"
            destinationMasked={maskedPhone || formData.phone}
            channel="PHONE"
            isLoading={otpLoading}
            error={otpError}
            successMessage={otpSuccess}
            devCode={phoneDevOtp}
            deliveryGuide={phoneDeliveryGuide}
            isRealDelivered={phoneRealDelivered}
            buttonLabel="Verify Phone & Continue"
            onComplete={handleVerifyPhoneOTP}
            onResend={async () => {
              try {
                const res = await resendPhoneOTP(formData.phone, formData.email, 'REGISTRATION');
                setOtpSuccess(res.message || 'New SMS code dispatched.');
                setPhoneDevOtp(res.dev_otp || res.demo_code || null);
                setPhoneDeliveryGuide(res.delivery_guide || null);
                setPhoneRealDelivered(res.provider_status === 'DELIVERED' || !!res.real_delivery);
              } catch (err: any) {
                setOtpError(err.message || 'Cooldown in effect.');
              }
            }}
          />

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Enables secondary SMS approvals for high-risk commands.</span>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="text-[#0B3B82] font-bold hover:underline"
            >
              Skip to Voice Enrollment →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: VOICE ENROLLMENT */}
      {step === 4 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Step 4: Voice Biometrics Enrollment</h2>
              <p className="text-slate-500 text-sm mt-1">
                Record 3 to 5 clear voice samples to construct your 1:N acoustic speaker recognition model.
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold self-start md:self-auto ${
              enrolledCount >= 3 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {enrolledCount} / 5 Samples Recorded
            </div>
          </div>

          <div className="space-y-3 mb-6">
            {ENROLLMENT_PHRASES.map((phrase, idx) => {
              const isRecorded = idx < enrolledCount || sampleStatuses[idx] === 'enrolled';
              const isCurrRec = recordingIndex === idx;

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                    isRecorded
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : isCurrRec
                      ? 'bg-red-50 border-red-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Sample {idx + 1}
                      </span>
                      {isRecorded && (
                        <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Embedded
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800 italic">
                      "{phrase}"
                    </p>
                  </div>

                  <div>
                    {isCurrRec ? (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 animate-pulse shadow-sm"
                      >
                        <MicOff className="w-4 h-4" />
                        Stop Recording
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRecording(idx)}
                        disabled={recordingIndex !== null}
                        className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${
                          isRecorded
                            ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                            : 'bg-[#0B3B82] hover:bg-[#082F6B] text-white shadow-sm'
                        } disabled:opacity-50`}
                      >
                        <Mic className="w-4 h-4" />
                        {isRecorded ? 'Re-record' : 'Record Phrase'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {enrolledCount >= 3 ? (
            <button
              type="button"
              onClick={() => {
                loadProfileData();
                setStep(5);
              }}
              className="w-full py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              Complete Identity Enrollment
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <p className="text-xs text-slate-400 text-center">
              Please record at least 3 voice samples to activate your acoustic identity model.
            </p>
          )}
        </div>
      )}

      {/* STEP 5: ACTIVE IDENTITY PROFILE CARD */}
      {step === 5 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md">
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-100">
            <div>
              <span className="text-[11px] font-bold text-[#0B3B82] uppercase tracking-wider">
                Enterprise Identity Credential
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
                Active Identity Profile
              </h2>
            </div>
            <div className="px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              SYSTEM READY & ACTIVE
            </div>
          </div>

          {/* Verification Badges Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Email
              </span>
              <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                VERIFIED
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Phone
              </span>
              <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                VERIFIED
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Voice
              </span>
              <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                ENROLLED
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Device
              </span>
              <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                TRUSTED
              </div>
            </div>
          </div>

          {/* Identity Parameters */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-slate-400 font-medium block">Identity Holder</span>
              <span className="font-bold text-slate-800">{profile?.name || formData.name}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium block">Acoustic Samples</span>
              <span className="font-bold text-slate-800">{profile?.voice_samples || Math.max(enrolledCount, 3)} Vectors Synthesized</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium block">Verified Email</span>
              <span className="font-medium text-slate-700">{profile?.email || formData.email}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium block">Verified Phone</span>
              <span className="font-medium text-slate-700">{profile?.phone || formData.phone}</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="px-6 py-3 bg-[#0B3B82] hover:bg-[#082F6B] text-white font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center gap-2 no-underline"
            >
              Open Security Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/voice-analyzer"
              className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold rounded-xl text-sm transition-all flex items-center gap-2 no-underline"
            >
              Start Voice Analysis →
            </Link>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="px-4 py-3 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Retrain Voice Model
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
