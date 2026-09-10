"""
Email Service — Enterprise Email Provider Abstraction for VoxShield AI.
Modular providers supported:
- SMTP (Standard / SendGrid / AWS SES / Postmark via SMTP)
- Resend (Modern transactional API)

Gracefully logs to console in development mode when unconfigured.
Truthfully returns False if provider delivery fails or is unconfigured.
Never exposes credentials or sends plaintext secrets to frontend.
"""
import abc
import logging
import secrets
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


def generate_approval_token() -> str:
    """Generate a cryptographically secure 32-byte approval token."""
    return secrets.token_urlsafe(32)


# =============================================================================
# Provider Abstraction
# =============================================================================

class EmailProvider(abc.ABC):
    @abc.abstractmethod
    def is_configured(self) -> bool:
        """Return True if credentials are fully configured."""
        pass

    @abc.abstractmethod
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        """Send an email. Return True on successful delivery."""
        pass


class SMTPEmailProvider(EmailProvider):
    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        from_email: str,
        from_name: str = "VoxShield AI Security",
        tls: bool = True,
        ssl: bool = False,
    ):
        self.host = (host or "").strip()
        self.port = port or 587
        self.username = (username or "").strip()
        self.password = (password or "").strip()
        self.from_email = (from_email or username or "").strip()
        self.from_name = (from_name or "VoxShield AI Security").strip()
        self.tls = tls
        self.ssl = ssl

    def is_configured(self) -> bool:
        return bool(self.host and self.username and self.password and not self.host.startswith("INSECURE"))

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        if not self.is_configured():
            logger.warning("[SMTP NOT CONFIGURED] Host or username not set.")
            return False

        sender_header = f"{self.from_name} <{self.from_email}>" if self.from_name else self.from_email

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = sender_header
            msg["To"] = to_email

            if text_body:
                msg.attach(MIMEText(text_body, "plain", "utf-8"))
            if html_body:
                msg.attach(MIMEText(html_body, "html", "utf-8"))

            if self.ssl or self.port == 465:
                with smtplib.SMTP_SSL(self.host, self.port, timeout=12) as server:
                    server.ehlo()
                    if self.username and self.password:
                        server.login(self.username, self.password)
                    server.sendmail(self.from_email, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(self.host, self.port, timeout=12) as server:
                    server.ehlo()
                    if self.tls:
                        server.starttls()
                        server.ehlo()
                    if self.username and self.password:
                        server.login(self.username, self.password)
                    server.sendmail(self.from_email, [to_email], msg.as_string())

            logger.info("Email successfully sent via SMTP (%s) to %s", self.host, to_email)
            return True

        except Exception as exc:
            logger.error("SMTP dispatch failed to %s: %s", to_email, exc)
            return False


class ResendEmailProvider(EmailProvider):
    def __init__(self, api_key: str, from_email: str):
        self.api_key = (api_key or "").strip()
        self.from_email = (from_email or "onboarding@resend.dev").strip()

    def is_configured(self) -> bool:
        return bool(self.api_key and not self.api_key.startswith("INSECURE"))

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        if not self.is_configured():
            logger.warning("[RESEND NOT CONFIGURED] RESEND_API_KEY missing.")
            return False

        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "from": self.from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
                "text": text_body,
            }
            with httpx.Client(timeout=10.0) as client:
                res = client.post("https://api.resend.com/emails", json=payload, headers=headers)
                if res.status_code in (200, 201):
                    logger.info("Email successfully dispatched via Resend to %s", to_email)
                    return True
                else:
                    logger.error("Resend API error (%s): %s", res.status_code, res.text)
                    return False
        except Exception as exc:
            logger.error("Resend dispatch exception to %s: %s", to_email, exc)
            return False


def get_email_provider() -> EmailProvider:
    """Instantiate the configured email provider from environment settings."""
    settings = get_settings()
    provider_name = (getattr(settings, "email_provider", "smtp") or "smtp").lower()

    if provider_name == "resend" or (getattr(settings, "resend_api_key", None) and not getattr(settings, "smtp_password", None)):
        return ResendEmailProvider(
            api_key=settings.resend_api_key,
            from_email=settings.resend_from_email or settings.smtp_from or "onboarding@resend.dev",
        )

    # Default to SMTP
    user = settings.smtp_username or settings.smtp_user
    from_addr = settings.smtp_from_email or settings.smtp_from or user
    return SMTPEmailProvider(
        host=settings.smtp_host,
        port=settings.smtp_port,
        username=user,
        password=settings.smtp_password,
        from_email=from_addr,
        from_name=settings.smtp_from_name or "VoxShield AI Security",
        tls=getattr(settings, "smtp_tls", True),
        ssl=getattr(settings, "smtp_ssl", False),
    )


# =============================================================================
# High-Level Email Dispatch Functions
# =============================================================================

def send_account_otp_email(
    to_email: str,
    otp_code: str,
    user_name: str = "User",
    purpose: str = "REGISTRATION",
    expires_minutes: int = 5,
) -> bool:
    """
    Send standardized VoxShield AI verification code email.
    Matches Section 11 specifications:
    - Subject: VoxShield AI — Your Verification Code
    - Purpose-tailored description
    - Cryptographically formatted 6-digit box
    - Anti-phishing security advisory
    """
    settings = get_settings()
    provider = get_email_provider()

    purpose_display = {
        "REGISTRATION": "Verify your account",
        "LOGIN": "Authorize your login",
        "PASSWORD_RESET": "Reset your password",
        "SENSITIVE_ACTION": "Confirm sensitive security action",
        "COMMAND_APPROVAL": "Authorize high-risk voice command",
    }.get(purpose, "Verify your account")

    subject = "VoxShield AI — Your Verification Code"

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #0F172A; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);">
    
    <!-- Header -->
    <div style="padding: 28px 32px 24px; border-bottom: 1px solid #F1F5F9; text-align: left;">
      <div style="display: inline-block; background-color: #0B3B82; color: #FFFFFF; font-weight: 700; font-size: 13px; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px; margin-bottom: 12px;">
        VOXSHIELD AI
      </div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #0F172A; letter-spacing: -0.3px;">
        {purpose_display}
      </h1>
      <p style="margin: 6px 0 0; font-size: 13px; color: #64748B;">
        Real-time Voice Identity &amp; Anti-Impersonation Platform
      </p>
    </div>

    <!-- Body Content -->
    <div style="padding: 32px; text-align: center;">
      <p style="margin: 0 0 8px; color: #475569; font-size: 14px; text-align: left;">Hello {user_name},</p>
      <p style="margin: 0 0 28px; color: #475569; font-size: 14px; line-height: 1.6; text-align: left;">
        Your verification code is:
      </p>

      <!-- 6-digit Code Display Box -->
      <div style="background-color: #F8FAFC; border: 1.5px solid #0B3B82; border-radius: 10px; padding: 20px; margin: 0 auto 28px; display: inline-block; min-width: 240px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; color: #0B3B82; letter-spacing: 10px; display: block; margin-right: -10px;">
          {otp_code}
        </span>
      </div>

      <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; text-align: left;">
        <p style="margin: 0; font-size: 13px; color: #1E40AF; font-weight: 600;">
          ⏱️ This code expires in {expires_minutes} minutes.
        </p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #3B82F6;">
          Never share this code with anyone. VoxShield AI support will never ask for your verification code.
        </p>
      </div>

      <p style="margin: 0; color: #64748B; font-size: 12px; line-height: 1.5; text-align: left;">
        If you did not request this code, you can safely ignore this email. Your account remains protected.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 32px; text-align: left;">
      <p style="margin: 0; font-size: 12px; font-weight: 600; color: #0F172A;">
        Security Team
      </p>
      <p style="margin: 2px 0 0; font-size: 12px; color: #64748B;">
        VoxShield AI Identity &amp; Command Protection
      </p>
    </div>

  </div>
</body>
</html>"""

    text_body = f"""VoxShield AI

{purpose_display}

Hello {user_name},

Your verification code is:

{otp_code}

This code expires in {expires_minutes} minutes.

Never share this code with anyone.

If you did not request this code, you can safely ignore this email.

Security Team
VoxShield AI
"""

    if not provider.is_configured():
        if settings.is_development:
            dev_box = f"""
+------------------------------------------------------------------------------+
|                     VOXSHIELD AI -- EMAIL OTP DISPATCH                       |
+------------------------------------------------------------------------------+
| Recipient: {to_email:<65} |
| Code:      {otp_code:<65} |
| Purpose:   {purpose:<65} |
| Status:    OTP_PROVIDER_UNAVAILABLE (DEVELOPMENT ONLY)                       |
| Note:      Set SMTP_PASSWORD (Gmail App Password) in backend/.env for inbox. |
+------------------------------------------------------------------------------+
"""
            logger.info(dev_box)
            try:
                print(dev_box, flush=True)
            except Exception:
                pass
            return False
        logger.warning("Email provider not configured. OTP email cannot be dispatched.")
        return False

    return provider.send_email(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


# =============================================================================
# Command & Approval Emails (Backward-Compatible)
# =============================================================================

def send_approval_email(
    to_email: str,
    user_name: str,
    command_description: str,
    command_risk: str,
    device_name: str,
    approve_url: str,
    reject_url: str,
    expires_at: datetime,
) -> bool:
    """Send command approval email with approve/reject action links."""
    provider = get_email_provider()
    subject = "[VoxShield] Action Required: Voice Command Approval"

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #FFFFFF; color: #0F172A; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(15,23,42,0.06);">
    <div style="background: #0B3B82; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #FFFFFF;">VOXSHIELD AI</h1>
      <p style="margin: 2px 0 0; font-size: 12px; color: #93C5FD; letter-spacing: 1px;">SECURITY APPROVAL REQUIRED</p>
    </div>
    <div style="padding: 28px 32px;">
      <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">Hello {user_name},</p>
      <p style="margin: 0 0 20px; color: #0F172A; font-size: 14px; line-height: 1.6;">
        A high-risk voice command was received and requires authorization before execution on your registered device.
      </p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid {'#B91C1C' if command_risk in ('HIGH', 'CRITICAL') else '#B45309'}; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="color: #64748B; font-size: 12px; padding: 4px 0;">Command:</td><td style="color: #0F172A; font-weight: 600; font-size: 14px; padding: 4px 0;">{command_description}</td></tr>
          <tr><td style="color: #64748B; font-size: 12px; padding: 4px 0;">Risk Level:</td><td style="color: {'#B91C1C' if command_risk in ('HIGH', 'CRITICAL') else '#B45309'}; font-weight: 700; font-size: 14px; padding: 4px 0;">{command_risk}</td></tr>
          <tr><td style="color: #64748B; font-size: 12px; padding: 4px 0;">Device:</td><td style="color: #0F172A; font-size: 14px; padding: 4px 0;">{device_name}</td></tr>
          <tr><td style="color: #64748B; font-size: 12px; padding: 4px 0;">Expires:</td><td style="color: #0F172A; font-size: 13px; padding: 4px 0;">{expires_at.strftime('%Y-%m-%d %H:%M UTC')}</td></tr>
        </table>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap;">
        <a href="{approve_url}" style="display: inline-block; background: #0B3B82; color: #FFFFFF; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none;">✓ APPROVE &amp; EXECUTE</a>
        <a href="{reject_url}" style="display: inline-block; background: #FFFFFF; color: #B91C1C; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; border: 1px solid #B91C1C;">✗ REJECT</a>
      </div>
    </div>
  </div>
</body>
</html>"""

    text_body = f"""VOXSHIELD SECURITY APPROVAL
Command: {command_description}
Risk: {command_risk}
Device: {device_name}
Approve: {approve_url}
Reject: {reject_url}
"""
    if not provider.is_configured():
        return False
    return provider.send_email(to_email, subject, html_body, text_body)


def send_otp_email(
    to_email: str,
    user_name: str,
    otp_code: str,
    command_intent: str,
    expires_minutes: int = 5,
) -> bool:
    """Send OTP code for secondary command verification."""
    return send_account_otp_email(
        to_email=to_email,
        otp_code=otp_code,
        user_name=user_name,
        purpose="COMMAND_APPROVAL",
        expires_minutes=expires_minutes,
    )


def send_command_detected_alert(
    to_email: str,
    person_name: str,
    command_intent: str,
    command_description: str,
    speaker_verification: str,
    speaker_score: float,
    voice_authenticity: str,
    replay_status: str,
    risk_level: str,
    device_name: str,
    status_label: str = "WAITING FOR CONTINUE",
) -> bool:
    """Alert email when voice command is detected."""
    provider = get_email_provider()
    subject = f"VoxShield AI — Voice Command Detected: {command_description or command_intent}"

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #FFFFFF; color: #0F172A; margin: 0; padding: 20px;">
  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(15,23,42,0.06);">
    <div style="background: #0B3B82; padding: 20px 28px;">
      <h2 style="margin: 0; font-size: 17px; color: #FFFFFF;">🛡️ VOXSHIELD AI SECURITY ALERT</h2>
      <p style="margin: 4px 0 0; font-size: 12px; color: #93C5FD;">REAL-TIME VOICE COMMAND DETECTED</p>
    </div>
    <div style="padding: 24px 28px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">A voice command was detected and processed by the VoxShield security pipeline.</p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr><td style="color: #64748B; padding: 4px 0;">Person Detected:</td><td style="font-weight: 600; color: #0F172A;">{person_name}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Command:</td><td style="font-weight: 600; color: #0B3B82;">{command_description or command_intent}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Speaker Match:</td><td style="color: #0F172A;">{speaker_verification} ({speaker_score:.1f}%)</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Voice Authenticity:</td><td style="color: #0F172A;">{voice_authenticity}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Replay Check:</td><td style="color: #0F172A;">{replay_status}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Risk Level:</td><td style="color: {'#B91C1C' if risk_level in ('HIGH','CRITICAL') else '#15803D'}; font-weight: 700;">{risk_level}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Bound Laptop:</td><td style="color: #0F172A;">{device_name}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Status:</td><td style="color: #B45309; font-weight: 700;">{status_label}</td></tr>
        </table>
      </div>
      <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <p style="margin: 0; font-size: 13px; color: #1E40AF; font-weight: 600;">⚠️ The command has NOT been executed yet.</p>
        <p style="margin: 6px 0 0; font-size: 12px; color: #3B82F6;">Open VoxShield on your authorized laptop ({device_name}) and press <strong>CONTINUE</strong> to execute.</p>
      </div>
    </div>
  </div>
</body>
</html>"""

    banner = f"""
+----------------------------------------------------------------------+
|                VOXSHIELD AI -- VOICE COMMAND DETECTED                |
+----------------------------------------------------------------------+
| Recipient: {to_email:<57} |
| Person:    {person_name:<57} |
| Command:   {command_intent:<57} |
| Match:     {speaker_verification} ({speaker_score:.1f}%)                                    |
| Authentic: {voice_authenticity:<57} |
| Risk:      {risk_level:<57} |
| Laptop:    {device_name:<57} |
| Status:    {status_label:<57} |
| Note:      Command will NOT execute until CONTINUE is clicked.      |
+----------------------------------------------------------------------+
"""
    logger.info(banner)
    try:
        print(banner, flush=True)
    except Exception:
        pass

    if not provider.is_configured():
        return False
    return provider.send_email(to_email, subject, html_body, f"VoxShield Voice Command: {command_intent} on {device_name}")


def send_execution_result_email(
    to_email: str,
    person_name: str,
    command_intent: str,
    command_description: str,
    device_name: str,
    success: bool,
    result_message: str,
    executed_at: datetime,
) -> bool:
    """Confirmation email sent after laptop execution completes."""
    provider = get_email_provider()
    status_str = "EXECUTED" if success else "FAILED"
    subject = f"VoxShield AI — Command Execution Result: {status_str}"

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #FFFFFF; color: #0F172A; margin: 0; padding: 20px;">
  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(15,23,42,0.06);">
    <div style="background: {'#15803D' if success else '#B91C1C'}; padding: 20px 28px;">
      <h2 style="margin: 0; font-size: 17px; color: #FFFFFF;">
        {'✓ COMMAND EXECUTED SUCCESSFULLY' if success else '✗ COMMAND EXECUTION FAILED'}
      </h2>
      <p style="margin: 4px 0 0; font-size: 12px; color: #FFFFFF; opacity: 0.9;">VOXSHIELD EXECUTION CONFIRMATION</p>
    </div>
    <div style="padding: 24px 28px;">
      <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">
        The requested voice action has completed on your authorized laptop.
      </p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr><td style="color: #64748B; padding: 4px 0;">Command:</td><td style="font-weight: 600; color: #0F172A;">{command_description or command_intent}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Device:</td><td style="color: #0F172A;">{device_name}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Status:</td><td style="color: {'#15803D' if success else '#B91C1C'}; font-weight: 700;">{status_str}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Time:</td><td style="color: #0F172A;">{executed_at.strftime('%I:%M %p UTC')}</td></tr>
          <tr><td style="color: #64748B; padding: 4px 0;">Result:</td><td style="color: #475569;">{result_message}</td></tr>
        </table>
      </div>
    </div>
  </div>
</body>
</html>"""

    banner = f"""
+----------------------------------------------------------------------+
|              VOXSHIELD AI -- COMMAND EXECUTION {status_str:<22} |
+----------------------------------------------------------------------+
| Recipient: {to_email:<57} |
| Person:    {person_name:<57} |
| Command:   {command_intent:<57} |
| Result:    {status_str:<57} |
| Detail:    {result_message:<57} |
| Device:    {device_name:<57} |
| Time:      {executed_at.strftime('%Y-%m-%d %H:%M:%S UTC'):<57} |
+----------------------------------------------------------------------+
"""
    logger.info(banner)
    try:
        print(banner, flush=True)
    except Exception:
        pass

    if not provider.is_configured():
        return False
    return provider.send_email(to_email, subject, html_body, f"Command {command_intent} result: {status_str}")


def send_verification_email(
    to_email: str,
    verify_url: str,
    user_name: str = "User",
    token: str = "",
) -> bool:
    """Send email verification token and activation link."""
    provider = get_email_provider()
    subject = "VoxShield AI — Verify Your Email Address"

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #FFFFFF; color: #0F172A; margin: 0; padding: 20px;">
  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(15,23,42,0.06);">
    <div style="background: #0B3B82; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #FFFFFF;">VOXSHIELD AI</h1>
      <p style="margin: 4px 0 0; font-size: 12px; color: #93C5FD; letter-spacing: 1px;">IDENTITY ONBOARDING VERIFICATION</p>
    </div>
    <div style="padding: 28px 32px;">
      <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">Hello {user_name},</p>
      <p style="margin: 0 0 20px; color: #64748B; font-size: 13px; line-height: 1.6;">
        Welcome to VoxShield AI. Please verify your email address to activate your cryptographic voice identity profile.
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="{verify_url}" style="display: inline-block; background: #0B3B82; color: #FFFFFF; font-weight: 700; font-size: 14px; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
          ✓ Verify Email Address
        </a>
      </div>
    </div>
  </div>
</body>
</html>"""

    if not provider.is_configured():
        return False
    return provider.send_email(to_email, subject, html_body, f"Verify VoxShield account: {verify_url}")
