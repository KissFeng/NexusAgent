import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from fastapi import HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.governance import TokenUsage
from app.models.workspace import Workspace

logger = logging.getLogger(__name__)

# 模型价格矩阵 (单位: 元人民币 / 百万 Token)
MODEL_PRICE_MATRIX = {
    # DeepSeek 系列
    "deepseek-ai/DeepSeek-V3": {"input": 2.0, "output": 8.0},
    "deepseek-ai/DeepSeek-R1": {"input": 4.0, "output": 16.0},
    "deepseek-chat": {"input": 2.0, "output": 8.0},
    "deepseek-reasoner": {"input": 4.0, "output": 16.0},
    # OpenAI 系列
    "gpt-4o": {"input": 18.0, "output": 72.0},
    "gpt-4o-mini": {"input": 1.1, "output": 4.4},
    # Qwen 系列
    "qwen-plus": {"input": 0.8, "output": 2.0},
    "qwen-max": {"input": 16.0, "output": 40.0},
    # 默认兜底价格 (2元 / 8元)
    "default": {"input": 2.0, "output": 8.0},
}


class UsageService:
    @staticmethod
    def calculate_cost(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
        """根据模型定价矩阵计算预估费用(元)"""
        matched_price = MODEL_PRICE_MATRIX.get(model_name)
        if not matched_price:
            for key, price in MODEL_PRICE_MATRIX.items():
                if key in model_name:
                    matched_price = price
                    break
        if not matched_price:
            matched_price = MODEL_PRICE_MATRIX["default"]

        cost = (prompt_tokens * matched_price["input"] + completion_tokens * matched_price["output"]) / 1_000_000.0
        return round(cost, 6)

    @staticmethod
    async def check_quota(workspace_id: str, db: AsyncSession) -> None:
        """检查工作空间月度 Token 配额，超额阻断"""
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        res = await db.execute(stmt)
        ws = res.scalar_one_or_none()
        if not ws:
            return

        if ws.token_quota_monthly > 0 and ws.current_month_tokens >= ws.token_quota_monthly:
            raise HTTPException(
                status_code=402,
                detail=f"工作空间 [{ws.name}] 本月 Token 配额已耗尽 ({ws.current_month_tokens:,} / {ws.token_quota_monthly:,})，请联系管理员扩容。"
            )

    @staticmethod
    async def record_usage(
        db: AsyncSession,
        workspace_id: str,
        model_name: str,
        prompt_tokens: int,
        completion_tokens: int,
        user_id: str | None = None,
        conversation_id: str | None = None,
        latency_ms: int = 0,
    ) -> TokenUsage:
        """记录单次模型调用的 Token 与费用"""
        total_tokens = prompt_tokens + completion_tokens
        cost = UsageService.calculate_cost(model_name, prompt_tokens, completion_tokens)

        usage = TokenUsage(
            workspace_id=workspace_id,
            user_id=user_id,
            conversation_id=conversation_id,
            model_name=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            estimated_cost=cost,
            latency_ms=latency_ms,
        )
        db.add(usage)

        # 累加工作空间当月已消耗 tokens
        ws_stmt = select(Workspace).where(Workspace.id == workspace_id)
        ws_res = await db.execute(ws_stmt)
        ws = ws_res.scalar_one_or_none()
        if ws:
            ws.current_month_tokens = (ws.current_month_tokens or 0) + total_tokens

        await db.commit()
        await db.refresh(usage)
        return usage

    @staticmethod
    async def get_usage_summary(workspace_id: str, db: AsyncSession, days: int = 30) -> Dict[str, Any]:
        """获取工作空间用量全景统计数据"""
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        days_ago = now - timedelta(days=days)

        # 1. 查询工作空间配额配置
        ws_stmt = select(Workspace).where(Workspace.id == workspace_id)
        ws_res = await db.execute(ws_stmt)
        ws = ws_res.scalar_one_or_none()
        quota = ws.token_quota_monthly if ws else 10_000_000

        # 2. 今日消耗
        today_stmt = select(
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.coalesce(func.sum(TokenUsage.estimated_cost), 0.0),
            func.count(TokenUsage.id),
        ).where(and_(TokenUsage.workspace_id == workspace_id, TokenUsage.created_at >= today_start))
        today_res = await db.execute(today_stmt)
        today_tokens, today_cost, today_calls = today_res.fetchone()

        # 3. 本月消耗
        month_stmt = select(
            func.coalesce(func.sum(TokenUsage.total_tokens), 0),
            func.coalesce(func.sum(TokenUsage.estimated_cost), 0.0),
            func.count(TokenUsage.id),
        ).where(and_(TokenUsage.workspace_id == workspace_id, TokenUsage.created_at >= month_start))
        month_res = await db.execute(month_stmt)
        month_tokens, month_cost, month_calls = month_res.fetchone()

        # 4. 模型消耗分布
        model_stmt = select(
            TokenUsage.model_name,
            func.sum(TokenUsage.total_tokens).label("tokens"),
            func.sum(TokenUsage.estimated_cost).label("cost"),
            func.count(TokenUsage.id).label("calls"),
        ).where(and_(TokenUsage.workspace_id == workspace_id, TokenUsage.created_at >= days_ago))\
         .group_by(TokenUsage.model_name)\
         .order_by(func.sum(TokenUsage.total_tokens).desc())
        model_res = await db.execute(model_stmt)
        model_distribution = [
            {
                "model_name": row[0],
                "tokens": int(row[1]),
                "cost": round(float(row[2]), 4),
                "calls": int(row[3]),
            }
            for row in model_res.fetchall()
        ]

        # 5. 最近 N 天按日趋势
        daily_stmt = select(
            func.date(TokenUsage.created_at).label("day"),
            func.sum(TokenUsage.total_tokens).label("tokens"),
            func.sum(TokenUsage.estimated_cost).label("cost"),
            func.count(TokenUsage.id).label("calls"),
        ).where(and_(TokenUsage.workspace_id == workspace_id, TokenUsage.created_at >= days_ago))\
         .group_by(func.date(TokenUsage.created_at))\
         .order_by(func.date(TokenUsage.created_at).asc())
        daily_res = await db.execute(daily_stmt)
        daily_trends = [
            {
                "date": str(row[0]),
                "tokens": int(row[1]),
                "cost": round(float(row[2]), 4),
                "calls": int(row[3]),
            }
            for row in daily_res.fetchall()
        ]

        quota_percentage = round((month_tokens / quota * 100), 2) if quota > 0 else 0.0

        return {
            "quota_monthly": quota,
            "quota_used_tokens": int(month_tokens),
            "quota_percentage": min(quota_percentage, 100.0),
            "today": {
                "tokens": int(today_tokens),
                "cost": round(float(today_cost), 4),
                "calls": int(today_calls),
            },
            "this_month": {
                "tokens": int(month_tokens),
                "cost": round(float(month_cost), 4),
                "calls": int(month_calls),
            },
            "model_distribution": model_distribution,
            "daily_trends": daily_trends,
        }
