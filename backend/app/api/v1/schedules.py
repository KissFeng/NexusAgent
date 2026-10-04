from typing import List, Optional, Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from apscheduler.triggers.cron import CronTrigger

from app.core.database import get_db
from app.api.v1.auth import get_current_user
from app.api.v1.workspace import get_current_workspace
from app.models.user import User
from app.models.workspace import Workspace
from app.models.governance import ScheduledTask
from app.services.scheduler_service import SchedulerService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/schedules", tags=["schedules"])


class ScheduledTaskCreate(BaseModel):
    name: str = Field(..., max_length=100)
    cron_expression: str = Field(..., max_length=50)  # e.g., "0 9 * * *"
    prompt: str
    model_config_id: Optional[str] = None
    skill_code: Optional[str] = None
    channel_type: str = "internal"  # "internal", "feishu", "wecom"
    target_id: Optional[str] = None
    is_enabled: bool = True


class ScheduledTaskUpdate(BaseModel):
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    prompt: Optional[str] = None
    model_config_id: Optional[str] = None
    skill_code: Optional[str] = None
    channel_type: Optional[str] = None
    target_id: Optional[str] = None
    is_enabled: Optional[bool] = None


class ScheduledTaskResponse(BaseModel):
    id: str
    workspace_id: str
    creator_id: Optional[str] = None
    name: str
    cron_expression: str
    prompt: str
    model_config_id: Optional[str] = None
    skill_code: Optional[str] = None
    channel_type: str
    target_id: Optional[str] = None
    is_enabled: bool
    last_run_at: Optional[str] = None
    last_status: Optional[str] = None
    last_error: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[ScheduledTaskResponse])
async def list_scheduled_tasks(
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = (
        select(ScheduledTask)
        .where(ScheduledTask.workspace_id == workspace.id)
        .order_by(desc(ScheduledTask.created_at))
    )
    res = await db.execute(stmt)
    tasks = res.scalars().all()
    return [
        ScheduledTaskResponse(
            id=t.id,
            workspace_id=t.workspace_id,
            creator_id=t.creator_id,
            name=t.name,
            cron_expression=t.cron_expression,
            prompt=t.prompt,
            model_config_id=t.model_config_id,
            skill_code=t.skill_code,
            channel_type=t.channel_type,
            target_id=t.target_id,
            is_enabled=t.is_enabled,
            last_run_at=t.last_run_at.isoformat() if t.last_run_at else None,
            last_status=t.last_status,
            last_error=t.last_error,
            created_at=t.created_at.isoformat() if t.created_at else "",
        )
        for t in tasks
    ]


@router.post("", response_model=ScheduledTaskResponse)
async def create_scheduled_task(
    data: ScheduledTaskCreate,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info

    # 校验 Cron 表达式合法性
    try:
        CronTrigger.from_crontab(data.cron_expression)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的 Cron 表达式: {e}。示例: '0 9 * * *' (每天早9点), '*/30 * * * *' (每30分钟)"
        )

    task = ScheduledTask(
        workspace_id=workspace.id,
        creator_id=user.id,
        name=data.name,
        cron_expression=data.cron_expression,
        prompt=data.prompt,
        model_config_id=data.model_config_id,
        skill_code=data.skill_code,
        channel_type=data.channel_type,
        target_id=data.target_id,
        is_enabled=data.is_enabled,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # 注册到调度器
    if task.is_enabled:
        SchedulerService.register_job(task)

    # 记录审计日志
    await AuditService.log_action(
        db=db,
        workspace_id=workspace.id,
        user_id=user.id,
        action="schedule.create",
        resource_type="scheduled_task",
        resource_id=task.id,
        details={"name": task.name, "cron": task.cron_expression},
    )

    return ScheduledTaskResponse(
        id=task.id,
        workspace_id=task.workspace_id,
        creator_id=task.creator_id,
        name=task.name,
        cron_expression=task.cron_expression,
        prompt=task.prompt,
        model_config_id=task.model_config_id,
        skill_code=task.skill_code,
        channel_type=task.channel_type,
        target_id=task.target_id,
        is_enabled=task.is_enabled,
        last_run_at=None,
        last_status=None,
        last_error=None,
        created_at=task.created_at.isoformat() if task.created_at else "",
    )


@router.put("/{task_id}", response_model=ScheduledTaskResponse)
async def update_scheduled_task(
    task_id: str,
    data: ScheduledTaskUpdate,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(ScheduledTask).where(
        ScheduledTask.id == task_id,
        ScheduledTask.workspace_id == workspace.id,
    )
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    update_dict = data.model_dump(exclude_unset=True)
    if "cron_expression" in update_dict:
        try:
            CronTrigger.from_crontab(update_dict["cron_expression"])
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"无效的 Cron 表达式: {e}")

    for k, v in update_dict.items():
        setattr(task, k, v)

    await db.commit()
    await db.refresh(task)

    # 更新调度器
    if task.is_enabled:
        SchedulerService.register_job(task)
    else:
        SchedulerService.remove_job(task.id)

    await AuditService.log_action(
        db=db,
        workspace_id=workspace.id,
        user_id=user.id,
        action="schedule.update",
        resource_type="scheduled_task",
        resource_id=task.id,
    )

    return ScheduledTaskResponse(
        id=task.id,
        workspace_id=task.workspace_id,
        creator_id=task.creator_id,
        name=task.name,
        cron_expression=task.cron_expression,
        prompt=task.prompt,
        model_config_id=task.model_config_id,
        skill_code=task.skill_code,
        channel_type=task.channel_type,
        target_id=task.target_id,
        is_enabled=task.is_enabled,
        last_run_at=task.last_run_at.isoformat() if task.last_run_at else None,
        last_status=task.last_status,
        last_error=task.last_error,
        created_at=task.created_at.isoformat() if task.created_at else "",
    )


@router.delete("/{task_id}")
async def delete_scheduled_task(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(ScheduledTask).where(
        ScheduledTask.id == task_id,
        ScheduledTask.workspace_id == workspace.id,
    )
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    SchedulerService.remove_job(task.id)
    await db.delete(task)
    await db.commit()

    await AuditService.log_action(
        db=db,
        workspace_id=workspace.id,
        user_id=user.id,
        action="schedule.delete",
        resource_type="scheduled_task",
        resource_id=task_id,
    )

    return {"message": "定时任务已成功删除"}


@router.post("/{task_id}/trigger")
async def trigger_task_immediately(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(ScheduledTask).where(
        ScheduledTask.id == task_id,
        ScheduledTask.workspace_id == workspace.id,
    )
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    # 手动触发单次执行
    result = await SchedulerService.execute_task(task_id)
    return result
