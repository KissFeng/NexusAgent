from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.memory import (
    MemoryCreateRequest,
    MemoryUpdateRequest,
    MemoryResponse,
)
from app.api.deps import get_current_user, get_current_workspace
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memories", tags=["Long-term Memory"])


@router.get("", response_model=List[MemoryResponse])
async def list_memories(
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    memories = await MemoryService.list_memories(db, user.id, workspace.id)
    return memories


@router.post("", response_model=MemoryResponse)
async def create_memory(
    req: MemoryCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    memory = await MemoryService.create_memory(
        db=db,
        user_id=user.id,
        workspace_id=workspace.id,
        category=req.category,
        content=req.content,
        confidence=req.confidence,
    )
    return memory


@router.put("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str,
    req: MemoryUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    updated = await MemoryService.update_memory(
        db=db,
        memory_id=memory_id,
        user_id=user.id,
        workspace_id=workspace.id,
        category=req.category,
        content=req.content,
        confidence=req.confidence,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记忆条目不存在")
    return updated


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    deleted = await MemoryService.delete_memory(
        db=db,
        memory_id=memory_id,
        user_id=user.id,
        workspace_id=workspace.id,
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="记忆条目不存在")
    return {"message": "记忆已成功删除"}
