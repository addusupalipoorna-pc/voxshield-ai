import React, { useState, useRef, useEffect } from 'react';
import { Shield, ArrowRight, RotateCw, CheckCircle2, AlertCircle, Zap, Mail, Smartphone, Copy, Check, Info, ChevronDown, ChevronUp, Key, Send, Settings2 } from 'lucide-react';
import { configureCredentials } from '../services/api';

interface OTPInputProps {
  title?: string;
  subtitle?: string;
  destinationMasked?: string;
  emailMasked?: string;
  phoneMasked?: string;
  channel?: 'PHONE' | 'EMAIL' | 'DUAL';
  length?: number;
  isLoading?: boolean;
  error?: string | null;
  successMessage?: string | null;
  cooldownSeconds?: number;
  onComplete: (code: string) => void;
  onResend?: () => void;
  buttonLabel?: string;
  devCode?: string | null;
  deliveryGuide?: string | null;
  isRealDelivered?: boolean;
}

export const OTPInput: React.FC<OTPInputProps> = ({
  title = 'Verify your code',
  subtitle,
  destinationMasked,
  emailMasked,
  phoneMasked,
  channel = 'PHONE',
  length = 6,
  isLoading = false,
  error = null,
  successMessage = null,
  cooldownSeconds = 60,
  onComplete,
  onResend,
  buttonLabel = 'Verify Code',
  devCode = null,
  deliveryGuide = null,
  isRealDelivered = false,
}) => {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const [timer, setTimer] = useState<number>(cooldownSeconds);
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'SMS' | 'EMAIL'>(channel === 'EMAIL' ? 'EMAIL' : 'SMS');
  // OTP expiry countdown (15 minutes = 900 seconds)
  const [otpExpiry, setOtpExpiry] = useState<number>(900);

  // Real delivery configuration state
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fast2smsKey, setFast2smsKey] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleAutoFill = (code: string) => {
    const clean = code.replace(/\D/g, '').slice(0, length);
    const newDigits = clean.split('');
    while (newDigits.length < length) newDigits.push('');
    setDigits(newDigits);
    if (clean.length === length) {
      onComplete(clean);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpPassword && !fast2smsKey) {
      setConfigFeedback({ type: 'error', message: 'Please enter at least one credential (Gmail App Password or Fast2SMS API Key).' });
      return;
    }
    setConfigLoading(true);
    setConfigFeedback(null);
    try {
      const res = await configureCredentials({
        smtp_password: smtpPassword || undefined,
        fast2sms_api_key: fast2smsKey || undefined,
      });
      setConfigFeedback({
        type: 'success',
        message: 'Credentials successfully saved! Broadcasting live OTP to your physical devices now...',
      });
      // Trigger resend to dispatch real message
      if (onResend) {
        setTimeout(() => onResend(), 800);
      }
    } catch (err: any) {
      setConfigFeedback({
        type: 'error',
        message: err.message || 'Failed to save credentials.',
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // Focus the first empty input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // OTP expiry countdown - resets when devCode changes
  useEffect(() => {
    if (!devCode) return;
    setOtpExpiry(900); // 15 minutes
    const interval = setInterval(() => {
      setOtpExpiry((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [devCode]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only numeric characters
    const numericChar = val.replace(/\D/g, '');

    if (!numericChar) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    const lastChar = numericChar.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = lastChar;
    setDigits(newDigits);

    // Auto-advance to next input
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    } else {
      // If last box filled, check if all boxes are filled
      const fullCode = newDigits.join('');
      if (fullCode.length === length) {
        onComplete(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move back and delete previous
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < length; i++) {
      newDigits[i] = pastedData[i] || '';
    }
    setDigits(newDigits);

    const focusIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[focusIndex]?.focus();

    if (pastedData.length === length) {
      onComplete(pastedData);
    }
  };

  const handleResendClick = () => {
    if (timer > 0 || !onResend) return;
    setTimer(cooldownSeconds);
    setDigits(Array(length).fill(''));
    inputRefs.current[0]?.focus();
    onResend();
  };

  const isFull = digits.join('').length === length;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-[0_4px_24px_rgba(15,23,42,0.06)] text-center">
      {/* Header Shield Badge */}
      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-4 text-[#0B3B82]">
        <Shield className="w-6 h-6" />
      </div>

      <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>

      {destinationMasked ? (
        <p className="text-sm text-slate-600 mb-5">
          We broadcasted a 6-digit verification code to{' '}
          <span className="font-semibold text-slate-900">{destinationMasked}</span>
        </p>
      ) : subtitle ? (
        <p className="text-sm text-slate-600 mb-5">{subtitle}</p>
      ) : (
        <p className="text-sm text-slate-600 mb-5">
          Enter the 6-digit verification code sent to your {channel === 'DUAL' ? 'phone & email' : channel.toLowerCase()}.
        </p>
      )}

      {/* Real Delivery Notification */}
      {isRealDelivered && (
        <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-5 text-left">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>
            <strong>Real physical delivery active:</strong> Passcode dispatched directly to your {channel === 'EMAIL' ? 'Gmail inbox' : channel === 'PHONE' ? 'phone via SMS' : 'phone via SMS and email inbox'}.
          </span>
        </div>
      )}

      {/* If devCode is not yet loaded, show quick Broadcast button */}
      {!devCode && !isRealDelivered && onResend && (
        <div className="p-4 bg-blue-50/80 border border-blue-200/80 rounded-xl mb-5 text-left flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#0B3B82]">Passcode Ready to Broadcast</div>
            <div className="text-[11px] text-slate-600">Click to dispatch the 6-digit verification code:</div>
          </div>
          <button
            type="button"
            onClick={onResend}
            disabled={isLoading}
            className="px-3.5 py-1.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
            <span>{isLoading ? 'Broadcasting...' : 'Broadcast Code'}</span>
          </button>
        </div>
      )}

      {/* Interactive Delivery Preview & Status Banner */}
      {devCode && !isRealDelivered && (
        <div className="space-y-3 mb-5 text-left">
          {/* Dual Channel Switcher Tab if channel === 'DUAL' */}
          {channel === 'DUAL' && (
            <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('SMS')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'SMS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Phone SMS (VOXSHD)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('EMAIL')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'EMAIL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                <span>Gmail Inbox</span>
              </button>
            </div>
          )}

          {/* Simulated Device Message Preview */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-xl p-4 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
            
            {/* Header / Source Indicator */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-700/60 mb-2.5 text-xs text-slate-300">
              <div className="flex items-center gap-1.5 font-medium truncate">
                {(channel === 'EMAIL' || (channel === 'DUAL' && activeTab === 'EMAIL')) ? (
                  <>
                    <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">Gmail Inbox • <span className="text-slate-400">{destinationMasked?.split('&')[0]?.trim() || 'poornachandarpc897@gmail.com'}</span></span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">SMS Push Notification • <span className="text-slate-400">VOXSHD</span></span>
                  </>
                )}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 shrink-0">
                Live Broadcast
              </span>
            </div>

            {/* Message Body Content */}
            <div className="space-y-2">
              <div className="text-xs text-slate-300 leading-relaxed">
                {(channel === 'EMAIL' || (channel === 'DUAL' && activeTab === 'EMAIL')) ? (
                  <div>
                    <div className="font-semibold text-white mb-0.5">Subject: VoxShield AI — Your Security Verification Code</div>
                    <div className="text-slate-400 text-[11px]">Your 6-digit authentication security passcode is:</div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-200">
                    &ldquo;Your VoxShield AI verification code is <strong className="text-white font-mono text-xs tracking-wider">{devCode}</strong>. Expires in 15 minutes. Do not share this code.&rdquo;
                  </div>
                )}
              </div>

              {/* Code Highlight Box */}
              <div className="flex items-center justify-between gap-3 bg-slate-950/70 border border-slate-700/80 rounded-lg p-2.5">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">Passcode</span>
                  <code className="text-xl font-bold tracking-[0.25em] text-emerald-400 font-mono">
                    {devCode}
                  </code>
                  {otpExpiry > 0 ? (
                    <span className={`text-[10px] block mt-0.5 font-mono ${
                      otpExpiry < 120 ? 'text-red-400 animate-pulse' : 'text-slate-400'
                    }`}>
                      Expires in {Math.floor(otpExpiry / 60)}:{String(otpExpiry % 60).padStart(2, '0')}
                    </span>
                  ) : (
                    <span className="text-[10px] text-red-400 block mt-0.5 font-semibold">⚠ EXPIRED — Resend code</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(devCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-600/80 transition-colors"
                    title="Copy code"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAutoFill(devCode)}
                    className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white rounded-md shadow-sm transition-all"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>Auto-Fill</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Real Delivery Setup Accordion */}
          <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
            <button
              type="button"
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="w-full flex items-center justify-between text-left font-bold text-amber-900 hover:text-amber-950 gap-2 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-amber-700" />
                Want real delivery to your physical Mobile Phone & Gmail Inbox?
              </span>
              {showSetupGuide ? <ChevronUp className="w-4 h-4 text-amber-700" /> : <ChevronDown className="w-4 h-4 text-amber-700" />}
            </button>

            {showSetupGuide && (
              <div className="mt-3 pt-3 border-t border-amber-200/80 space-y-3 text-[11px] leading-relaxed text-amber-900">
                <p>
                  A local development server requires Google SMTP credentials and an SMS gateway to deliver directly over physical cellular networks and Google mail servers:
                </p>

                <form onSubmit={handleSaveCredentials} className="space-y-2.5 bg-white p-3 rounded-lg border border-amber-200/60 text-slate-800">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      1. Gmail 16-Char App Password:
                    </label>
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder="e.g. abcd efgh ijkl mnop"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0B3B82] font-mono"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Generate at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium">myaccount.google.com/apppasswords</a>
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      2. Fast2SMS API Key (Instant India SMS):
                    </label>
                    <input
                      type="password"
                      value={fast2smsKey}
                      onChange={(e) => setFast2smsKey(e.target.value)}
                      placeholder="e.g. your_fast2sms_api_key"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0B3B82] font-mono"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Get free instant API key at <a href="https://www.fast2sms.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium">fast2sms.com</a>
                    </span>
                  </div>

                  {configFeedback && (
                    <div className={`p-2 rounded text-[11px] ${configFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                      {configFeedback.message}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={configLoading}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-md shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <Send className="w-3 h-3" />
                    <span>{configLoading ? 'Activating Credentials...' : 'Save & Broadcast to Physical Devices'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6-box OTP Input Grid */}
      <div className="flex justify-center items-center gap-2.5 sm:gap-3 mb-6">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(idx, e)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            disabled={isLoading}
            className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-bold rounded-lg border transition-all duration-150 outline-none
              ${
                error
                  ? 'border-red-500 bg-red-50/20 text-red-900 focus:border-red-600 focus:ring-1 focus:ring-red-500'
                  : digit
                  ? 'border-[#0B3B82] bg-blue-50/30 text-[#0B3B82]'
                  : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 focus:border-[#0B3B82] focus:bg-white focus:ring-2 focus:ring-blue-100'
              }
              ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          />
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-5 text-left">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Banner */}
      {successMessage && (
        <div className="flex items-center gap-2 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg p-3 mb-5 text-left">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Submit Action Button */}
      <button
        type="button"
        disabled={!isFull || isLoading}
        onClick={() => onComplete(digits.join(''))}
        className={`w-full py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2
          ${
            isFull && !isLoading
              ? 'bg-[#0B3B82] hover:bg-[#082F6B] text-white shadow-[0_2px_8px_rgba(11,59,130,0.25)] hover:shadow-[0_4px_12px_rgba(11,59,130,0.3)]'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
          }
        `}
      >
        {isLoading ? (
          <>
            <RotateCw className="w-4 h-4 animate-spin" />
            <span>Validating Code...</span>
          </>
        ) : (
          <>
            <span>{buttonLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Resend Cooldown Countdown */}
      {onResend && (
        <div className="mt-5 pt-5 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-center">
          {timer > 0 ? (
            <span>
              Resend code in <strong className="text-slate-700 font-semibold">{formatTimer(timer)}</strong>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResendClick}
              disabled={isLoading}
              className="text-[#0B3B82] hover:text-[#082F6B] font-semibold hover:underline flex items-center gap-1.5 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Resend verification code</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
