import json
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.governance import AuditLog

logger = logging.getLogger(__name__)

class AuditService:
    @staticmethod
    async def log_action(
        db: AsyncSession,
        workspace_id: str,
        action: str,
        resource_type: str,
        user_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        status: str = "success",
        details: Optional[Dict[str, Any] | str] = None,
    ) -> AuditLog:
        """记录企业合规操作审计日志"""
        details_str = None
        if isinstance(details, dict):
            try:
                details_str = json.dumps(details, ensure_ascii=False)
            except Exception:
                details_str = str(details)
        elif details:
            details_str = str(details)

        log = AuditLog(
            workspace_id=workspace_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            status=status,
            details=details_str,
        )
        db.add(log)
        try:
            await db.commit()
            await db.refresh(log)
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")
            await db.rollback()
        return log

    @staticmethod
    async def list_logs(
        db: AsyncSession,
        workspace_id: str,
        action_filter: Optional[str] = None,
        resource_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """分页获取审计日志"""
        conditions = [AuditLog.workspace_id == workspace_id]
        if action_filter:
            conditions.append(AuditLog.action.ilike(f"%{action_filter}%"))
        if resource_type:
            conditions.append(AuditLog.resource_type == resource_type)

        stmt = select(AuditLog).where(and_(*conditions)).order_by(desc(AuditLog.created_at)).offset(offset).limit(limit)
        res = await db.execute(stmt)
        logs = res.scalars().all()

        count_stmt = select(AuditLog.id).where(and_(*conditions))
        count_res = await db.execute(count_stmt)
        total = len(count_res.scalars().all())

        return {
            "total": total,
            "items": [
                {
                    "id": l.id,
                    "action": l.action,
                    "resource_type": l.resource_type,
                    "resource_id": l.resource_id,
                    "user_id": l.user_id,
                    "ip_address": l.ip_address,
                    "status": l.status,
                    "details": l.details,
                    "created_at": l.created_at.isoformat() if l.created_at else None,
                }
                for l in logs
            ],
        }
