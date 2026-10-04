import io
import uuid
import re
import unicodedata
from typing import List, Tuple, Optional
from fastapi import UploadFile
from pypdf import PdfReader
import docx
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

from app.core.qdrant import qdrant_client, COLLECTION_NAME
from app.models.knowledge import KnowledgeBase, Document, DocumentChunk
from app.services.embedding_service import EmbeddingService
from app.models.model_provider import ModelConfig
from sqlalchemy.ext.asyncio import AsyncSession


class SmartSemanticSplitter:
    """
    语义感知自适应切片器：
    1. 彻底解决 PDF/文档由于字距排版产生的汉字间空格（如 '赵 杰' -> '赵杰'）
    2. NFKC 规范化：消除康熙部首/兼容异形字（如 '⼯'->'工', '⼤'->'大', '⼈'->'人', '多租⼾'->'多租户'）
    3. 智能修复折行：合并中文段落内非标点换行，杜绝截断字词
    4. 结构化层次分块：按项目、经历、大纲、自然段聚合，保证完整语义块内聚
    5. 平滑滑动边界：对超长文本在标点（。！？；）处平滑切分，避免生硬截断
    """

    def __init__(self, target_chunk_size: int = 500, max_chunk_size: int = 750, min_chunk_size: int = 120):
        self.target_chunk_size = target_chunk_size
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = min_chunk_size

    def clean_text(self, text: str) -> str:
        if not text:
            return ""

        # 1. Unicode NFKC 规范化（将康熙部首等异形字转为标准 CJK 汉字）
        text = unicodedata.normalize("NFKC", text)

        # 2. 常见兼容字/繁体修正
        text = text.replace("戶", "户")

        # 3. 规范换行
        text = text.replace("\r\n", "\n").replace("\r", "\n")

        lines = [l.strip() for l in text.split("\n")]
        clean_lines = []
        for l in lines:
            # 过滤单独的纯装饰符行
            if l in ["+", "++", "+++", "*", "---", "___", "Resume", ""]:
                if clean_lines and clean_lines[-1] != "":
                    clean_lines.append("")
                continue

            # 4. 去除汉字间的无意义水平空格（例如 '赵 杰' -> '赵杰', '学 历' -> '学历'）
            cleaned_l = l
            for _ in range(2):
                cleaned_l = re.sub(r"([\u4e00-\u9fa5])[ \t]+([\u4e00-\u9fa5])", r"\1\2", cleaned_l)
            clean_lines.append(cleaned_l)

        # 5. 智能合并中文行内断行（PDF常见换行）
        merged_lines = []
        for l in clean_lines:
            if not l:
                if merged_lines and merged_lines[-1] != "":
                    merged_lines.append("")
                continue

            if not merged_lines or merged_lines[-1] == "":
                merged_lines.append(l)
            else:
                prev = merged_lines[-1]
                is_prev_end = prev[-1] in "。！？!?;；：:"
                is_curr_heading = bool(
                    re.match(
                        r"^(#+\s|\d+\.|\d{4}\.\d{2}[-~]|【|\[|[A-Za-z]+ :|项目|个人|主修|学业|技术栈|获奖|熟练|基于|院校|学历|求职|后端|前端|运维|人工智能|开发习惯|其他经历)",
                        l,
                    )
                )
                # 上一行结尾是中文且无终止标点，当前行非标题，则连接
                if not is_prev_end and not is_curr_heading and len(prev) > 0 and "\u4e00" <= prev[-1] <= "\u9fff":
                    merged_lines[-1] = prev + " " + l if (prev[-1].isalnum() and l[0].isalnum()) else prev + l
                else:
                    merged_lines.append(l)

        return "\n".join(merged_lines)

    def split_text(self, text: str) -> List[str]:
        cleaned = self.clean_text(text)
        if not cleaned.strip():
            return []

        # 1. 识别段落与结构大纲边界
        raw_paras = cleaned.split("\n\n")
        sections = []
        for p in raw_paras:
            p = p.strip()
            if not p:
                continue
            # 拆分大纲标记（日期项目标题、Markdown 标题、技能模块等）
            sub_splits = re.split(
                r"\n(?=(?:#+\s|\d{4}\.\d{2}[-~]\d{4}\.\d{2}|Professional Skills|Project Experience|获奖经历|专业技能|主修课程|教育背景|学业成绩|其他经历|【.*?】))",
                p,
            )
            for sub in sub_splits:
                sub = sub.strip()
                if sub:
                    sections.append(sub)

        # 2. 动态聚合 Chunk
        chunks = []
        current = ""

        for sec in sections:
            # 超长段落：按自然句子平滑切分
            if len(sec) > self.max_chunk_size:
                if current:
                    chunks.append(current.strip())
                    current = ""

                sentences = [s.strip() for s in re.split(r"(?<=[。！？!\?\n])", sec) if s.strip()]
                sub_buf = ""
                for sent in sentences:
                    if len(sub_buf) + len(sent) <= self.max_chunk_size:
                        sub_buf += ("\n" if sub_buf and not sub_buf.endswith("\n") else "") + sent
                    else:
                        if sub_buf:
                            chunks.append(sub_buf.strip())
                        sub_buf = sent
                if sub_buf:
                    chunks.append(sub_buf.strip())
                continue

            # 正常段落
            if not current:
                current = sec
            elif len(current) + len(sec) + 2 <= self.target_chunk_size:
                current += "\n\n" + sec
            elif len(current) < self.min_chunk_size:
                # 前块过短，合并保证信息完整
                current += "\n\n" + sec
            else:
                chunks.append(current.strip())
                current = sec

        if current:
            # 如果最后一块过短，与上一块合并
            if chunks and len(current) < self.min_chunk_size:
                chunks[-1] += "\n\n" + current.strip()
            else:
                chunks.append(current.strip())

        return chunks


smart_splitter = SmartSemanticSplitter(target_chunk_size=500, max_chunk_size=750, min_chunk_size=120)


class KnowledgeService:
    @staticmethod
    def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
        ext = filename.lower().split(".")[-1]
        if ext in ["txt", "md"]:
            return file_bytes.decode("utf-8", errors="replace")
        elif ext == "pdf":
            reader = PdfReader(io.BytesIO(file_bytes))
            texts = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    texts.append(t)
            return "\n\n".join(texts)
        elif ext in ["docx", "doc"]:
            doc = docx.Document(io.BytesIO(file_bytes))
            texts = [p.text for p in doc.paragraphs if p.text.strip()]
            return "\n\n".join(texts)
        else:
            return file_bytes.decode("utf-8", errors="replace")

    @classmethod
    async def process_and_index_document(
        cls,
        db: AsyncSession,
        kb: KnowledgeBase,
        filename: str,
        file_bytes: bytes,
        model_config: ModelConfig | None = None,
        existing_doc: Optional[Document] = None,
    ) -> Document:
        file_type = filename.lower().split(".")[-1]
        file_size = len(file_bytes)

        # 1. 提取文档纯文本
        raw_text = cls.extract_text_from_file(file_bytes, filename)
        if not raw_text.strip():
            raw_text = "(空文档)"

        # 2. 智能结构化语义分块
        chunks_text = smart_splitter.split_text(raw_text)
        if not chunks_text:
            chunks_text = [raw_text]

        # 3. 记录或更新 Document 数据库实体
        if existing_doc:
            doc = existing_doc
            doc.chunk_count = len(chunks_text)
            doc.file_size = file_size
            doc.status = "completed"
            # 清理旧的 Qdrant 向量
            cls.delete_document_from_qdrant(doc.id)
            # 清理数据库中的旧 chunks
            from sqlalchemy import delete
            await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))
        else:
            doc = Document(
                knowledge_base_id=kb.id,
                filename=filename,
                file_type=file_type,
                file_size=file_size,
                chunk_count=len(chunks_text),
                status="completed",
            )
            db.add(doc)
            await db.flush()

        # 4. 批量计算向量 Embedding
        embeddings = await EmbeddingService.embed_texts(chunks_text, model_config)

        # 5. 生成 Qdrant Points 并记录 DocumentChunk
        points = []
        for idx, (chunk_content, emb) in enumerate(zip(chunks_text, embeddings)):
            point_id = str(uuid.uuid4())
            chunk_entity = DocumentChunk(
                document_id=doc.id,
                knowledge_base_id=kb.id,
                workspace_id=kb.workspace_id,
                chunk_index=idx,
                content=chunk_content,
                qdrant_point_id=point_id,
            )
            db.add(chunk_entity)

            # Qdrant Point 携带 Payload 元数据
            points.append(
                PointStruct(
                    id=point_id,
                    vector=emb,
                    payload={
                        "workspace_id": kb.workspace_id,
                        "knowledge_base_id": kb.id,
                        "document_id": doc.id,
                        "chunk_index": idx,
                        "filename": filename,
                        "content": chunk_content,
                    },
                )
            )

        # 6. 批量持久化入 Qdrant
        if points:
            qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=points,
            )

        await db.commit()
        await db.refresh(doc)
        return doc

    @staticmethod
    def delete_document_from_qdrant(document_id: str):
        qdrant_client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
        )

    @staticmethod
    def delete_kb_from_qdrant(knowledge_base_id: str):
        qdrant_client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="knowledge_base_id",
                        match=MatchValue(value=knowledge_base_id),
                    )
                ]
            ),
        )
