import json
from datetime import datetime
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field


class ToolConfigCreateRequest(BaseModel):
    tool_type: str = Field(pattern="^(web_search|code_interpreter|custom_http|mcp_server)$")
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=500)
    config: Dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True


class TestMCPRequest(BaseModel):
    server_url: str
    headers: Optional[Dict[str, str]] = None
    protocol: Optional[str] = "auto"


class TestMCPResponse(BaseModel):
    success: bool
    tools: List[Dict[str, Any]] = Field(default_factory=list)
    message: str


class ToolConfigUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    config: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None


class ToolConfigResponse(BaseModel):
    id: str
    workspace_id: str
    tool_type: str
    name: str
    description: str
    config: Dict[str, Any]
    is_enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_model(cls, tool):
        try:
            cfg = json.loads(tool.config_json) if isinstance(tool.config_json, str) else (tool.config_json or {})
        except Exception:
            cfg = {}
        return cls(
            id=tool.id,
            workspace_id=tool.workspace_id,
            tool_type=tool.tool_type,
            name=tool.name,
            description=tool.description,
            config=cfg,
            is_enabled=tool.is_enabled,
            created_at=tool.created_at,
            updated_at=tool.updated_at,
        )
