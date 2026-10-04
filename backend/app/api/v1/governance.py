from typing import List, Optional, Annotated, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.auth import get_current_user
from app.api.v1.workspace import get_current_workspace
from app.models.user import User
from app.models.workspace import Workspace
from app.models.governance import WebhookConfig
from app.services.usage_service import UsageService
from app.services.audit_service import AuditService
from app.services.feishu_service import FeishuService

router = APIRouter(prefix="/governance", tags=["governance"])


# ---- 用量与配额 ----
class QuotaUpdateRequest(BaseModel):
    token_quota_monthly: int = Field(..., ge=0, description="月度 Token 配额上限 (0 表示不设上限)")


@router.get("/usage")
async def get_usage_overview(
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
):
    workspace, _ = ws_info
    summary = await UsageService.get_usage_summary(workspace.id, db, days=days)
    return summary


@router.put("/quota")
async def update_quota(
    req: QuotaUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有空间管理员或所有者可以调整配额")

    stmt = select(Workspace).where(Workspace.id == workspace.id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if ws:
        ws.token_quota_monthly = req.token_quota_monthly
        await db.commit()

    await AuditService.log_action(
        db=db,
        workspace_id=workspace.id,
        user_id=user.id,
        action="workspace.quota.update",
        resource_type="workspace",
        resource_id=workspace.id,
        details={"new_quota": req.token_quota_monthly},
    )

    return {"message": "配额已更新", "token_quota_monthly": req.token_quota_monthly}


# ---- 审计日志 ----
@router.get("/audit-logs")
async def get_audit_logs(
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
    action_filter: Optional[str] = None,
    resource_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    workspace, _ = ws_info
    return await AuditService.list_logs(
        db=db,
        workspace_id=workspace.id,
        action_filter=action_filter,
        resource_type=resource_type,
        limit=limit,
        offset=offset,
    )


# ---- 外部渠道与 Webhook 配置 ----
class WebhookConfigCreate(BaseModel):
    name: str = Field(..., max_length=100)
    channel_type: str = Field(..., description="'feishu' or 'wecom'")
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    verification_token: Optional[str] = None
    encrypt_key: Optional[str] = None
    webhook_url: Optional[str] = None
    is_active: bool = True


class WebhookConfigUpdate(BaseModel):
    name: Optional[str] = None
    channel_type: Optional[str] = None
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    verification_token: Optional[str] = None
    encrypt_key: Optional[str] = None
    webhook_url: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/webhooks")
async def list_webhooks(
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = (
        select(WebhookConfig)
        .where(WebhookConfig.workspace_id == workspace.id)
        .order_by(desc(WebhookConfig.created_at))
    )
    res = await db.execute(stmt)
    webhooks = res.scalars().all()
    return [
        {
            "id": w.id,
            "workspace_id": w.workspace_id,
            "name": w.name,
            "channel_type": w.channel_type,
            "app_id": w.app_id,
            "has_app_secret": bool(w.app_secret),
            "verification_token": w.verification_token,
            "has_encrypt_key": bool(w.encrypt_key),
            "webhook_url": w.webhook_url,
            "is_active": w.is_active,
            "callback_url": f"/api/v1/webhooks/{w.channel_type}/{w.id}",
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in webhooks
    ]


@router.post("/webhooks")
async def create_webhook(
    req: WebhookConfigCreate,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    webhook = WebhookConfig(
        workspace_id=workspace.id,
        name=req.name,
        channel_type=req.channel_type,
        app_id=req.app_id,
        app_secret=req.app_secret,
        verification_token=req.verification_token,
        encrypt_key=req.encrypt_key,
        webhook_url=req.webhook_url,
        is_active=req.is_active,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)

    await AuditService.log_action(
        db=db,
        workspace_id=workspace.id,
        user_id=user.id,
        action="webhook.create",
        resource_type="webhook",
        resource_id=webhook.id,
        details={"name": webhook.name, "channel": webhook.channel_type},
    )

    return {
        "id": webhook.id,
        "name": webhook.name,
        "channel_type": webhook.channel_type,
        "callback_url": f"/api/v1/webhooks/{webhook.channel_type}/{webhook.id}",
        "message": "Webhook 配置创建成功",
    }


@router.put("/webhooks/{webhook_id}")
async def update_webhook(
    webhook_id: str,
    req: WebhookConfigUpdate,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(WebhookConfig).where(
        WebhookConfig.id == webhook_id,
        WebhookConfig.workspace_id == workspace.id,
    )
    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook 配置不存在")

    update_dict = req.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        if k in ("app_secret", "encrypt_key") and not v:
            continue  # 留空保持现有密钥
        setattr(webhook, k, v)

    await db.commit()
    await db.refresh(webhook)

    await AuditService.log_action(
        db=db,
        workspace_id=workspace.id,
        user_id=user.id,
        action="webhook.update",
        resource_type="webhook",
        resource_id=webhook.id,
    )

    return {"message": "Webhook 配置已更新"}


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(WebhookConfig).where(
        WebhookConfig.id == webhook_id,
        WebhookConfig.workspace_id == workspace.id,
    )
    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook 配置不存在")

    await db.delete(webhook)
    await db.commit()

    await AuditService.log_action(
        db=db,
        workspace_id=workspace.id,
        user_id=user.id,
        action="webhook.delete",
        resource_type="webhook",
        resource_id=webhook_id,
    )

    return {"message": "Webhook 配置已删除"}


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: str,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(WebhookConfig).where(
        WebhookConfig.id == webhook_id,
        WebhookConfig.workspace_id == workspace.id,
    )
    res = await db.execute(stmt)
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook 配置不存在")

    test_message = f"【企业级智能体平台】渠道测试成功！\n- 工作空间: {workspace.name}\n- 配置通道: {webhook.channel_type.upper()}\n- 测试时间: {user.username or 'Admin'}"

    # 1. 如果配置了自定义机器人 Webhook URL，执行主动推流测试
    if webhook.webhook_url:
        success = await FeishuService.send_webhook_bot(
            channel_type=webhook.channel_type,
            webhook_url=webhook.webhook_url,
            text_content=test_message,
        )
        if success:
            return {"success": True, "message": "已成功向群机器人 Webhook 发送测试消息！"}
        else:
            return {"success": False, "message": "向群机器人 Webhook 发送消息失败，请检查 URL 是否有效。"}

    # 2. 如果配置了 AppID & AppSecret，测试应用凭证交换
    if webhook.app_id and webhook.app_secret:
        token = await FeishuService.get_tenant_access_token(webhook.app_id, webhook.app_secret)
        if token:
            return {"success": True, "message": "开放平台 AppID 与 AppSecret 握手成功，凭证换取正常！"}
        else:
            return {"success": False, "message": "应用凭证握手失败，请核对 AppID 与 AppSecret。"}

    return {"success": True, "message": f"回调地址已就绪: /api/v1/webhooks/{webhook.channel_type}/{webhook.id}"}
