import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Float, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Memory(Base):
    __tablename__ = "memories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # 记忆分类: 'preference' (用户偏好/习惯), 'fact' (事实性认知), 'episodic' (历史决策/情景经历)
    category = Column(String(50), nullable=False, default="preference", index=True)
    content = Column(Text, nullable=False)
    confidence = Column(Float, default=0.9)  # 置信度 (0.0 ~ 1.0)
    
    source_conversation_id = Column(String(36), nullable=True)  # 来源会话
    recall_count = Column(Integer, default=0)  # 被召回引用次数
    last_recalled_at = Column(DateTime(timezone=True), nullable=True)  # 最近一次被召回时间
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    workspace = relationship("Workspace", backref="memories")
    user = relationship("User", backref="memories")
