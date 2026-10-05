from datetime import datetime
from pydantic import BaseModel, Field

class ConversationCreateRequest(BaseModel):
    title: str = Field(default="新对话", max_length=255)
    model_config_id: str | None = None

class ConversationUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    model_config_id: str | None = None

class ConversationForkRequest(BaseModel):
    message_id: str
    title: str | None = None

class MessageTruncateRequest(BaseModel):
    message_id: str

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    token_count: int
    model_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class ConversationResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    model_config_id: str | None = None
    title: str
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None

    class Config:
        from_attributes = True

class ChatStreamRequest(BaseModel):
    conversation_id: str | None = None  # If None, create new conversation automatically
    content: str = Field(min_length=1)
    model_config_id: str | None = None  # If None, use workspace default model
    skill_code: str | None = None  # 可选指定的 Skill 技能标识
