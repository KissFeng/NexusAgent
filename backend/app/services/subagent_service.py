from typing import Dict, Any, Optional
from langchain_core.messages import HumanMessage, SystemMessage

from app.models.model_provider import ModelConfig
from app.llm.factory import LLMFactory
from app.services.tool_executor import ToolExecutor


class SubagentService:
    SUBAGENT_ROLES = {
        "research": {
            "name": "深度调研子智能体 (Research Subagent)",
            "system_prompt": (
                "你是一名专注行业与技术深度调研的专项子智能体。\n"
                "职责：结合联网检索与企业资料，对主管智能体指派的特定课题展开穷尽式调研。\n"
                "输出准则：必须结论先行、数据详实、提炼结构化事实，去除冗余套话。"
            ),
        },
        "coding": {
            "name": "代码沙箱验证子智能体 (Code Subagent)",
            "system_prompt": (
                "你是一名专注高质量代码编写与沙箱验证的专项子智能体。\n"
                "职责：针对主管指派的算法、数据处理或工程模块编写严谨代码，并通过沙箱模拟验证边界情况。\n"
                "输出准则：给出完整无缺陷的落地代码并附带执行结果说明。"
            ),
        },
        "review": {
            "name": "质量与安全审计子智能体 (Reviewer Subagent)",
            "system_prompt": (
                "你是一名具备严苛标准的架构安全与代码评审子智能体。\n"
                "职责：针对方案或代码进行并发锁竞争、越权注入、内存泄露与异常恢复的极限压力排查。\n"
                "输出准则：清晰标记缺陷等级（P0/P1/P2），并给出防御性修复建议。"
            ),
        },
    }

    @classmethod
    async def run_delegated_task(
        cls,
        subagent_type: str,
        instruction: str,
        context: Optional[str] = None,
        model_config: Optional[ModelConfig] = None,
    ) -> str:
        """
        执行主管智能体显式委派的独立子任务 (Supervisor-Worker 模式)
        """
        role_type = subagent_type.lower().strip()
        role = cls.SUBAGENT_ROLES.get(role_type, cls.SUBAGENT_ROLES["research"])

        if not model_config or not model_config.api_key:
            return f"❌ 无法委派子智能体: 当前工作区尚未配置有效模型。"

        llm = LLMFactory.get_chat_model(model_config, streaming=False)

        # 辅助数据前置准备
        augmented_context = context or "无额外上下文"
        if role_type == "research":
            # 调研子智能体自主触发实时检索辅助
            search_query = instruction[:50]
            web_data = await ToolExecutor.execute_web_search(search_query, max_results=3)
            augmented_context += f"\n\n{web_data}"

        task_prompt = (
            f"【子任务指令】：\n{instruction}\n\n"
            f"【输入上下文背景】：\n{augmented_context}\n\n"
            f"请严格依据你的角色规范完成此任务，并向主管智能体汇报清晰、凝练的执行成果。"
        )

        messages = [
            SystemMessage(content=f"【你当前被激活为：{role['name']}】\n{role['system_prompt']}"),
            HumanMessage(content=task_prompt),
        ]

        try:
            resp = await llm.ainvoke(messages)
            content = resp.content if hasattr(resp, "content") else str(resp)
            return (
                f"✅【子任务委派执行完成 · 汇报来自: {role['name']}】\n\n"
                f"{content.strip()}"
            )
        except Exception as e:
            return f"❌【子任务委派执行异常】: {str(e)}"
