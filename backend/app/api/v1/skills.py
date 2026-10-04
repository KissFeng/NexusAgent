import json
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.workspace import Workspace
from app.models.skill import Skill
from app.schemas.skill import (
    SkillCreateRequest,
    SkillUpdateRequest,
    SkillResponse,
)
from app.api.deps import get_current_workspace
from app.services.skill_service import SkillService

router = APIRouter(prefix="/skills", tags=["Skills"])


@router.get("", response_model=List[SkillResponse])
async def list_skills(
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    # 确保当前空间已拥有基础预设技能
    await SkillService.ensure_preset_skills(db, workspace.id)

    stmt = select(Skill).where(Skill.workspace_id == workspace.id).order_by(Skill.is_preset.desc(), Skill.created_at.asc())
    skills = (await db.execute(stmt)).scalars().all()
    return [SkillResponse.from_orm_model(s) for s in skills]


@router.post("", response_model=SkillResponse)
async def create_skill(
    req: SkillCreateRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权创建技能")

    # 检查 code 是否重复
    stmt = select(Skill).where(Skill.workspace_id == workspace.id, Skill.code == req.code.strip().lower())
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"技能指令 /{req.code} 已存在")

    skill = Skill(
        workspace_id=workspace.id,
        name=req.name,
        code=req.code.strip().lower(),
        category=req.category,
        description=req.description,
        system_prompt=req.system_prompt,
        bound_tools=json.dumps(req.bound_tools),
        is_enabled=True,
        is_preset=False,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return SkillResponse.from_orm_model(skill)


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    req: SkillUpdateRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权修改技能")

    stmt = select(Skill).where(Skill.id == skill_id, Skill.workspace_id == workspace.id)
    skill = (await db.execute(stmt)).scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")

    if req.name is not None:
        skill.name = req.name
    if req.category is not None:
        skill.category = req.category
    if req.description is not None:
        skill.description = req.description
    if req.system_prompt is not None:
        skill.system_prompt = req.system_prompt
    if req.bound_tools is not None:
        skill.bound_tools = json.dumps(req.bound_tools)
    if req.is_enabled is not None:
        skill.is_enabled = req.is_enabled

    await db.commit()
    await db.refresh(skill)
    return SkillResponse.from_orm_model(skill)


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除技能")

    stmt = select(Skill).where(Skill.id == skill_id, Skill.workspace_id == workspace.id)
    skill = (await db.execute(stmt)).scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="技能不存在")

    await db.delete(skill)
    await db.commit()
    return {"message": "技能已删除"}
