from datetime import datetime
from pydantic import BaseModel, Field

class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    type: str = Field(default="enterprise", pattern="^(personal|enterprise)$")

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    type: str
    owner_id: str
    created_at: datetime
    role: str | None = None  # Current user's role in this workspace

    class Config:
        from_attributes = True

class WorkspaceMemberAddRequest(BaseModel):
    email: str
    role: str = Field(default="member", pattern="^(admin|member)$")

class WorkspaceMemberResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    email: str | None = None
    username: str | None = None
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True
