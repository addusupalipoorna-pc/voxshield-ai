"""
VoxShield AI Backend — Application Settings
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    app_env: str = "development"
    app_version: str = "0.3.0"

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = "sqlite:///./voxshield_dev.db"

    # ── Security ─────────────────────────────────────────────────────────────
    secret_key: str = "INSECURE-CHANGE-ME"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    approval_secret: str = "INSECURE-APPROVAL-SECRET"
    approval_token_expire_minutes: int = 15
    agent_api_token: str = "INSECURE-AGENT-TOKEN"
    agent_auth_mode: str = "device"
    email_verification_mode: str = "console"
    openai_api_key: str = ""
    otp_expire_minutes: int = 5

    # ── CORS ─────────────────────────────────────────────────────────────────
    backend_cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]

    # ── Email Delivery (SMTP & Resend) ───────────────────────────────────────
    email_provider: str = "smtp"  # "smtp" | "resend"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_username: str = ""  # alias
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_from_email: str = ""  # alias
    smtp_from_name: str = "VoxShield AI Security"
    smtp_tls: bool = True
    smtp_ssl: bool = False
    resend_api_key: str = ""
    resend_from_email: str = ""

    # ── SMS Delivery (Twilio, MSG91, Exotel, Fast2SMS) ───────────────────────
    sms_provider: str = "twilio"  # "twilio" | "msg91" | "exotel" | "fast2sms"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_phone: str = ""
    twilio_phone_number: str = ""
    fast2sms_api_key: str = ""
    msg91_auth_key: str = ""
    msg91_sender_id: str = "VOXSHD"
    msg91_template_id: str = ""
    exotel_account_sid: str = ""
    exotel_api_key: str = ""
    exotel_api_token: str = ""
    exotel_subdomain: str = "api.exotel.com"

    # ── Frontend ─────────────────────────────────────────────────────────────
    frontend_url: str = "http://localhost:5173"

    # ── ML Models (Phase 5-7) ────────────────────────────────────────────────
    speaker_model_path: str = ""
    deepfake_model_path: str = ""
    replay_model_path: str = ""

    # ── Derived helpers ──────────────────────────────────────────────────────
    @property
    def is_development(self) -> bool:
        return self.app_env.lower() in ("development", "dev", "test")

    @property
    def using_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
