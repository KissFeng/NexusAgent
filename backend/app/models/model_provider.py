import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False) # e.g. "DeepSeek-V3", "GPT-4o Mini"
    provider: Mapped[str] = mapped_column(String(50), nullable=False) # "openai", "deepseek", "qwen", "anthropic", "ollama", "custom"
    model_name: Mapped[str] = mapped_column(String(100), nullable=False) # e.g. "deepseek-chat", "gpt-4o-mini"
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    workspace = relationship("Workspace", back_populates="model_configs")
    conversations = relationship("Conversation", back_populates="model_config")
