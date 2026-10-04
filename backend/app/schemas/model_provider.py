from datetime import datetime
from pydantic import BaseModel, Field

class ModelConfigCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100) # Display name
    provider: str = Field(pattern="^(openai|deepseek|qwen|anthropic|ollama|custom)$")
    model_name: str = Field(min_length=1, max_length=100)
    base_url: str | None = None
    api_key: str | None = None
    is_default: bool = False

class ModelConfigUpdateRequest(BaseModel):
    name: str | None = None
    provider: str | None = None
    model_name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    is_default: bool | None = None

class ModelConfigResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    provider: str
    model_name: str
    base_url: str | None = None
    has_api_key: bool = False  # Masked: only expose whether key is configured
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TestModelConnectionRequest(BaseModel):
    model_id: str | None = None
    provider: str | None = "custom"
    model_name: str | None = None
    base_url: str | None = None
    api_key: str | None = None

class TestModelConnectionResponse(BaseModel):
    success: bool
    latency_ms: int | None = None
    message: str
    sample_response: str | None = None
    available_models: list[str] = []

class DiscoverModelsRequest(BaseModel):
    model_id: str | None = None
    provider: str | None = "custom"
    base_url: str | None = None
    api_key: str | None = None

class DiscoverModelsResponse(BaseModel):
    success: bool
    models: list[str] = []
    message: str
