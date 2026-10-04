import json
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class SkillCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    category: str = Field(default="通用助手", max_length=50)
    description: str = Field(min_length=1, max_length=500)
    system_prompt: str = Field(min_length=1)
    bound_tools: List[str] = Field(default_factory=list)


class SkillUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=500)
    system_prompt: Optional[str] = None
    bound_tools: Optional[List[str]] = None
    is_enabled: Optional[bool] = None


class SkillResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    code: str
    category: str
    description: str
    system_prompt: str
    bound_tools: List[str]
    is_enabled: bool
    is_preset: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_model(cls, skill):
        try:
            tools = json.loads(skill.bound_tools) if isinstance(skill.bound_tools, str) else (skill.bound_tools or [])
        except Exception:
            tools = []
        return cls(
            id=skill.id,
            workspace_id=skill.workspace_id,
            name=skill.name,
            code=skill.code,
            category=skill.category,
            description=skill.description,
            system_prompt=skill.system_prompt,
            bound_tools=tools,
            is_enabled=skill.is_enabled,
            is_preset=skill.is_preset,
            created_at=skill.created_at,
            updated_at=skill.updated_at,
        )
