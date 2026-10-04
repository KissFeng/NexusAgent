import json
import uuid
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
from langchain_core.messages import SystemMessage, HumanMessage

from app.core.database import AsyncSessionLocal
from app.core.qdrant import qdrant_client, MEMORY_COLLECTION_NAME
from app.models.memory import Memory
from app.models.model_provider import ModelConfig
from app.services.embedding_service import EmbeddingService
from app.llm.factory import LLMFactory


EXTRACTION_PROMPT = """你是一个严谨的企业级长期记忆（Long-term Memory）分析抽取引擎。
请从以下【用户最新输入】与【AI助手回复】的交互中，敏锐识别并提取出具有长期持久价值的信息。

【记忆分类准则】：
1. preference: 用户的个人偏好、习惯习惯、技术选型倾向（如：“偏好简洁高内聚代码”、“前端首选 React 19”）；
2. fact: 用户主动透露的客观事实、环境配置、公司业务、组织信息（如：“公司核心业务是跨境电商”、“后端服务运行在 8000 端口”）；
3. episodic: 用户排查所得的深刻教训、技术复盘结论或历史重大决策（如：“排查出 HTTP 代理导致联网搜索超时的事故”）。

【抽取要求】：
- 每一条记忆必须是精炼独立的陈述句（15-60字），包含完整语境主谓宾；
- 过滤掉一次性的临时问题、无意义寒暄、模型自身的通用知识阐述；
- 如果本轮交互没有任何值得持久保存的长期事实或偏好，请返回空数组 []；
- 必须严格输出纯 JSON 格式数组，禁止添加任何 Markdown 解释或多余标记：
[
  {"category": "preference", "content": "用户倾向使用 TypeScript 和 React 19 开发前端", "confidence": 0.95},
  {"category": "fact", "content": "当前系统数据库采用 PostgreSQL 16 并在 8000 端口提供 API", "confidence": 0.9}
]
"""


class MemoryService:
    @classmethod
    async def recall_memories(
        cls,
        user_id: str,
        workspace_id: str,
        query: str,
        top_k: int = 4,
        similarity_threshold: float = 0.35,
    ) -> List[Dict[str, Any]]:
        """
        基于用户输入 query，在 Qdrant 向量库中语义召回当前用户与工作空间相关的长期记忆
        """
        if not query or len(query.strip()) < 2:
            return []

        try:
            query_vector = await EmbeddingService.embed_query(query)
            qdrant_filter = Filter(
                must=[
                    FieldCondition(key="workspace_id", match=MatchValue(value=workspace_id)),
                    FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                ]
            )

            hits = qdrant_client.query_points(
                collection_name=MEMORY_COLLECTION_NAME,
                query=query_vector,
                query_filter=qdrant_filter,
                limit=top_k,
            ).points

            recalled = []
            recalled_ids = []

            for hit in hits:
                if hit.score >= similarity_threshold and hit.payload:
                    recalled.append({
                        "id": str(hit.id),
                        "category": hit.payload.get("category", "fact"),
                        "content": hit.payload.get("content", ""),
                        "score": round(float(hit.score), 4),
                        "confidence": hit.payload.get("confidence", 0.9),
                    })
                    recalled_ids.append(str(hit.id))

            # 异步回写召回次数和时间
            if recalled_ids:
                async with AsyncSessionLocal() as session:
                    now = datetime.now(timezone.utc)
                    for mid in recalled_ids:
                        stmt = select(Memory).where(Memory.id == mid)
                        m = (await session.execute(stmt)).scalar_one_or_none()
                        if m:
                            m.recall_count += 1
                            m.last_recalled_at = now
                    await session.commit()

            return recalled

        except Exception as e:
            print(f"[MemoryService] 记忆语义召回失败: {e}")
            return []

    @classmethod
    async def extract_and_save_memories(
        cls,
        user_id: str,
        workspace_id: str,
        conversation_id: str,
        user_content: str,
        assistant_content: str,
        model_config: ModelConfig,
    ):
        """
        在对话结束后异步调用轻量 LLM 提炼并保存/更新长期记忆
        """
        # 简单过滤超短交互
        if not user_content or len(user_content.strip()) < 6:
            return

        try:
            llm = LLMFactory.get_chat_model(model_config, streaming=False)
            dialogue_text = f"【用户说】：{user_content.strip()}\n\n【AI 回复】：{assistant_content.strip()[:1000]}"
            messages = [
                SystemMessage(content=EXTRACTION_PROMPT),
                HumanMessage(content=dialogue_text),
            ]

            resp = await llm.ainvoke(messages)
            raw_text = resp.content if hasattr(resp, "content") else str(resp)

            # 解析 JSON 数组
            json_match = re.search(r"\[.*\]", raw_text, re.DOTALL)
            if not json_match:
                return

            items = json.loads(json_match.group(0))
            if not isinstance(items, list) or len(items) == 0:
                return

            async with AsyncSessionLocal() as session:
                for item in items:
                    content = str(item.get("content", "")).strip()
                    category = item.get("category", "preference")
                    confidence = float(item.get("confidence", 0.9))

                    if not content or len(content) < 5:
                        continue

                    # 向量化该事实
                    vector = (await EmbeddingService.embed_texts([content]))[0]

                    # 检查是否有相似度极高 (>0.85) 的存量记忆（冲突或更新）
                    qdrant_filter = Filter(
                        must=[
                            FieldCondition(key="workspace_id", match=MatchValue(value=workspace_id)),
                            FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                        ]
                    )
                    similar_hits = qdrant_client.query_points(
                        collection_name=MEMORY_COLLECTION_NAME,
                        query=vector,
                        query_filter=qdrant_filter,
                        limit=1,
                    ).points

                    target_memory_id = None
                    if similar_hits and similar_hits[0].score >= 0.85:
                        # 命中已有相似记忆 -> 执行合并更新 (Consolidation)
                        target_memory_id = str(similar_hits[0].id)
                        stmt = select(Memory).where(Memory.id == target_memory_id)
                        existing_mem = (await session.execute(stmt)).scalar_one_or_none()
                        if existing_mem:
                            existing_mem.content = content
                            existing_mem.category = category
                            existing_mem.confidence = confidence
                            existing_mem.updated_at = datetime.now(timezone.utc)
                    else:
                        # 创建全新记忆
                        new_mem = Memory(
                            workspace_id=workspace_id,
                            user_id=user_id,
                            category=category,
                            content=content,
                            confidence=confidence,
                            source_conversation_id=conversation_id,
                        )
                        session.add(new_mem)
                        await session.flush()
                        target_memory_id = new_mem.id

                    # 同步更新 Qdrant 索引
                    qdrant_client.upsert(
                        collection_name=MEMORY_COLLECTION_NAME,
                        points=[
                            PointStruct(
                                id=target_memory_id,
                                vector=vector,
                                payload={
                                    "user_id": user_id,
                                    "workspace_id": workspace_id,
                                    "category": category,
                                    "content": content,
                                    "confidence": confidence,
                                },
                            )
                        ],
                    )

                await session.commit()

        except Exception as e:
            print(f"[MemoryService] 记忆抽取与持久化异常: {e}")

    @classmethod
    async def list_memories(cls, db: AsyncSession, user_id: str, workspace_id: str) -> List[Memory]:
        stmt = (
            select(Memory)
            .where(Memory.workspace_id == workspace_id, Memory.user_id == user_id)
            .order_by(Memory.recall_count.desc(), Memory.created_at.desc())
        )
        return (await db.execute(stmt)).scalars().all()

    @classmethod
    async def create_memory(
        cls,
        db: AsyncSession,
        user_id: str,
        workspace_id: str,
        category: str,
        content: str,
        confidence: float = 0.9,
    ) -> Memory:
        mem = Memory(
            workspace_id=workspace_id,
            user_id=user_id,
            category=category,
            content=content.strip(),
            confidence=confidence,
        )
        db.add(mem)
        await db.commit()
        await db.refresh(mem)

        # 写入 Qdrant
        try:
            vector = (await EmbeddingService.embed_texts([mem.content]))[0]
            qdrant_client.upsert(
                collection_name=MEMORY_COLLECTION_NAME,
                points=[
                    PointStruct(
                        id=mem.id,
                        vector=vector,
                        payload={
                            "user_id": user_id,
                            "workspace_id": workspace_id,
                            "category": mem.category,
                            "content": mem.content,
                            "confidence": mem.confidence,
                        },
                    )
                ],
            )
        except Exception as e:
            print(f"[MemoryService] 创建记忆写入 Qdrant 失败: {e}")

        return mem

    @classmethod
    async def update_memory(
        cls,
        db: AsyncSession,
        memory_id: str,
        user_id: str,
        workspace_id: str,
        category: Optional[str] = None,
        content: Optional[str] = None,
        confidence: Optional[float] = None,
    ) -> Optional[Memory]:
        stmt = select(Memory).where(
            Memory.id == memory_id,
            Memory.user_id == user_id,
            Memory.workspace_id == workspace_id,
        )
        mem = (await db.execute(stmt)).scalar_one_or_none()
        if not mem:
            return None

        if category is not None:
            mem.category = category
        if content is not None:
            mem.content = content.strip()
        if confidence is not None:
            mem.confidence = confidence

        await db.commit()
        await db.refresh(mem)

        # 同步 Qdrant
        try:
            vector = (await EmbeddingService.embed_texts([mem.content]))[0]
            qdrant_client.upsert(
                collection_name=MEMORY_COLLECTION_NAME,
                points=[
                    PointStruct(
                        id=mem.id,
                        vector=vector,
                        payload={
                            "user_id": user_id,
                            "workspace_id": workspace_id,
                            "category": mem.category,
                            "content": mem.content,
                            "confidence": mem.confidence,
                        },
                    )
                ],
            )
        except Exception as e:
            print(f"[MemoryService] 更新记忆同步 Qdrant 失败: {e}")

        return mem

    @classmethod
    async def delete_memory(cls, db: AsyncSession, memory_id: str, user_id: str, workspace_id: str) -> bool:
        stmt = select(Memory).where(
            Memory.id == memory_id,
            Memory.user_id == user_id,
            Memory.workspace_id == workspace_id,
        )
        mem = (await db.execute(stmt)).scalar_one_or_none()
        if not mem:
            return False

        await db.delete(mem)
        await db.commit()

        # 从 Qdrant 中删除
        try:
            qdrant_client.delete(
                collection_name=MEMORY_COLLECTION_NAME,
                points_selector=[memory_id],
            )
        except Exception as e:
            print(f"[MemoryService] 删除记忆同步 Qdrant 失败: {e}")

        return True
