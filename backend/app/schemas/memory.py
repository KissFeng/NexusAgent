from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class MemoryCreateRequest(BaseModel):
    category: str = Field(default="preference", pattern="^(preference|fact|episodic)$")
    content: str = Field(min_length=1, max_length=2000)
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class MemoryUpdateRequest(BaseModel):
    category: Optional[str] = Field(default=None, pattern="^(preference|fact|episodic)$")
    content: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class MemoryResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    category: str
    content: str
    confidence: float
    source_conversation_id: Optional[str] = None
    recall_count: int
    last_recalled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
