from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    role: str
    storage_quota_bytes: int


class FileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    mime_type: str
    size_bytes: int
    sha256: str
    version_number: int
    status: str
    created_at: datetime


class FileVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version_number: int
    mime_type: str
    size_bytes: int
    sha256: str
    created_at: datetime


class SearchHit(BaseModel):
    file_id: UUID
    name: str
    score: float
    snippet: str | None = None


class StorageSummary(BaseModel):
    used_bytes: int
    quota_bytes: int
    file_count: int
    ready_count: int


class HealthResponse(BaseModel):
    status: str
    service: str
