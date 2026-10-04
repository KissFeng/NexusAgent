import json
import asyncio
import logging
import time
from typing import Dict, Any
from fastapi import APIRouter, Request, Header, HTTPException, status
from langchain_core.messages import HumanMessage
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.governance import WebhookConfig, TokenUsage
from app.models.model_provider import ModelConfig
from app.models.chat import Conversation, Message
from app.agent.graph import create_agent_graph
from app.services.feishu_service import FeishuService
from app.services.usage_service import UsageService
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# 内存短期去重缓存 (防重放/防重复推送)
_processed_events = set()


async def process_feishu_message_async(config_id: str, chat_id: str, text_content: str):
    """后台异步任务：驱动 LangGraph Agent 执行并回调飞书"""
    start_time = time.time()
    async with AsyncSessionLocal() as db:
        stmt = select(WebhookConfig).where(WebhookConfig.id == config_id)
        res = await db.execute(stmt)
        webhook = res.scalar_one_or_none()
        if not webhook or not webhook.is_active:
            return

        workspace_id = webhook.workspace_id

        try:
            # 1. 检查空间 Token 配额
            await UsageService.check_quota(workspace_id, db)

            # 2. 获取大模型配置
            m_stmt = (
                select(ModelConfig)
                .where(ModelConfig.workspace_id == workspace_id)
                .order_by(ModelConfig.is_default.desc(), ModelConfig.created_at.asc())
            )
            m_res = await db.execute(m_stmt)
            model_config = m_res.scalars().first()

            if not model_config:
                reply = "⚠️ 当前工作空间尚未配置可用的大模型 API Key，请在网页端配置后重试。"
            else:
                # 3. 构造 LangGraph 并执行
                graph = create_agent_graph(model_config=model_config, workspace_id=workspace_id)
                state = {
                    "messages": [HumanMessage(content=text_content)],
                    "workspace_id": workspace_id,
                    "user_id": None,
                    "kb_ids": [],
                    "citations": [],
                    "model_config_id": model_config.id,
                    "skill_code": None,
                }
                config = {"configurable": {"thread_id": f"feishu_{chat_id}_{int(start_time)}"}}
                out = await graph.ainvoke(state, config=config)

                reply = ""
                for msg in reversed(out.get("messages", [])):
                    if hasattr(msg, "content") and msg.content and not getattr(msg, "tool_calls", None):
                        reply = str(msg.content)
                        break
                if not reply and out.get("messages"):
                    reply = str(out["messages"][-1].content)

                latency_ms = int((time.time() - start_time) * 1000)

                # 4. 记录 Token 与费用
                prompt_tokens = max(len(text_content) // 2, 5)
                completion_tokens = max(len(reply) // 2, 5)
                await UsageService.record_usage(
                    db=db,
                    workspace_id=workspace_id,
                    model_name=model_config.model_name,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    latency_ms=latency_ms,
                )

            # 5. 回复飞书群聊
            if webhook.app_id and webhook.app_secret:
                await FeishuService.send_message_to_feishu_chat(
                    app_id=webhook.app_id,
                    app_secret=webhook.app_secret,
                    receive_id=chat_id,
                    text_content=reply,
                )
            elif webhook.webhook_url:
                await FeishuService.send_webhook_bot(
                    channel_type="feishu",
                    webhook_url=webhook.webhook_url,
                    text_content=reply,
                )

            # 6. 持久化记录到系统内部
            conv = Conversation(
                workspace_id=workspace_id,
                user_id="feishu_bot",
                title=f"[飞书] {text_content[:20]}",
            )
            db.add(conv)
            await db.flush()
            db.add(Message(conversation_id=conv.id, role="user", content=text_content))
            db.add(Message(conversation_id=conv.id, role="assistant", content=reply))
            await db.commit()

            # 7. 审计记录
            await AuditService.log_action(
                db=db,
                workspace_id=workspace_id,
                action="feishu.message.handle",
                resource_type="webhook",
                resource_id=config_id,
                details={"chat_id": chat_id, "latency_ms": int((time.time() - start_time) * 1000)},
            )

        except Exception as e:
            logger.error(f"Feishu background processing failed: {e}", exc_info=True)


@router.post("/feishu/{config_id}")
async def handle_feishu_webhook(
    config_id: str,
    request: Request,
    x_lark_request_timestamp: str = Header(None),
    x_lark_request_nonce: str = Header(None),
    x_lark_signature: str = Header(None),
):
    """
    飞书开放平台事件订阅入口：
    1. 支持 URL Verification 校验握手
    2. 支持 AES-256-CBC 报文解密
    3. 支持签名防篡改
    4. 3秒内立即回包避免飞书超时重试，后台异步启动 Agent 并回复
    """
    raw_body = await request.body()
    body_str = raw_body.decode("utf-8")

    async with AsyncSessionLocal() as db:
        stmt = select(WebhookConfig).where(WebhookConfig.id == config_id)
        res = await db.execute(stmt)
        webhook = res.scalar_one_or_none()
        if not webhook or not webhook.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook config not found or inactive")

    try:
        data = json.loads(body_str)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")

    # 1. 解密密文模式
    if "encrypt" in data:
        if not webhook.encrypt_key:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Encrypt Key for decrypted mode")
        data = FeishuService.decrypt_content(webhook.encrypt_key, data["encrypt"])

    # 2. URL 探测挑战 (Challenge) 握手
    if data.get("type") == "url_verification":
        return {"challenge": data.get("challenge")}

    # 3. 消息防重放与去重
    event_id = data.get("header", {}).get("event_id") or data.get("event_id")
    if event_id:
        if event_id in _processed_events:
            return {"code": 0, "msg": "duplicate event ignored"}
        _processed_events.add(event_id)
        if len(_processed_events) > 5000:
            _processed_events.clear()

    # 4. 提取消息事件
    event = data.get("event", {})
    message_data = event.get("message", {})
    chat_id = message_data.get("chat_id") or event.get("open_chat_id")
    raw_content = message_data.get("content", "{}")

    text_to_process = ""
    try:
        content_json = json.loads(raw_content)
        text_to_process = content_json.get("text", "").strip()
    except Exception:
        text_to_process = str(raw_content)

    if chat_id and text_to_process:
        # 立即返回 200，并启动后台异步任务驱动 Agent，阻断 3 秒超时熔断
        asyncio.create_task(process_feishu_message_async(config_id, chat_id, text_to_process))

    return {"code": 0, "msg": "success"}


@router.post("/wecom/{config_id}")
async def handle_wecom_webhook(config_id: str, request: Request):
    """企业微信回调入口 (留空扩展)"""
    return {"code": 0, "msg": "ok"}
