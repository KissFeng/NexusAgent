import json
import asyncio
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from app.core.database import get_db, AsyncSessionLocal
from app.models.user import User
from app.models.workspace import Workspace
from app.models.chat import Conversation, Message
from app.models.model_provider import ModelConfig
from app.schemas.chat import (
    ConversationCreateRequest,
    ConversationResponse,
    MessageResponse,
    ChatStreamRequest,
)
from app.api.deps import get_current_user, get_current_workspace
from app.llm.factory import LLMFactory

router = APIRouter(prefix="", tags=["Chat"])

@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = (
        select(Conversation)
        .where(
            Conversation.workspace_id == workspace.id,
            Conversation.user_id == user.id,
        )
        .order_by(desc(Conversation.updated_at))
    )
    result = await db.execute(stmt)
    conversations = result.scalars().all()

    resp_list = []
    for conv in conversations:
        # 查找最新一条消息作为预览
        msg_stmt = (
            select(Message.content)
            .where(Message.conversation_id == conv.id)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg = (await db.execute(msg_stmt)).scalar_one_or_none()
        resp_list.append(
            ConversationResponse(
                id=conv.id,
                workspace_id=conv.workspace_id,
                user_id=conv.user_id,
                model_config_id=conv.model_config_id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                last_message=last_msg[:40] if last_msg else None,
            )
        )
    return resp_list

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    req: ConversationCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    conv = Conversation(
        workspace_id=workspace.id,
        user_id=user.id,
        title=req.title,
        model_config_id=req.model_config_id,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)

    return ConversationResponse.model_validate(conv)

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: str,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.workspace_id == workspace.id,
        Conversation.user_id == user.id,
    )
    conv = (await db.execute(stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")

    msg_stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    messages = (await db.execute(msg_stmt)).scalars().all()
    return [MessageResponse.model_validate(m) for m in messages]

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.workspace_id == workspace.id,
        Conversation.user_id == user.id,
    )
    conv = (await db.execute(stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")

    await db.delete(conv)
    await db.commit()
    return {"message": "会话已删除"}

@router.post("/chat/stream")
async def chat_stream(
    req: ChatStreamRequest,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info

    # 1. 查找或创建会话
    conversation_id = req.conversation_id
    is_new_conversation = False
    if conversation_id:
        conv_stmt = select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.workspace_id == workspace.id,
            Conversation.user_id == user.id,
        )
        conv = (await db.execute(conv_stmt)).scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    else:
        is_new_conversation = True
        title = req.content[:20].strip() or "新对话"
        conv = Conversation(
            workspace_id=workspace.id,
            user_id=user.id,
            title=title,
            model_config_id=req.model_config_id,
        )
        db.add(conv)
        await db.flush()
        conversation_id = conv.id

    # 2. 保存用户消息
    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=req.content,
    )
    db.add(user_msg)
    await db.commit()

    # 3. 确定所使用的模型配置
    target_model_id = req.model_config_id or conv.model_config_id
    model_config = None
    if target_model_id:
        m_stmt = select(ModelConfig).where(
            ModelConfig.id == target_model_id,
            ModelConfig.workspace_id == workspace.id,
        )
        model_config = (await db.execute(m_stmt)).scalar_one_or_none()

    if not model_config:
        # 取工作空间默认模型
        m_stmt = (
            select(ModelConfig)
            .where(ModelConfig.workspace_id == workspace.id)
            .order_by(ModelConfig.is_default.desc(), ModelConfig.created_at.asc())
        )
        model_config = (await db.execute(m_stmt)).scalars().first()

    # 4. 获取历史上下文（最近 10 条）
    history_stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    history_records = (await db.execute(history_stmt)).scalars().all()

    lc_messages = []
    for h in history_records[-11:]:  # 包含刚刚写入的那条
        if h.role == "user":
            lc_messages.append(HumanMessage(content=h.content))
        elif h.role == "assistant":
            lc_messages.append(AIMessage(content=h.content))
        elif h.role == "system":
            lc_messages.append(SystemMessage(content=h.content))

    # 5. 定义 SSE 异步生成器
    async def event_generator():
        yield f"data: {json.dumps({'type': 'start', 'conversation_id': conversation_id, 'title': conv.title}, ensure_ascii=False)}\n\n"

        if not model_config or not model_config.api_key:
            err_msg = (
                "⚠️ 当前空间尚未配置有效的大模型 API Key。\n\n"
                "请点击右上角 **「模型配置」**，填入你的 DeepSeek / OpenAI / DashScope 等供应商 API Key 即可畅享真实对话！"
            )
            # 模拟友好的流式提示给用户
            for word in err_msg:
                yield f"data: {json.dumps({'type': 'chunk', 'content': word}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            # 保存提示消息到历史
            async with AsyncSessionLocal() as session:
                assistant_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=err_msg,
                )
                session.add(assistant_msg)
                await session.commit()

            yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return

        full_content = []
        try:
            chat_model = LLMFactory.get_chat_model(model_config)
            async for chunk in chat_model.astream(lc_messages):
                token = chunk.content
                if isinstance(token, str) and token:
                    full_content.append(token)
                    yield f"data: {json.dumps({'type': 'chunk', 'content': token}, ensure_ascii=False)}\n\n"
                elif isinstance(token, list):
                    # 处理多模态或复杂 block
                    text_parts = [t["text"] for t in token if isinstance(t, dict) and "text" in t]
                    text = "".join(text_parts)
                    if text:
                        full_content.append(text)
                        yield f"data: {json.dumps({'type': 'chunk', 'content': text}, ensure_ascii=False)}\n\n"
        except Exception as e:
            error_tip = f"\n\n[模型调用异常: {str(e)}]"
            full_content.append(error_tip)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"

        # 6. 将完整的 assistant 回复持久化至数据库
        accumulated_text = "".join(full_content)
        if accumulated_text:
            async with AsyncSessionLocal() as session:
                assistant_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=accumulated_text,
                )
                session.add(assistant_msg)
                await session.commit()

        yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
