import jieba
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from rank_bm25 import BM25Okapi
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny

from app.core.qdrant import qdrant_client, COLLECTION_NAME
from app.models.knowledge import DocumentChunk
from app.services.embedding_service import EmbeddingService
from app.models.model_provider import ModelConfig

# 常见无实义单字停用词表，避免干扰关键词打分
STOP_WORDS = set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
    "没有", "看", "好", "自己", "这", "那", "么", "吗", "呢", "吧", "啊"
])


class RetrievalService:
    @classmethod
    async def hybrid_search(
        cls,
        db: AsyncSession,
        workspace_id: str,
        query: str,
        kb_ids: Optional[List[str]] = None,
        top_k: int = 4,
        model_config: Optional[ModelConfig] = None,
    ) -> List[Dict[str, Any]]:
        """
        高召回率双路混合检索：
        1. Dense 语义向量检索 (SiliconFlow BAAI/bge-m3 + Qdrant Cosine Similarity)
        2. Sparse 稀疏关键词检索 (Jieba 分词 + BM25Okapi 精确词频匹配)
        3. 自适应加权融合 (Calibrated Hybrid Fusion): 将 Cosine 相似度与 BM25 分数科学归一化，
           彻底消除未归一化 RRF 导致的得分过低 (如 0.0164) 的视觉与阈值问题。
        """
        limit_candidates = max(top_k * 3, 10)

        # -------------------------------------------------------------
        # 1. 密集向量检索 (Dense Semantic Search)
        # -------------------------------------------------------------
        query_vector = await EmbeddingService.embed_query(query, model_config)

        qdrant_conditions = [
            FieldCondition(key="workspace_id", match=MatchValue(value=workspace_id))
        ]
        if kb_ids:
            qdrant_conditions.append(
                FieldCondition(key="knowledge_base_id", match=MatchAny(any=kb_ids))
            )

        qdrant_filter = Filter(must=qdrant_conditions)

        dense_response = qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            query_filter=qdrant_filter,
            limit=limit_candidates,
        )

        dense_scores_map: Dict[str, float] = {}
        dense_rank_map: Dict[str, int] = {}
        point_payload_map: Dict[str, Dict[str, Any]] = {}

        for rank, hit in enumerate(dense_response.points):
            point_id = str(hit.id)
            # Qdrant 返回 Cosine 相似度分值，通常在 -1 到 1 之间
            raw_cosine = float(hit.score) if hit.score is not None else 0.0
            dense_scores_map[point_id] = float(max(0.0, min(1.0, raw_cosine)))
            dense_rank_map[point_id] = int(rank + 1)
            point_payload_map[point_id] = hit.payload or {}

        # -------------------------------------------------------------
        # 2. 稀疏关键词检索 (Sparse Keyword Search via Jieba + BM25)
        # -------------------------------------------------------------
        from app.models.knowledge import Document
        chunk_stmt = (
            select(DocumentChunk, Document.filename)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(DocumentChunk.workspace_id == workspace_id)
        )
        if kb_ids:
            chunk_stmt = chunk_stmt.where(DocumentChunk.knowledge_base_id.in_(kb_ids))

        chunk_rows = (await db.execute(chunk_stmt)).all()
        all_chunks = [r[0] for r in chunk_rows]
        chunk_filenames = {r[0].qdrant_point_id: r[1] for r in chunk_rows}

        sparse_scores_map: Dict[str, float] = {}
        sparse_rank_map: Dict[str, int] = {}

        if all_chunks:
            # 语料库中文分词
            corpus_tokens = [
                [token for token in jieba.cut_for_search(c.content.lower()) if token.strip()]
                for c in all_chunks
            ]
            bm25 = BM25Okapi(corpus_tokens)

            # 查询 query 中文分词并过滤停用词
            raw_query_tokens = [t.strip().lower() for t in jieba.cut_for_search(query) if t.strip()]
            query_tokens = [t for t in raw_query_tokens if t not in STOP_WORDS]
            if not query_tokens:
                query_tokens = raw_query_tokens

            if query_tokens:
                raw_bm25_scores = bm25.get_scores(query_tokens)
                max_bm25 = float(max(raw_bm25_scores)) if len(raw_bm25_scores) > 0 and max(raw_bm25_scores) > 0 else 1.0

                scored_indices = sorted(
                    range(len(raw_bm25_scores)),
                    key=lambda i: raw_bm25_scores[i],
                    reverse=True,
                )

                sparse_rank = 1
                for idx in scored_indices[:limit_candidates]:
                    raw_s = float(raw_bm25_scores[idx])
                    if raw_s > 0.01:
                        c = all_chunks[idx]
                        pid = c.qdrant_point_id
                        norm_s = float(min(1.0, raw_s / max_bm25))
                        sparse_scores_map[pid] = norm_s
                        sparse_rank_map[pid] = int(sparse_rank)
                        sparse_rank += 1

                        if pid not in point_payload_map:
                            point_payload_map[pid] = {
                                "content": c.content,
                                "document_id": c.document_id,
                                "knowledge_base_id": c.knowledge_base_id,
                                "chunk_index": c.chunk_index,
                                "filename": chunk_filenames.get(pid, "文档"),
                            }

        # -------------------------------------------------------------
        # 3. 科学混合打分融合 (Calibrated Hybrid Fusion)
        # -------------------------------------------------------------
        all_candidate_pids = set(dense_scores_map.keys()).union(set(sparse_scores_map.keys()))
        fused_candidates: List[Dict[str, Any]] = []

        for pid in all_candidate_pids:
            has_dense = pid in dense_scores_map
            has_sparse = pid in sparse_scores_map

            d_score = float(dense_scores_map.get(pid, 0.0))
            s_score = float(sparse_scores_map.get(pid, 0.0))

            if has_dense and has_sparse:
                # 语义和关键词双重命中，高置信度融合
                fused_score = 0.55 * d_score + 0.40 * s_score + 0.05
                match_type = "混合命中"
            elif has_dense:
                # 纯语义相关命中
                fused_score = 0.88 * d_score
                match_type = "语义命中"
            else:
                # 纯精准关键词命中（专有名词）
                fused_score = 0.45 + 0.45 * s_score
                match_type = "关键词命中"

            fused_score = float(max(0.0, min(1.0, fused_score)))

            fused_candidates.append({
                "pid": pid,
                "score": float(round(fused_score, 4)),
                "dense_score": float(round(d_score, 4)),
                "sparse_score": float(round(s_score, 4)),
                "match_type": str(match_type),
            })

        # 按综合得分从大到小排序
        fused_candidates.sort(key=lambda item: item["score"], reverse=True)

        # -------------------------------------------------------------
        # 4. 构建返回结果列表
        # -------------------------------------------------------------
        final_chunks: List[Dict[str, Any]] = []
        for idx, item in enumerate(fused_candidates[:top_k]):
            pid = item["pid"]
            payload = point_payload_map.get(pid, {})
            final_chunks.append({
                "source_index": int(idx + 1),
                "point_id": str(pid),
                "document_id": str(payload.get("document_id")) if payload.get("document_id") else None,
                "knowledge_base_id": str(payload.get("knowledge_base_id")) if payload.get("knowledge_base_id") else None,
                "filename": str(payload.get("filename", "未知文件")),
                "chunk_index": int(payload.get("chunk_index", 0)),
                "content": str(payload.get("content", "")),
                "score": float(item["score"]),
                "dense_score": float(item["dense_score"]),
                "sparse_score": float(item["sparse_score"]),
                "match_type": str(item["match_type"]),
            })

        return final_chunks
