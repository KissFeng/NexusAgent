import json
import asyncio
from typing import Annotated, List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.types import Command

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
from app.agent.graph import create_agent_graph
from app.services.skill_service import SkillService
from app.services.memory_service import MemoryService

router = APIRouter(prefix="", tags=["Chat & Agent"])

def extract_message_text(content: Any) -> str:
    """
    Safely extracts string content from diverse LLM chunk formats:
    - Pure string: "text"
    - List of dicts (OpenAI / Anthropic / GPT-4o structured blocks): [{'type': 'text', 'text': '...'}]
    - List of strings: ["text1", "text2"]
    """
    if isinstance(content, str):
        return content
    elif isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if "text" in item and isinstance(item["text"], str):
                    parts.append(item["text"])
                elif item.get("type") == "text" and "text" in item:
                    parts.append(str(item["text"]))
        return "".join(parts)
    return ""

class ApprovalRequest(BaseModel):
    conversation_id: str
    approved: bool
    reason: Optional[str] = None
    model_config_id: Optional[str] = None

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

    # 3. 确定模型配置
    target_model_id = req.model_config_id or conv.model_config_id
    model_config = None
    if target_model_id:
        m_stmt = select(ModelConfig).where(
            ModelConfig.id == target_model_id,
            ModelConfig.workspace_id == workspace.id,
        )
        model_config = (await db.execute(m_stmt)).scalar_one_or_none()

    if not model_config:
        m_stmt = (
            select(ModelConfig)
            .where(ModelConfig.workspace_id == workspace.id)
            .order_by(ModelConfig.is_default.desc(), ModelConfig.created_at.asc())
        )
        model_config = (await db.execute(m_stmt)).scalars().first()

    # 提取用户 Slash 技能指令或入参传入的技能
    slash_skill, pure_content = SkillService.parse_slash_skill(req.content)
    active_skill_code = req.skill_code or slash_skill
    effective_content = pure_content if slash_skill else req.content

    async def event_generator():
        start_payload = {
            'type': 'start',
            'conversation_id': conversation_id,
            'title': conv.title,
            'skill_code': active_skill_code,
        }
        yield f"data: {json.dumps(start_payload, ensure_ascii=False)}\n\n"

        if not model_config or not model_config.api_key:
            err_msg = (
                "⚠️ 当前空间尚未配置有效的大模型 API Key。\n\n"
                "请点击右上角 **「模型配置」** 填入 DeepSeek / OpenAI / 通义千问 Key，即可体验完整的 LangGraph 智能体与 RAG 检索！"
            )
            for word in err_msg:
                yield f"data: {json.dumps({'type': 'chunk', 'content': word}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

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

        # 编译 LangGraph
        graph = create_agent_graph(model_config, workspace.id)
        config = {"configurable": {"thread_id": conversation_id}}

        initial_state = {
            "messages": [HumanMessage(content=effective_content)],
            "workspace_id": workspace.id,
            "user_id": user.id,
            "kb_ids": None,
            "citations": [],
            "model_config_id": model_config.id,
            "skill_code": active_skill_code,
        }

        full_content = []
        full_thinking = []
        emitted_citations = set()
        emitted_tool_calls = set()

        try:
            # 流式监听图执行过程中的事件
            async for event in graph.astream(initial_state, config=config, stream_mode=["messages", "updates"]):
                mode, payload = event
                if mode == "messages":
                    chunk, meta = payload

                    # 1. 检查模型是否有 thinking / reasoning 流 (DeepSeek-R1, SiliconFlow, 兼容端点)
                    if hasattr(chunk, "additional_kwargs") and chunk.additional_kwargs:
                        reasoning_delta = chunk.additional_kwargs.get("reasoning_content")
                        if reasoning_delta:
                            full_thinking.append(str(reasoning_delta))
                            yield f"data: {json.dumps({'type': 'thinking_chunk', 'content': str(reasoning_delta)}, ensure_ascii=False)}\n\n"

                    # 2. 检查普通消息 Token
                    if isinstance(chunk, AIMessage) and chunk.content:
                        text = extract_message_text(chunk.content)
                        if text:
                            full_content.append(text)
                            yield f"data: {json.dumps({'type': 'chunk', 'content': text}, ensure_ascii=False)}\n\n"

                elif mode == "updates":
                    # 3. 检查智能体是否发起了工具调用
                    if "agent" in payload:
                        agent_data = payload["agent"]
                        for m in agent_data.get("messages", []):
                            if hasattr(m, "tool_calls") and m.tool_calls:
                                for tc in m.tool_calls:
                                    t_id = tc.get("id") or f"{tc.get('name')}-{len(emitted_tool_calls)}"
                                    if t_id not in emitted_tool_calls:
                                        emitted_tool_calls.add(t_id)
                                        yield f"data: {json.dumps({'type': 'tool_call', 'tool_id': t_id, 'tool_name': tc.get('name'), 'args': tc.get('args', {}), 'status': 'running'}, ensure_ascii=False)}\n\n"

                    # 4. 检查工具节点执行结果
                    if "tools" in payload:
                        tool_data = payload["tools"]
                        for tm in tool_data.get("messages", []):
                            yield f"data: {json.dumps({'type': 'tool_result', 'tool_id': getattr(tm, 'tool_call_id', None), 'tool_name': getattr(tm, 'name', None), 'content': str(tm.content), 'status': 'completed'}, ensure_ascii=False)}\n\n"

                        citations = tool_data.get("citations", [])
                        for c in citations:
                            point_id = c.get("point_id")
                            if point_id not in emitted_citations:
                                emitted_citations.add(point_id)
                                yield f"data: {json.dumps({'type': 'citation', 'citation': c}, ensure_ascii=False)}\n\n"

            # 检查图是否触发了 interrupt 挂起（审批等待）
            snapshot = graph.get_state(config)
            if snapshot.next and "tools" in snapshot.next:
                for task in snapshot.tasks:
                    if task.interrupts:
                        for inter in task.interrupts:
                            approval_info = inter.value
                            yield f"data: {json.dumps({'type': 'approval_required', 'approval': approval_info, 'conversation_id': conversation_id}, ensure_ascii=False)}\n\n"

            # 双重保底：如果流式传输由于结构化消息未能捕获到 token，从 snapshot 提取最终 AIMessage
            accumulated_text = "".join(full_content).strip()
            if not accumulated_text and snapshot.values and "messages" in snapshot.values:
                for m in reversed(snapshot.values["messages"]):
                    if isinstance(m, AIMessage) and m.content:
                        fallback = extract_message_text(m.content)
                        if fallback and not getattr(m, "tool_calls", None):
                            accumulated_text = fallback
                            full_content.append(fallback)
                            yield f"data: {json.dumps({'type': 'chunk', 'content': fallback}, ensure_ascii=False)}\n\n"
                            break

        except Exception as e:
            err_tip = f"\n\n[Agent 执行异常: {str(e)}]"
            full_content.append(err_tip)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"

        # 持久化最终的 assistant 回复 (若有思考过程则整合持久化)
        final_answer = "".join(full_content).strip()
        raw_thinking = "".join(full_thinking).strip()

        persisted_content = final_answer
        if raw_thinking and "<think>" not in final_answer:
            persisted_content = f"<think>\n{raw_thinking}\n</think>\n\n{final_answer}"

        if persisted_content:
            async with AsyncSessionLocal() as session:
                assistant_msg = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=persisted_content,
                )
                session.add(assistant_msg)
                await session.commit()

            if model_config and model_config.api_key:
                # 异步后台提炼与沉淀长期记忆 (非阻塞执行)
                asyncio.create_task(
                    MemoryService.extract_and_save_memories(
                        user_id=user.id,
                        workspace_id=workspace.id,
                        conversation_id=conversation_id,
                        user_content=effective_content,
                        assistant_content=final_answer,
                        model_config=model_config,
                    )
                )

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

@router.post("/chat/approve")
async def approve_action(
    req: ApprovalRequest,
    user: Annotated[User, Depends(get_current_user)],
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    conv_stmt = select(Conversation).where(
        Conversation.id == req.conversation_id,
        Conversation.workspace_id == workspace.id,
    )
    conv = (await db.execute(conv_stmt)).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")

    m_stmt = select(ModelConfig).where(
        ModelConfig.workspace_id == workspace.id
    ).order_by(ModelConfig.is_default.desc())
    model_config = (await db.execute(m_stmt)).scalars().first()

    graph = create_agent_graph(model_config, workspace.id)
    config = {"configurable": {"thread_id": req.conversation_id}}

    resume_command = Command(resume={"approved": req.approved, "reason": req.reason})

    async def event_generator():
        yield f"data: {json.dumps({'type': 'start', 'conversation_id': req.conversation_id, 'title': conv.title}, ensure_ascii=False)}\n\n"
        full_content = []

        try:
            async for event in graph.astream(resume_command, config=config, stream_mode=["messages", "updates"]):
                mode, payload = event
                if mode == "messages":
                    chunk, meta = payload
                    if isinstance(chunk, AIMessage) and chunk.content:
                        text = extract_message_text(chunk.content)
                        if text:
                            full_content.append(text)
                            yield f"data: {json.dumps({'type': 'chunk', 'content': text}, ensure_ascii=False)}\n\n"
        except Exception as e:
            err_tip = f"\n\n[恢复执行异常: {str(e)}]"
            full_content.append(err_tip)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"

        accumulated_text = "".join(full_content).strip()
        if accumulated_text:
            async with AsyncSessionLocal() as session:
                assistant_msg = Message(
                    conversation_id=req.conversation_id,
                    role="assistant",
                    content=accumulated_text,
                )
                session.add(assistant_msg)
                await session.commit()

        yield f"data: {json.dumps({'type': 'done', 'conversation_id': req.conversation_id}, ensure_ascii=False)}\n\n"
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
