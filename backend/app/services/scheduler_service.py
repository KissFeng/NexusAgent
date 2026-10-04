import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from langchain_core.messages import HumanMessage
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.governance import ScheduledTask, AuditLog
from app.models.model_provider import ModelConfig
from app.models.workspace import Workspace
from app.models.chat import Conversation, Message
from app.agent.graph import create_agent_graph
from app.services.feishu_service import FeishuService
from app.services.usage_service import UsageService
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

# 全局单例异步调度器
scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")


class SchedulerService:
    @staticmethod
    def start_scheduler():
        """启动 APScheduler 定时引擎"""
        if not scheduler.running:
            scheduler.start()
            logger.info("APScheduler AsyncIO engine started successfully.")

    @staticmethod
    def shutdown_scheduler():
        """优雅关闭调度器"""
        if scheduler.running:
            scheduler.shutdown(wait=False)
            logger.info("APScheduler AsyncIO engine shutdown.")

    @staticmethod
    async def load_all_jobs_from_db():
        """服务启动时，从数据库恢复所有启用的定时任务"""
        async with AsyncSessionLocal() as db:
            stmt = select(ScheduledTask).where(ScheduledTask.is_enabled == True)
            res = await db.execute(stmt)
            tasks = res.scalars().all()
            for task in tasks:
                try:
                    SchedulerService.register_job(task)
                    logger.info(f"Loaded scheduled job [{task.name}] ({task.cron_expression})")
                except Exception as e:
                    logger.error(f"Failed to register job [{task.name}]: {e}")

    @staticmethod
    def register_job(task: ScheduledTask):
        """将单个任务注册到调度器"""
        job_id = f"task_{task.id}"
        # 先移除已存在的同名 job
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)

        if not task.is_enabled:
            return

        trigger = CronTrigger.from_crontab(task.cron_expression, timezone="Asia/Shanghai")
        scheduler.add_job(
            func=SchedulerService.execute_task_wrapper,
            trigger=trigger,
            id=job_id,
            args=[task.id],
            replace_existing=True,
            misfire_grace_time=300,
        )

    @staticmethod
    def remove_job(task_id: str):
        """从调度器中移除任务"""
        job_id = f"task_{task_id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)

    @staticmethod
    async def execute_task_wrapper(task_id: str):
        """调度器触发执行入口包装器"""
        await SchedulerService.execute_task(task_id)

    @staticmethod
    async def execute_task(task_id: str) -> Dict[str, Any]:
        """执行单个定时 Agent 任务核心逻辑"""
        start_time = time.time()
        logger.info(f"Executing scheduled agent task: {task_id}")

        async with AsyncSessionLocal() as db:
            # 1. 查询任务信息
            stmt = select(ScheduledTask).where(ScheduledTask.id == task_id)
            res = await db.execute(stmt)
            task = res.scalar_one_or_none()
            if not task:
                logger.error(f"Scheduled task {task_id} not found.")
                return {"success": False, "error": "Task not found"}

            task.last_status = "running"
            await db.commit()

            try:
                # 2. 检查配额
                await UsageService.check_quota(task.workspace_id, db)

                # 3. 获取绑定的模型
                model_stmt = select(ModelConfig).where(ModelConfig.workspace_id == task.workspace_id)
                if task.model_config_id:
                    model_stmt = select(ModelConfig).where(ModelConfig.id == task.model_config_id)
                model_res = await db.execute(model_stmt)
                model_config = model_res.scalars().first()

                if not model_config:
                    raise ValueError("未找到可用的大模型配置，请先在空间中配置模型。")

                # 4. 构建 Agent 状态图
                graph = create_agent_graph(model_config=model_config, workspace_id=task.workspace_id)

                state = {
                    "messages": [HumanMessage(content=task.prompt)],
                    "workspace_id": task.workspace_id,
                    "user_id": task.creator_id,
                    "kb_ids": [],
                    "citations": [],
                    "model_config_id": model_config.id,
                    "skill_code": task.skill_code,
                }
                config = {"configurable": {"thread_id": f"sched_{task.id}_{int(start_time)}"}}

                # 5. 执行推理
                output_state = await graph.ainvoke(state, config=config)
                final_messages = output_state.get("messages", [])
                final_content = ""
                for msg in reversed(final_messages):
                    if hasattr(msg, "content") and msg.content and not getattr(msg, "tool_calls", None):
                        final_content = str(msg.content)
                        break

                if not final_content and final_messages:
                    final_content = str(final_messages[-1].content)

                latency_ms = int((time.time() - start_time) * 1000)

                # 6. 计算 Token 并写入 TokenUsage
                prompt_tokens = max(len(task.prompt) // 2, 10)
                completion_tokens = max(len(final_content) // 2, 10)
                await UsageService.record_usage(
                    db=db,
                    workspace_id=task.workspace_id,
                    user_id=task.creator_id,
                    model_name=model_config.model_name,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    latency_ms=latency_ms,
                )

                # 7. 派发结果到目标渠道
                delivery_status = "delivered"
                if task.channel_type in ("feishu", "wecom") and task.target_id:
                    # target_id 可以是 webhook_url
                    pushed = await FeishuService.send_webhook_bot(
                        channel_type=task.channel_type,
                        webhook_url=task.target_id,
                        text_content=f"【定时智能体播报: {task.name}】\n\n{final_content}",
                    )
                    delivery_status = "pushed_to_webhook" if pushed else "push_failed"

                # 同时也写入系统内部会话，方便在网页端回溯
                task_conv = Conversation(
                    workspace_id=task.workspace_id,
                    user_id=task.creator_id or "system",
                    title=f"[定时任务] {task.name}",
                )
                db.add(task_conv)
                await db.flush()

                db.add(Message(
                    conversation_id=task_conv.id,
                    sender="user",
                    content=task.prompt,
                ))
                db.add(Message(
                    conversation_id=task_conv.id,
                    sender="agent",
                    content=final_content,
                ))

                # 8. 更新任务成功状态
                task.last_status = "success"
                task.last_run_at = datetime.now(timezone.utc)
                task.last_error = None
                await db.commit()

                # 9. 记录审计日志
                await AuditService.log_action(
                    db=db,
                    workspace_id=task.workspace_id,
                    user_id=task.creator_id,
                    action="schedule.execute",
                    resource_type="scheduled_task",
                    resource_id=task.id,
                    status="success",
                    details={"task_name": task.name, "latency_ms": latency_ms, "delivery": delivery_status},
                )

                logger.info(f"Scheduled task {task.name} executed successfully in {latency_ms}ms.")
                return {"success": True, "task_id": task.id, "content": final_content, "latency_ms": latency_ms}

            except Exception as e:
                logger.error(f"Scheduled task {task_id} failed: {e}", exc_info=True)
                task.last_status = "failed"
                task.last_run_at = datetime.now(timezone.utc)
                task.last_error = str(e)
                await db.commit()

                await AuditService.log_action(
                    db=db,
                    workspace_id=task.workspace_id,
                    user_id=task.creator_id,
                    action="schedule.execute",
                    resource_type="scheduled_task",
                    resource_id=task.id,
                    status="failed",
                    details={"error": str(e)},
                )
                return {"success": False, "error": str(e)}
