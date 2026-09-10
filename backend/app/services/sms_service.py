"""
SMS & Phone Verification Service for VoxShield AI.
Modular provider abstraction supporting:
- Twilio (Global)
- MSG91 (India)
- Exotel (India)
- Fast2SMS (India fallback)

Strictly relies on environment variables (.env). Never hardcodes API keys.
Truthfully returns False if provider delivery fails or is unconfigured.
"""
import abc
import logging
from typing import Optional
import httpx

from app.config import get_settings
from app.services.otp_service import normalize_phone_number, MAX_OTP_ATTEMPTS as MAX_PHONE_OTP_ATTEMPTS

logger = logging.getLogger(__name__)

SECURITY_SMS_MESSAGE = (
    "Your VoxShield AI verification code is {otp_code}. "
    "It expires in 5 minutes. Do not share this code with anyone."
)


def generate_phone_otp():
    """Backward compatibility helper generating (raw_code, hash, expires_at)."""
    from datetime import datetime, timezone, timedelta
    import hashlib
    from app.services.otp_service import generate_otp_code
    raw = generate_otp_code()
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    return raw, h, exp


class SMSProvider(abc.ABC):
    @abc.abstractmethod
    def send_sms(self, to_phone: str, message: str, otp_code: str) -> bool:
        """Dispatch SMS. Return True on successful provider submission."""
        pass

    @abc.abstractmethod
    def is_configured(self) -> bool:
        """Return True if credentials are fully configured."""
        pass


class TwilioSMSProvider(SMSProvider):
    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self.account_sid = (account_sid or "").strip()
        self.auth_token = (auth_token or "").strip()
        self.from_number = (from_number or "").strip()

    def is_configured(self) -> bool:
        return bool(
            self.account_sid
            and self.auth_token
            and self.from_number
            and not self.account_sid.startswith("INSECURE")
        )

    def send_sms(self, to_phone: str, message: str, otp_code: str) -> bool:
        if not self.is_configured():
            logger.warning("Twilio SMS provider is not configured (missing TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER).")
            return False

        try:
            from twilio.rest import Client
            client = Client(self.account_sid, self.auth_token)
            msg = client.messages.create(
                body=message,
                from_=self.from_number,
                to=to_phone,
            )
            logger.info("SMS successfully dispatched via Twilio to %s (SID: %s)", to_phone, msg.sid)
            return True
        except Exception as exc:
            logger.error("Twilio SMS dispatch failed to %s: %s", to_phone, exc)
            return False


class MSG91SMSProvider(SMSProvider):
    """India-focused enterprise SMS provider."""
    def __init__(self, auth_key: str, sender_id: str, template_id: str = ""):
        self.auth_key = (auth_key or "").strip()
        self.sender_id = (sender_id or "VOXSHD").strip()
        self.template_id = (template_id or "").strip()

    def is_configured(self) -> bool:
        return bool(self.auth_key and not self.auth_key.startswith("INSECURE"))

    def send_sms(self, to_phone: str, message: str, otp_code: str) -> bool:
        if not self.is_configured():
            logger.warning("MSG91 provider is not configured (missing MSG91_AUTH_KEY).")
            return False

        clean_mobile = to_phone.replace("+", "")
        headers = {
            "authkey": self.auth_key,
            "content-type": "application/json",
        }
        try:
            if self.template_id:
                # MSG91 DLT Flow Template API
                payload = {
                    "template_id": self.template_id,
                    "short_url": "0",
                    "recipients": [
                        {
                            "mobiles": clean_mobile,
                            "otp": otp_code,
                        }
                    ],
                }
                url = "https://control.msg91.com/api/v5/flow/"
            else:
                # Direct OTP API
                url = f"https://control.msg91.com/api/v5/otp?template_id={self.template_id}&mobile={clean_mobile}&authkey={self.auth_key}&otp={otp_code}"
                payload = None

            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, json=payload, headers=headers) if payload else client.post(url, headers=headers)
                data = resp.json()
                if resp.status_code == 200 and data.get("type") == "success":
                    logger.info("MSG91 OTP dispatched to %s: %s", to_phone, data.get("message"))
                    return True
                else:
                    logger.error("MSG91 response error: %s", data)
                    return False
        except Exception as exc:
            logger.error("MSG91 dispatch exception: %s", exc)
            return False


class ExotelSMSProvider(SMSProvider):
    """India-focused cloud telephony & SMS provider."""
    def __init__(self, account_sid: str, api_key: str, api_token: str, subdomain: str = "api.exotel.com"):
        self.account_sid = (account_sid or "").strip()
        self.api_key = (api_key or "").strip()
        self.api_token = (api_token or "").strip()
        self.subdomain = (subdomain or "api.exotel.com").strip()

    def is_configured(self) -> bool:
        return bool(self.account_sid and self.api_key and self.api_token)

    def send_sms(self, to_phone: str, message: str, otp_code: str) -> bool:
        if not self.is_configured():
            logger.warning("Exotel provider is not configured (missing EXOTEL_ACCOUNT_SID/API_KEY/API_TOKEN).")
            return False

        url = f"https://{self.subdomain}/v1/Accounts/{self.account_sid}/Sms/send.json"
        clean_to = to_phone.replace("+", "")
        data = {
            "From": "VOXSHD",
            "To": clean_to,
            "Body": message,
        }
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, data=data, auth=(self.api_key, self.api_token))
                if resp.status_code in (200, 201):
                    logger.info("Exotel SMS dispatched to %s", to_phone)
                    return True
                else:
                    logger.error("Exotel SMS error (%d): %s", resp.status_code, resp.text)
                    return False
        except Exception as exc:
            logger.error("Exotel dispatch exception: %s", exc)
            return False


class Fast2SMSProvider(SMSProvider):
    """India national route fallback provider."""
    def __init__(self, api_key: str):
        self.api_key = (api_key or "").strip()

    def is_configured(self) -> bool:
        return bool(self.api_key and not self.api_key.startswith("INSECURE"))

    def send_sms(self, to_phone: str, message: str, otp_code: str) -> bool:
        if not self.is_configured():
            return False

        # National 10-digit format
        digits = "".join(filter(str.isdigit, to_phone))
        national = digits[-10:] if len(digits) >= 10 else digits
        headers = {
            "authorization": self.api_key,
            "Content-Type": "application/json",
        }
        body = {
            "variables_values": otp_code,
            "route": "otp",
            "numbers": national,
        }
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post("https://www.fast2sms.com/dev/bulkV2", json=body, headers=headers)
                data = resp.json()
                if resp.status_code == 200 and data.get("return") is True:
                    logger.info("Fast2SMS OTP successfully dispatched to %s", national)
                    return True
                return False
        except Exception as exc:
            logger.warning("Fast2SMS dispatch failed: %s", exc)
            return False


def get_sms_provider() -> SMSProvider:
    """Factory selecting the SMS provider configured in environment."""
    settings = get_settings()
    name = (settings.sms_provider or "").lower().strip()

    # If Fast2SMS key is present and provider is fast2sms or unset/default
    if name == "fast2sms" or (settings.fast2sms_api_key and not settings.twilio_account_sid):
        return Fast2SMSProvider(api_key=settings.fast2sms_api_key)
    elif name == "msg91" or (settings.msg91_auth_key and not settings.twilio_account_sid):
        return MSG91SMSProvider(
            auth_key=settings.msg91_auth_key,
            sender_id=settings.msg91_sender_id,
            template_id=settings.msg91_template_id,
        )
    elif name == "exotel" or (settings.exotel_account_sid and not settings.twilio_account_sid):
        return ExotelSMSProvider(
            account_sid=settings.exotel_account_sid,
            api_key=settings.exotel_api_key,
            api_token=settings.exotel_api_token,
            subdomain=settings.exotel_subdomain,
        )
    else:
        # Default / Twilio
        from_phone = settings.twilio_phone_number or settings.twilio_from_phone
        return TwilioSMSProvider(
            account_sid=settings.twilio_account_sid,
            auth_token=settings.twilio_auth_token,
            from_number=from_phone,
        )


def send_phone_otp_sms(
    phone: str,
    otp_code: str,
    user_name: str = "User",
) -> tuple[bool, str]:
    """
    Send real security OTP SMS using configured provider.
    Returns: (success: bool, status_message: str)
    NOTE: Does NOT return or expose the OTP in status_message.
    """
    from app.services.otp_service import normalize_phone_number
    try:
        e164_phone = normalize_phone_number(phone)
    except Exception as exc:
        return False, str(exc)

    provider = get_sms_provider()
    message = SECURITY_SMS_MESSAGE.format(otp_code=otp_code)

    if provider.is_configured():
        success = provider.send_sms(to_phone=e164_phone, message=message, otp_code=otp_code)
        if success:
            return True, "SMS verification code sent successfully."
        else:
            return False, "PHONE_OTP_DELIVERY_FAILED: SMS gateway rejected the dispatch."

    # Secondary check: Fast2SMS if primary Twilio/MSG91 not configured but Fast2SMS is
    fast2sms = Fast2SMSProvider(get_settings().fast2sms_api_key)
    if fast2sms.is_configured():
        success = fast2sms.send_sms(to_phone=e164_phone, message=message, otp_code=otp_code)
        if success:
            return True, "SMS verification code sent successfully via Fast2SMS."

    # Provider is unconfigured in development/test environment
    settings = get_settings()
    if settings.is_development:
        banner = f"""
+----------------------------------------------------------------------+
|                VOXSHIELD AI -- PHONE VERIFICATION SMS                |
+----------------------------------------------------------------------+
| Recipient: {e164_phone:<57} |
| Name:      {user_name:<57} |
| Code:      {otp_code:<57} |
| Status:    OTP_PROVIDER_UNAVAILABLE (Set TWILIO/MSG91 in .env)       |
+----------------------------------------------------------------------+
"""
        print(banner, flush=True)
        logger.info("Dev fallback: Phone OTP code for %s logged to console", e164_phone)
        return False, "OTP_PROVIDER_UNAVAILABLE: SMS gateway credentials not configured in environment."

    return False, "PHONE_OTP_DELIVERY_FAILED: SMS service provider is unconfigured."
