/**
 * VoxShield AI — Centralized API Client
 * Single authentication token strategy, JSON/multipart handling, normalized errors.
 */

import type { UserRole } from '../types/auth';

const API_HOST = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE = `${API_HOST}/api/v1`;

export const ACCESS_TOKEN_KEY = 'voxshield_access_token';
export const USER_KEY = 'voxshield_user';

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem('voxshield_token');
}

export function setSession(token: string, user: any, refreshToken?: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Clean up any legacy keys
  localStorage.removeItem('voxshield_token');
  localStorage.removeItem('voxshield_user_data');
  if (refreshToken) {
    localStorage.setItem('voxshield_refresh_token', refreshToken);
  }
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('voxshield_refresh_token');
  localStorage.removeItem('voxshield_token');
  localStorage.removeItem('voxshield_user_data');
}

export function getStoredUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY) || localStorage.getItem('voxshield_user_data');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function parseApiError(err: any, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === 'string' && err !== '[object Object]') return err;
  if (typeof err.detail === 'string') return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && item.msg) {
          const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : '';
          return field ? `${field}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      })
      .join(', ');
  }
  if (err.detail && typeof err.detail === 'object') {
    return err.detail.message || err.detail.error || err.detail.msg || JSON.stringify(err.detail);
  }
  if (typeof err.error === 'string') return err.error;
  if (err.error && typeof err.error.message === 'string') return err.error.message;
  if (typeof err.message === 'string' && err.message !== '[object Object]') return err.message;
  try {
    const s = JSON.stringify(err);
    return s === '{}' ? fallback : s;
  } catch {
    return fallback;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = parseApiError(err, detail);
    } catch {
      try {
        const text = await res.text();
        if (text) detail = text;
      } catch {}
    }
    if (res.status === 401) {
      // Token might be invalid or expired
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  user: {
    id: string;
    email: string;
    name: string;
    phone?: string | null;
    role: UserRole;
    is_active?: boolean;
    is_verified?: boolean;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await handleResponse<LoginResponse>(res);
  setSession(data.access_token, data.user, data.refresh_token);
  return data;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  consent: boolean;
}

export async function register(payload: RegisterPayload | { name: string; email: string; password: string }): Promise<LoginResponse> {
  const body = {
    name: payload.name,
    email: payload.email,
    password: payload.password,
    phone: 'phone' in payload ? payload.phone : undefined,
    consent: 'consent' in payload ? payload.consent : true,
  };
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await handleResponse<LoginResponse>(res);
  setSession(data.access_token, data.user, data.refresh_token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch {}
  clearSession();
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('voxshield_refresh_token');
  if (!refreshToken) return false;

  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }

  const data = await res.json() as LoginResponse;
  setSession(data.access_token, data.user, data.refresh_token);
  return true;
}

export async function getMe(): Promise<LoginResponse['user']> {
  const res = await fetch(`${BASE}/auth/me`, { headers: authHeaders() });
  return handleResponse<LoginResponse['user']>(res);
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse<{ message: string }>(res);
}

export async function resetPassword(token: string, new_password: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password }),
  });
  return handleResponse<{ message: string }>(res);
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return handleResponse<{ message: string }>(res);
}

// ── Voice ─────────────────────────────────────────────────────────────────────

export async function analyzeVoice(audioBlob: Blob, transcript: string): Promise<any> {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.wav');
  form.append('transcript', transcript);
  const token = getToken();
  const res = await fetch(`${BASE}/voice/analyze`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return handleResponse<any>(res);
}

export async function enrollSample(audioBlob: Blob, sampleIndex: number): Promise<any> {
  const form = new FormData();
  form.append('audio', audioBlob, `sample_${sampleIndex}.wav`);
  form.append('sample_index', String(sampleIndex));
  const token = getToken();
  const res = await fetch(`${BASE}/voice/enroll`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return handleResponse<any>(res);
}

export async function getSpeakerProfile(): Promise<any> {
  const res = await fetch(`${BASE}/voice/profile`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

export async function deleteSpeakerProfile(): Promise<any> {
  const res = await fetch(`${BASE}/voice/profile`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse<any>(res);
}

export async function getVoiceAnalyses(limit = 50): Promise<any> {
  const res = await fetch(`${BASE}/voice/analyses?limit=${limit}`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

export async function getVoiceAnalysis(id: string): Promise<any> {
  const res = await fetch(`${BASE}/voice/analyses/${id}`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

// ── Commands ──────────────────────────────────────────────────────────────────

export async function interpretCommand(transcript: string, analysisId?: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/interpret`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ transcript, analysis_id: analysisId }),
  });
  return handleResponse<any>(res);
}

export async function requestApproval(commandId: string, deviceName: string, approverEmail?: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/request-approval`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ command_id: commandId, device_name: deviceName, approver_email: approverEmail }),
  });
  return handleResponse<any>(res);
}

export async function authorizeCommand(commandId: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/${commandId}/authorize`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse<any>(res);
}

export async function getCommandHistory(limit = 20): Promise<any> {
  const res = await fetch(`${BASE}/commands/history?limit=${limit}`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

// ── Incidents ─────────────────────────────────────────────────────────────────

export async function getIncidents(limit = 50, statusFilter?: string): Promise<any> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (statusFilter) params.append('status_filter', statusFilter);
  const res = await fetch(`${BASE}/incidents?${params}`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

export async function getIncident(id: string): Promise<any> {
  const res = await fetch(`${BASE}/incidents/${id}`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

export async function updateIncident(id: string, patch: { status?: string; analyst_notes?: string }): Promise<any> {
  const res = await fetch(`${BASE}/incidents/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return handleResponse<any>(res);
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalyticsSummary(): Promise<any> {
  const res = await fetch(`${BASE}/analytics/summary`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

export async function getAnalyticsTimeline(days = 7): Promise<any> {
  const res = await fetch(`${BASE}/analytics/timeline?days=${days}`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

// ── Devices ───────────────────────────────────────────────────────────────────

export interface DeviceItem {
  id: string;
  device_id?: string;
  device_name: string;    // Canonical field — backend always returns device_name
  name?: string;
  platform: string;
  agent_version: string;
  status: string;
  is_active: boolean;
  last_seen_at: string | null;
  registered_at: string;
}

export async function getDevices(): Promise<{ devices: DeviceItem[] }> {
  const res = await fetch(`${BASE}/devices`, { headers: authHeaders() });
  return handleResponse<{ devices: DeviceItem[] }>(res);
}

export async function registerDevice(deviceName: string, platform = 'windows', agentVersion = '1.0.0'): Promise<any> {
  const res = await fetch(`${BASE}/devices/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ device_name: deviceName, platform, agent_version: agentVersion }),
  });
  return handleResponse<any>(res);
}

export async function revokeDevice(deviceId: string): Promise<any> {
  const res = await fetch(`${BASE}/devices/${deviceId}/revoke`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse<any>(res);
}

export async function deleteDevice(deviceId: string): Promise<any> {
  const res = await fetch(`${BASE}/devices/${deviceId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse<any>(res);
}

// ── Privacy & Data Export ─────────────────────────────────────────────────────

export async function exportPrivacyData(): Promise<any> {
  const res = await fetch(`${BASE}/privacy/export`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

export async function deleteAnalysisHistory(): Promise<{ message: string; deleted_count: number }> {
  const res = await fetch(`${BASE}/privacy/analyses`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse<{ message: string; deleted_count: number }>(res);
}

// ── Approval & OTP (Phase 3) ──────────────────────────────────────────────────

/** Fetch approval details for the React /approve/:token page — does NOT execute. */
export async function getApprovalDetails(token: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/approval/${token}`);
  return handleResponse<any>(res);
}

/** User explicitly approves after seeing the approval page. */
export async function approveByToken(token: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return handleResponse<any>(res);
}

/** User explicitly rejects after seeing the approval page. */
export async function rejectByToken(token: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return handleResponse<any>(res);
}

/** Request a new OTP for a command. */
export async function requestOTP(commandId: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/request-otp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ command_id: commandId }),
  });
  return handleResponse<any>(res);
}

/** Verify OTP code to approve a command. */
export async function verifyOTP(commandId: string, code: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/verify-otp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ command_id: commandId, code }),
  });
  return handleResponse<any>(res);
}

/** Get single command detail. */
export async function getCommand(commandId: string): Promise<any> {
  const res = await fetch(`${BASE}/commands/${commandId}`, { headers: authHeaders() });
  return handleResponse<any>(res);
}

// ── Admin & Audit ─────────────────────────────────────────────────────────────

export async function getAuditLogs(limit = 100): Promise<{ audit_logs: any[]; total: number }> {
  const res = await fetch(`${BASE}/audit-logs?limit=${limit}`, { headers: authHeaders() });
  return handleResponse<{ audit_logs: any[]; total: number }>(res);
}

export async function getAdminUsers(limit = 100): Promise<{ users: any[]; total: number }> {
  const res = await fetch(`${BASE}/admin/users?limit=${limit}`, { headers: authHeaders() });
  return handleResponse<{ users: any[]; total: number }>(res);
}

// ── System ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<any> {
  const res = await fetch('/health');
  return handleResponse<any>(res);
}

export async function getModelStatus(): Promise<any> {
  const res = await fetch(`${BASE}/model-status`);
  return handleResponse<any>(res);
}

// ── Legacy Phone Verification ──────────────────────────────────────────────────

export async function sendLegacyPhoneOTP(phone?: string): Promise<{
  message: string;
  cooldown_seconds: number;
  demo_mode?: boolean;
  demo_otp?: string;
  demo_code?: string;
  sms_sent?: boolean;
  phone?: string;
}> {
  const res = await fetch(`${BASE}/auth/phone/send-otp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(phone ? { phone } : {}),
  });
  return handleResponse(res);
}

export async function verifyLegacyPhoneOTP(otp: string, phone?: string): Promise<{ message: string; phone_verified: boolean; identity_status: string }> {
  const res = await fetch(`${BASE}/auth/phone/verify-otp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ otp, ...(phone ? { phone } : {}) }),
  });
  return handleResponse(res);
}

export interface IdentityProfileResponse {
  name: string;
  email: string;
  email_verified: boolean;
  phone: string;
  phone_verified: boolean;
  voice_enrolled: boolean;
  voice_samples: number;
  speaker_profile: string;
  consent: boolean;
  identity_status: 'ACTIVE' | 'PENDING' | 'INCOMPLETE';
}

export async function getIdentityProfile(): Promise<IdentityProfileResponse> {
  const res = await fetch(`${BASE}/auth/identity-profile`, { headers: authHeaders() });
  return handleResponse<IdentityProfileResponse>(res);
}

// ── Unified Single-Transaction Voice Processing ───────────────────────────────

export interface ProcessCommandResponse {
  transaction_id?: string;
  correlation_id?: string;
  analysis_id?: string;
  command_id?: string;
  person_detected: {
    user_id?: string;
    name: string;
    speaker_match_score: number;
    speaker_match_pct: number;
    identity_status: string;
    is_authorized: boolean;
    voice_authenticity: string;
    is_deepfake: boolean;
    replay_status: string;
    is_replay: boolean;
    confidence_tier: string;
  };
  audio_quality: {
    snr_db: number;
    is_acceptable: boolean;
  };
  transcript: string;
  intent: string;
  risk_level: string;
  security_policy: string;
  decision: string;
  device_binding: {
    device_id?: string;
    device_name?: string;
    is_online: boolean;
  };
  email_alert_dispatched: boolean;
  message: string;
}

export async function processVoiceCommand(
  audioFile: File,
  deviceName?: string,
  transcript?: string,
): Promise<ProcessCommandResponse> {
  const formData = new FormData();
  // The backend endpoint uses `audio` and accepts the browser transcript as
  // a hint so command interpretation does not depend on server-side Whisper.
  formData.append('audio', audioFile, audioFile.name || 'voice_command.wav');
  if (transcript) formData.append('transcript', transcript);
  if (deviceName) {
    formData.append('device_name', deviceName);
  }

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}/voice/process-command`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const payload = await handleResponse<any>(res);
  return {
    transaction_id: payload.correlation_id,
    correlation_id: payload.correlation_id,
    analysis_id: payload.analysis_id,
    command_id: payload.command?.command_id,
    person_detected: {
      name: payload.person_detected?.name || 'Unknown speaker',
      user_id: payload.person_detected?.user_id,
      speaker_match_score: payload.person_detected?.match_score || 0,
      speaker_match_pct: Math.round((payload.person_detected?.similarity || 0) * 100),
      identity_status: payload.person_detected?.identity_status || 'UNKNOWN',
      is_authorized: Boolean(payload.person_detected?.is_verified),
      voice_authenticity: payload.voice_authenticity?.label || 'UNKNOWN',
      is_deepfake: payload.voice_authenticity?.label === 'SYNTHETIC',
      replay_status: payload.replay_detection?.label || 'UNKNOWN',
      is_replay: !payload.replay_detection?.is_clear,
      confidence_tier: payload.person_detected?.confidence || 'UNKNOWN',
    },
    audio_quality: {
      snr_db: 0,
      is_acceptable: true,
    },
    transcript: payload.command?.transcript || '',
    intent: payload.command?.intent || 'UNKNOWN',
    risk_level: payload.command?.risk || payload.risk?.level || 'UNKNOWN',
    security_policy: payload.security_policy?.verdict || 'UNKNOWN',
    decision: payload.status || payload.command?.status || 'UNKNOWN',
    device_binding: {
      device_id: payload.device?.device_id,
      device_name: payload.device?.device_name,
      is_online: Boolean(payload.device?.is_online),
    },
    email_alert_dispatched: Boolean(payload.email_alert_sent),
    message: payload.command?.rejection_reason || 'Voice command processed.',
  };
}

/** Explicit backend authorization when user clicks CONTINUE TO EXECUTE */
export async function continueCommand(commandId: string, deviceId?: string): Promise<{
  command_id: string;
  status: string;
  intent: string;
  device_name: string;
  is_device_online: boolean;
  message: string;
  expires_at: string;
}> {
  const body = JSON.stringify(deviceId ? { device_id: deviceId } : {});
  let res = await fetch(`${BASE}/commands/${commandId}/continue`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  });

  // Access tokens are short-lived; retry this security checkpoint once using
  // the long-lived refresh token instead of losing the verified command.
  if (res.status === 401 && await refreshAccessToken()) {
    res = await fetch(`${BASE}/commands/${commandId}/continue`, {
      method: 'POST',
      headers: authHeaders(),
      body,
    });
  }

  return handleResponse(res);
}

/** Cancel a waiting or pending command */
export async function cancelCommand(commandId: string): Promise<{
  command_id: string;
  status: string;
  message: string;
}> {
  const res = await fetch(`${BASE}/commands/${commandId}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Email Verification & Voice Privacy Lifecycle ──────────────────────────────

export async function sendVerificationEmail(email?: string): Promise<{
  message: string;
  email: string;
  demo_token?: string;
  verify_url?: string;
  email_sent: boolean;
  cooldown_seconds?: number;
}> {
  const res = await fetch(`${BASE}/auth/send-verification-email`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { email } : {}),
  });
  return handleResponse(res);
}

export async function verifyEmailToken(token: string): Promise<{
  message: string;
  is_verified: boolean;
  identity_status: string;
}> {
  const res = await fetch(`${BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return handleResponse(res);
}

export async function deleteVoiceProfile(): Promise<{
  message: string;
  profile_id: string;
  identity_status: string;
}> {
  const res = await fetch(`${BASE}/voice/profile`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function resetVoiceProfile(): Promise<{
  message: string;
  identity_status: string;
}> {
  const res = await fetch(`${BASE}/voice/profile/reset`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Real OTP Service Endpoints ────────────────────────────────────────────────

export interface OTPResponse {
  success: boolean;
  message: string;
  channel?: string;
  destination?: string;
  masked_destination?: string;
  purpose?: string;
  expires_in?: number;
  cooldown_seconds?: number;
  provider_status?: string;
  real_delivery?: boolean;
  dev_otp?: string;
  demo_code?: string;
  demo_otp?: string;
  delivery_guide?: string;
}

export interface LoginOTPRequestResponse {
  success: boolean;
  message: string;
  otp_requested: boolean;
  masked_destination?: string;
  expires_in?: number;
  provider_status?: string;
  real_delivery?: boolean;
  dev_otp?: string;
  demo_code?: string;
  demo_otp?: string;
  delivery_guide?: string;
}

export interface OTPVerifyResponse {
  success: boolean;
  message: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  identity_status?: string;
  purpose?: string;
}

export interface VerificationStatus {
  email: string;
  email_verified: boolean;
  email_verified_at: string | null;
  phone: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  voice_enrolled: boolean;
  voice_samples: number;
  trusted_devices_count: number;
  identity_status: string;
  last_login_at: string | null;
}

export async function sendEmailOTP(email?: string, purpose = 'REGISTRATION'): Promise<OTPResponse> {
  const res = await fetch(`${BASE}/auth/send-email-otp`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, purpose }),
  });
  return handleResponse(res);
}

export async function verifyEmailOTP(otp: string, email?: string, purpose = 'REGISTRATION'): Promise<OTPVerifyResponse> {
  const res = await fetch(`${BASE}/auth/verify-email-otp`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, email, purpose }),
  });
  return handleResponse(res);
}

export async function sendPhoneOTP(phone?: string, email?: string, purpose = 'REGISTRATION'): Promise<OTPResponse> {
  const res = await fetch(`${BASE}/auth/send-phone-otp`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, email, purpose }),
  });
  return handleResponse(res);
}

export async function verifyPhoneOTP(otp: string, phone?: string, email?: string, purpose = 'REGISTRATION'): Promise<OTPVerifyResponse> {
  const res = await fetch(`${BASE}/auth/verify-phone-otp`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp, phone, email, purpose }),
  });
  return handleResponse(res);
}

export async function resendEmailOTP(email?: string, purpose = 'REGISTRATION'): Promise<OTPResponse> {
  const res = await fetch(`${BASE}/auth/resend-email-otp`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, purpose }),
  });
  return handleResponse(res);
}

export async function resendPhoneOTP(phone?: string, email?: string, purpose = 'REGISTRATION'): Promise<OTPResponse> {
  const res = await fetch(`${BASE}/auth/resend-phone-otp`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, email, purpose }),
  });
  return handleResponse(res);
}

export async function getVerificationStatus(): Promise<VerificationStatus> {
  const res = await fetch(`${BASE}/auth/verification-status`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// ── Dual-Channel Broadcast (SMS + Email Concurrent) ─────────────────────────
export interface DualOTPResponse extends OTPResponse {
  email?: string;
  phone?: string;
  masked_email?: string;
  masked_phone?: string;
  sms_sent?: boolean;
  email_sent?: boolean;
}

export async function sendDualOTP(email: string, phone: string, purpose = 'REGISTRATION'): Promise<DualOTPResponse> {
  const res = await fetch('/api/send-dual-otp', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phoneNumber: phone, phone, purpose }),
  });
  return handleResponse(res);
}

export async function verifyDualOTP(email: string, code: string, purpose = 'REGISTRATION'): Promise<OTPVerifyResponse> {
  const res = await fetch('/api/verify-otp', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, userInputCode: code, otp: code, purpose }),
  });
  return handleResponse(res);
}

export interface ConfigureCredentialsPayload {
  smtp_password?: string;
  smtp_user?: string;
  fast2sms_api_key?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_from_phone?: string;
}

export async function configureCredentials(payload: ConfigureCredentialsPayload): Promise<{
  success: boolean;
  message: string;
  smtp_configured: boolean;
  sms_configured: boolean;
}> {
  const res = await fetch('/api/configure-credentials', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function loginRequestPhoneOTP(phone: string): Promise<LoginOTPRequestResponse> {
  const res = await fetch(`${BASE}/auth/login/request-phone-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return handleResponse(res);
}

export async function loginVerifyPhoneOTP(phone: string, otp: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/login/verify-phone-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp }),
  });
  const data = await handleResponse<LoginResponse>(res);
  setSession(data.access_token, data.user, data.refresh_token);
  return data;
}

export async function loginRequestEmailOTP(email: string): Promise<LoginOTPRequestResponse> {
  const res = await fetch(`${BASE}/auth/login/request-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse(res);
}

export async function loginVerifyEmailOTP(email: string, otp: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/login/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  const data = await handleResponse<LoginResponse>(res);
  setSession(data.access_token, data.user, data.refresh_token);
  return data;
}
