import math
import hashlib
from typing import List, Optional
from langchain_openai import OpenAIEmbeddings
from app.core.config import settings
from app.models.model_provider import ModelConfig
from app.core.qdrant import VECTOR_DIMENSION

class EmbeddingService:
    @staticmethod
    def get_deterministic_embedding(text: str, dim: int = VECTOR_DIMENSION) -> List[float]:
        """
        Fallback pseudo-embedding generator:
        Converts text tokens into a deterministic, unit-normalized float vector.
        """
        vec = [0.0] * dim
        words = text.lower().split()
        if not words:
            return vec

        for word in words:
            h = int(hashlib.sha256(word.encode("utf-8")).hexdigest(), 16)
            for i in range(8):
                idx = (h + i * 199) % dim
                weight = ((h >> (i * 4)) & 0xFF) / 255.0 - 0.5
                vec[idx] += weight

        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [x / norm for x in vec]
        return vec

    @classmethod
    async def embed_texts(
        cls,
        texts: List[str],
        model_config: Optional[ModelConfig] = None
    ) -> List[List[float]]:
        if not texts:
            return []

        # 始终使用专用的向量服务配置（硅基流动 BAAI/bge-m3）
        # 绝不被前端选择的聊天模型（如 OpenAI、Claude 等无嵌入接口的代理）错误覆盖
        api_key = settings.SILICONFLOW_API_KEY
        base_url = settings.EMBEDDING_BASE_URL
        model_name = settings.EMBEDDING_MODEL

        if api_key and api_key.strip():
            try:
                embeddings = OpenAIEmbeddings(
                    api_key=api_key,
                    base_url=base_url,
                    model=model_name,
                    check_embedding_ctx_length=False,
                )
                return await embeddings.aembed_documents(texts)
            except Exception as e:
                print(f"[EmbeddingService] 向量 API 调用失败: {e}，触发本地确定性投影降级")

        # 本地降级
        return [cls.get_deterministic_embedding(t) for t in texts]

    @classmethod
    async def embed_query(
        cls,
        query: str,
        model_config: Optional[ModelConfig] = None
    ) -> List[float]:
        results = await cls.embed_texts([query], model_config)
        return results[0]
