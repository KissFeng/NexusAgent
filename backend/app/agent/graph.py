import json
from typing import Annotated, Sequence, TypedDict, List, Dict, Any, Optional
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command
from sqlalchemy import select

from app.services.retrieval_service import RetrievalService
from app.services.tool_executor import ToolExecutor
from app.services.memory_service import MemoryService
from app.services.subagent_service import SubagentService
from app.core.database import AsyncSessionLocal
from app.models.model_provider import ModelConfig
from app.models.skill import Skill
from app.models.tool import ToolConfig
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
    user_id: Optional[str]
    kb_ids: Optional[List[str]]
    citations: List[Dict[str, Any]]
    model_config_id: Optional[str]
    skill_code: Optional[str]


def create_agent_graph(model_config: ModelConfig, workspace_id: str):
    """
    Constructs a LangGraph StateGraph equipped with:
    - RAG Hybrid Search tool
    - Web Search (DuckDuckGo 联网检索)
    - Code Interpreter (Python 代码沙箱)
    - Sensitive action with Human-in-the-Loop Interrupt
    - Skill 专家技能动态注入
    - Session Checkpointing
    """
    # 1. 实例化 LLM
    llm = LLMFactory.get_chat_model(model_config, streaming=True)

    # 2. 定义工具集规范
    tools_def = [
        {
            "type": "function",
            "function": {
                "name": "search_knowledge_base",
                "description": "从当前工作空间的知识库中检索私有业务资料、文档和简历等内部知识。",
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
                "name": "web_search",
                "description": "通过搜索引擎查询互联网公开实时信息、新闻、官方文档和外部公开数据。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "搜索关键词",
                        }
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "code_interpreter",
                "description": "安全执行 Python 代码片段并返回运行结果，适用于精确数学计算、统计分析与算法模拟。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "要执行的合法 Python 代码",
                        }
                    },
                    "required": ["code"],
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
        {
            "type": "function",
            "function": {
                "name": "delegate_subtask",
                "description": "显式委派子任务给专项子智能体（如 research 深度调研、coding 代码沙箱构建、review 架构安全审计）。用于复杂、多步骤大任务的拆解分治。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "subagent_type": {
                            "type": "string",
                            "enum": ["research", "coding", "review"],
                            "description": "子智能体类型: research (深度调研), coding (代码编写与测试), review (质量与安全评审)",
                        },
                        "instruction": {
                            "type": "string",
                            "description": "委派给该子智能体的具体任务目标与执行要求",
                        },
                        "context": {
                            "type": "string",
                            "description": "传递给子智能体的背景资料或约束",
                        },
                    },
                    "required": ["subagent_type", "instruction"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "call_mcp_tool",
                "description": "调用外部 Model Context Protocol (MCP) 服务所提供的工具。输入端点 server_url、工具名称 tool_name 与参数字典 arguments。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_url": {
                            "type": "string",
                            "description": "目标 MCP Server 端点 URL，例如 http://127.0.0.1:8000/api/v1/tools/mcp-mock",
                        },
                        "tool_name": {
                            "type": "string",
                            "description": "要调用的 MCP 远程工具名称，如 fetch_city_weather, query_inventory_db",
                        },
                        "arguments": {
                            "type": "object",
                            "description": "传递给该 MCP 工具的参数键值对",
                        },
                    },
                    "required": ["server_url", "tool_name"],
                },
            },
        },
    ]

    llm_with_tools = llm.bind_tools(tools_def)

    # 3. 核心节点：模型思考与技能注入
    async def agent_node(state: AgentState):
        messages = list(state["messages"])
        sys_prompt = (
            "你是一个企业级 AI 智能体助手。\n"
            "1. 当用户提出业务或内部知识问题时，请优先使用 search_knowledge_base 检索企业知识库，严格依据资料作答并在句末标注 [1]、[2] 引用；\n"
            "2. 当需要获取实时资讯、外部最新数据或公共知识时，使用 web_search 联网检索；\n"
            "3. 当需要精确数学计算、数据处理或运行脚本时，使用 code_interpreter 执行 Python 代码；\n"
            "4. 如果用户要求执行敏感管理动作，调用 execute_sensitive_action 工具触发审批；\n"
            "5. 当任务庞大、涉及深度调研、编写测试或安全评审时，主动调用 delegate_subtask 将子任务委派给专门的子智能体分工完成；\n"
            "6. 当需要使用空间配置的外部 MCP (Model Context Protocol) 协议服务时，调用 call_mcp_tool 远程执行工具。"
        )

        # 检查是否激活专业技能 (Skill)
        skill_code = state.get("skill_code")
        if skill_code:
            async with AsyncSessionLocal() as session:
                stmt = select(Skill).where(
                    Skill.workspace_id == state["workspace_id"],
                    Skill.code == skill_code.strip().lower(),
                    Skill.is_enabled == True,
                )
                skill = (await session.execute(stmt)).scalar_one_or_none()
                if skill:
                    sys_prompt = (
                        f"【当前激活专业技能: {skill.name} (/{skill.code})】\n"
                        f"{skill.system_prompt}\n\n"
                        f"【系统全局准则】:\n{sys_prompt}"
                    )

        # 语义召回长期记忆 (Long-Term Memory)
        user_id = state.get("user_id")
        if user_id:
            user_query = ""
            for m in reversed(messages):
                if isinstance(m, HumanMessage) and m.content:
                    user_query = str(m.content)
                    break
            if user_query:
                recalled = await MemoryService.recall_memories(
                    user_id=user_id,
                    workspace_id=state["workspace_id"],
                    query=user_query,
                    top_k=3,
                )
                if recalled:
                    mem_lines = [f"- [{r['category']}] {r['content']}" for r in recalled]
                    sys_prompt += (
                        "\n\n【用户长期记忆与习惯偏好 (Long-Term Memory)】:\n"
                        "系统已检索到与当前用户/任务强相关的历史事实与偏好，请在回答时主动契合以下偏好并基于已知事实作答：\n"
                        + "\n".join(mem_lines)
                    )

        # 动态加载工作空间已启用的 MCP 协议服务
        async with AsyncSessionLocal() as session:
            stmt = select(ToolConfig).where(
                ToolConfig.workspace_id == state["workspace_id"],
                ToolConfig.is_enabled == True,
            )
            workspace_tools = (await session.execute(stmt)).scalars().all()
            if workspace_tools:
                mcp_lines = []
                for wt in workspace_tools:
                    if wt.tool_type == "mcp_server":
                        try:
                            cfg = json.loads(wt.config_json) if wt.config_json else {}
                        except Exception:
                            cfg = {}
                        url = cfg.get("server_url") or cfg.get("url") or "http://127.0.0.1:8000/api/v1/tools/mcp-mock"
                        mcp_lines.append(f"- MCP 服务: {wt.name} | 端点: {url} | 功能描述: {wt.description}")
                if mcp_lines:
                    sys_prompt += (
                        "\n\n【空间已挂载的外部 MCP 协议服务 (Model Context Protocol)】:\n"
                        + "\n".join(mcp_lines)
                        + "\n当用户需求涉及上述 MCP 服务领域时，请调用 call_mcp_tool 工具并传入端点 server_url 与 tool_name 进行远程调用。"
                    )

        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=sys_prompt)] + messages
        else:
            messages[0] = SystemMessage(content=sys_prompt)

        response = await llm_with_tools.ainvoke(messages)
        return {"messages": [response]}

    # 4. 核心节点：多工具协同分发与审批挂起 (Human-in-the-Loop)
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

            elif tool_name == "web_search":
                query = tool_args.get("query", "")
                content = await ToolExecutor.execute_web_search(query)
                results.append(ToolMessage(tool_call_id=tool_call_id, content=content))

            elif tool_name == "code_interpreter":
                code = tool_args.get("code", "")
                content = ToolExecutor.execute_python_code(code)
                results.append(ToolMessage(tool_call_id=tool_call_id, content=content))

            elif tool_name == "execute_sensitive_action":
                approval_payload = {
                    "action_type": tool_args.get("action_type"),
                    "target": tool_args.get("target"),
                    "reason": tool_args.get("reason"),
                    "tool_call_id": tool_call_id,
                }
                decision = interrupt(approval_payload)

                if isinstance(decision, dict) and decision.get("approved"):
                    res_content = f"✅ 操作已获得人工审批通过并成功执行：[{tool_args.get('action_type')}] 目标: {tool_args.get('target')}"
                else:
                    reason = decision.get("reason", "管理员拒绝了此操作") if isinstance(decision, dict) else "已驳回"
                    res_content = f"❌ 操作已被人工驳回：{reason}"

                results.append(ToolMessage(tool_call_id=tool_call_id, content=res_content))

            elif tool_name == "delegate_subtask":
                subagent_type = tool_args.get("subagent_type", "research")
                instruction = tool_args.get("instruction", "")
                context = tool_args.get("context", "")
                res_content = await SubagentService.run_delegated_task(
                    subagent_type=subagent_type,
                    instruction=instruction,
                    context=context,
                    model_config=model_config,
                )
                results.append(ToolMessage(tool_call_id=tool_call_id, content=res_content))

            elif tool_name == "call_mcp_tool":
                server_url = tool_args.get("server_url", "")
                mcp_tool_name = tool_args.get("tool_name", "")
                arguments = tool_args.get("arguments", {})

                cfg_headers = None
                cfg_defaults = None
                cfg_protocol = "auto"
                async with AsyncSessionLocal() as session:
                    stmt = select(ToolConfig).where(
                        ToolConfig.workspace_id == state["workspace_id"],
                        ToolConfig.tool_type == "mcp_server",
                        ToolConfig.is_enabled == True,
                    )
                    mcp_cfgs = (await session.execute(stmt)).scalars().all()
                    for mc in mcp_cfgs:
                        try:
                            c = json.loads(mc.config_json) if mc.config_json else {}
                        except Exception:
                            c = {}
                        if c.get("server_url") == server_url or c.get("url") == server_url:
                            cfg_headers = c.get("headers")
                            cfg_defaults = c.get("default_params")
                            cfg_protocol = c.get("protocol", "auto")
                            break

                content = await ToolExecutor.execute_mcp_tool(
                    server_url=server_url,
                    tool_name=mcp_tool_name,
                    arguments=arguments,
                    headers=cfg_headers,
                    default_params=cfg_defaults,
                    protocol=cfg_protocol,
                )
                results.append(ToolMessage(tool_call_id=tool_call_id, content=content))

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
