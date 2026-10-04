import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), default="通用助手")
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    bound_tools: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组，如 ["web_search", "search_knowledge_base"]
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_preset: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
