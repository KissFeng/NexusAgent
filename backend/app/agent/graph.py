import json
from typing import Annotated, Sequence, TypedDict, List, Dict, Any, Optional
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command
from langchain_core.tools import tool

from app.services.retrieval_service import RetrievalService
from app.core.database import AsyncSessionLocal
from app.models.model_provider import ModelConfig
from app.llm.factory import LLMFactory

# Shared in-memory Checkpointer for multi-turn sessions & interrupt resumption
agent_checkpointer = MemorySaver()

def sanitize_for_state(val):
    if isinstance(val, dict):
        return {str(k): sanitize_for_state(v) for k, v in val.items()}
    elif isinstance(val, (list, tuple)):
        return [sanitize_for_state(v) for v in val]
    elif hasattr(val, "item"):
        return val.item()
    elif isinstance(val, float):
        return float(val)
    elif isinstance(val, int):
        return int(val)
    return val

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    workspace_id: str
    kb_ids: Optional[List[str]]
    citations: List[Dict[str, Any]]
    model_config_id: Optional[str]

def create_agent_graph(model_config: ModelConfig, workspace_id: str):
    """
    Constructs a LangGraph StateGraph equipped with:
    - RAG Hybrid Search tool
    - Sensitive action with Human-in-the-Loop Interrupt
    - Session Checkpointing
    """
    # 1. 实例化 LLM 并绑定工具定义
    llm = LLMFactory.get_chat_model(model_config, streaming=True)

    # 2. 定义内部可调用工具
    tools_def = [
        {
            "type": "function",
            "function": {
                "name": "search_knowledge_base",
                "description": "从当前工作空间的知识库中检索相关资料，用于回答业务、文档和专业知识问题。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "检索关键词或查询问题",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "execute_sensitive_action",
                "description": "执行高危敏感操作（如发布全员广播、修改空间全局策略、清理历史数据等）。需要人工安全审批。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action_type": {
                            "type": "string",
                            "description": "操作类型，例如 publish_announcement, update_policy, delete_data",
                        },
                        "target": {
                            "type": "string",
                            "description": "操作目标或受影响对象",
                        },
                        "reason": {
                            "type": "string",
                            "description": "申请执行该操作的原因",
                        },
                    },
                    "required": ["action_type", "target", "reason"],
                },
            },
        },
    ]

    llm_with_tools = llm.bind_tools(tools_def)

    # 3. 核心节点：模型思考与决策
    async def agent_node(state: AgentState):
        messages = list(state["messages"])
        # 确保注入系统人设与溯源标注规范
        sys_prompt = (
            "你是一个企业级 AI 智能体助手。当用户提出具体业务或知识问题时，请优先使用 search_knowledge_base 检索知识库。\n"
            "如果检索到了资料，请严格依据资料作答，并在陈述事实时在句末附上对应的引用序号 [1]、[2] 等以支持溯源。\n"
            "如果用户要求执行敏感管理动作，请调用 execute_sensitive_action 工具。"
        )
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=sys_prompt)] + messages

        response = await llm_with_tools.ainvoke(messages)
        return {"messages": [response]}

    # 4. 核心节点：工具执行与审批挂起 (Human-in-the-Loop)
    async def tools_node(state: AgentState):
        last_message = state["messages"][-1]
        if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
            return {}

        results = []
        new_citations = list(state.get("citations", []))

        for tc in last_message.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            tool_call_id = tc["id"]

            if tool_name == "search_knowledge_base":
                query = tool_args.get("query", "")
                async with AsyncSessionLocal() as session:
                    chunks = await RetrievalService.hybrid_search(
                        db=session,
                        workspace_id=state["workspace_id"],
                        query=query,
                        kb_ids=state.get("kb_ids"),
                        top_k=4,
                        model_config=model_config,
                    )

                if chunks:
                    clean_chunks = sanitize_for_state(chunks)
                    new_citations.extend(clean_chunks)
                    context_lines = []
                    for c in clean_chunks:
                        context_lines.append(f"[{c['source_index']}] 来源文件: {c['filename']}\n内容: {c['content']}\n")
                    content = "\n".join(context_lines)
                else:
                    content = "知识库中未找到与此相关的参考内容。"

                results.append(ToolMessage(tool_call_id=tool_call_id, content=content))

            elif tool_name == "execute_sensitive_action":
                # 触发 LangGraph 原生中断：挂起等待人工决策
                approval_payload = {
                    "action_type": tool_args.get("action_type"),
                    "target": tool_args.get("target"),
                    "reason": tool_args.get("reason"),
                    "tool_call_id": tool_call_id,
                }
                # interrupt 会立即暂停当前 Graph 的流转并向客户端返回
                decision = interrupt(approval_payload)

                if isinstance(decision, dict) and decision.get("approved"):
                    res_content = f"✅ 操作已获得人工审批通过并成功执行：[{tool_args.get('action_type')}] 目标: {tool_args.get('target')}"
                else:
                    reason = decision.get("reason", "管理员拒绝了此操作") if isinstance(decision, dict) else "已驳回"
                    res_content = f"❌ 操作已被人工驳回：{reason}"

                results.append(ToolMessage(tool_call_id=tool_call_id, content=res_content))

        return {"messages": results, "citations": sanitize_for_state(new_citations)}

    # 5. 条件路由
    def should_continue(state: AgentState) -> str:
        last_message = state["messages"][-1]
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            return "tools"
        return END

    # 6. 构建状态图
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", tools_node)

    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges("agent", should_continue, ["tools", END])
    workflow.add_edge("tools", "agent")

    return workflow.compile(checkpointer=agent_checkpointer)
