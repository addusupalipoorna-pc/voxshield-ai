"""
User schemas — registration, login, response.
"""
from datetime import datetime
from pydantic import BaseModel, Field


EMAIL_REGEX = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"


class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=255)
    phone: str | None = Field(None, max_length=30)
    password: str = Field(..., min_length=6, max_length=128)
    consent: bool = Field(..., description="User must explicitly consent to voice data processing")


class UserLogin(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    role: str
    is_active: bool
    is_verified: bool = False
    email_verified: bool = False
    phone_verified: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserOut | None = None


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX, max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=10)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(...)

