from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.models.model_provider import ModelConfig
from app.schemas.workspace import (
    WorkspaceCreateRequest,
    WorkspaceResponse,
    WorkspaceMemberAddRequest,
    WorkspaceMemberResponse,
)
from app.api.deps import get_current_user, get_current_workspace

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

@router.get("", response_model=List[WorkspaceResponse])
async def list_my_workspaces(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.created_at.asc())
    )
    result = await db.execute(stmt)
    workspaces = []
    for ws, role in result.all():
        resp = WorkspaceResponse.model_validate(ws)
        resp.role = role
        workspaces.append(resp)
    return workspaces

@router.post("", response_model=WorkspaceResponse)
async def create_workspace(
    req: WorkspaceCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ws = Workspace(
        name=req.name,
        type=req.type,
        owner_id=user.id,
    )
    db.add(ws)
    await db.flush()

    membership = WorkspaceMember(
        workspace_id=ws.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)

    # 给新企业空间也复制一个默认模型模板
    default_model = ModelConfig(
        workspace_id=ws.id,
        name="DeepSeek-Chat",
        provider="deepseek",
        model_name="deepseek-chat",
        base_url="https://api.deepseek.com/v1",
        api_key=None,
        is_default=True,
    )
    db.add(default_model)

    await db.commit()
    await db.refresh(ws)

    resp = WorkspaceResponse.model_validate(ws)
    resp.role = "owner"
    return resp

@router.get("/{workspace_id}/members", response_model=List[WorkspaceMemberResponse])
async def list_workspace_members(
    workspace_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # 验证当前用户是否属于该空间
    perm_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user.id
    )
    member_record = (await db.execute(perm_stmt)).scalar_one_or_none()
    if not member_record:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该空间成员")

    stmt = (
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc())
    )
    results = await db.execute(stmt)
    members = []
    for member, u in results.all():
        members.append(
            WorkspaceMemberResponse(
                id=member.id,
                workspace_id=member.workspace_id,
                user_id=member.user_id,
                email=u.email,
                username=u.username,
                role=member.role,
                joined_at=member.joined_at,
            )
        )
    return members

@router.post("/{workspace_id}/members", response_model=WorkspaceMemberResponse)
async def add_workspace_member(
    workspace_id: str,
    req: WorkspaceMemberAddRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # 只有 owner 或 admin 能添加成员
    perm_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user.id
    )
    caller = (await db.execute(perm_stmt)).scalar_one_or_none()
    if not caller or caller.role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要空间管理员或所有者权限")

    # 查找被邀请用户
    u_stmt = select(User).where(User.email == req.email)
    target_user = (await db.execute(u_stmt)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该邮箱用户尚未注册平台")

    # 检查是否已是成员
    existing_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == target_user.id
    )
    if (await db.execute(existing_stmt)).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该用户已是当前空间成员")

    new_member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=target_user.id,
        role=req.role,
    )
    db.add(new_member)
    await db.commit()
    await db.refresh(new_member)

    return WorkspaceMemberResponse(
        id=new_member.id,
        workspace_id=new_member.workspace_id,
        user_id=new_member.user_id,
        email=target_user.email,
        username=target_user.username,
        role=new_member.role,
        joined_at=new_member.joined_at,
    )
