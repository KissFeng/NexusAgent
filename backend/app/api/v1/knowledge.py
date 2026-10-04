from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.workspace import Workspace
from app.models.knowledge import KnowledgeBase, Document, DocumentChunk
from app.schemas.knowledge import (
    KnowledgeBaseCreateRequest,
    KnowledgeBaseResponse,
    DocumentResponse,
    DocumentChunkResponse,
    SearchTestRequest,
    SearchResultItem,
)
from app.api.deps import get_current_workspace
from app.services.knowledge_service import KnowledgeService
from app.services.retrieval_service import RetrievalService

router = APIRouter(prefix="/knowledge-bases", tags=["Knowledge Bases"])

@router.get("", response_model=List[KnowledgeBaseResponse])
async def list_knowledge_bases(
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = (
        select(KnowledgeBase, func.count(Document.id).label("doc_count"))
        .outerjoin(Document, Document.knowledge_base_id == KnowledgeBase.id)
        .where(KnowledgeBase.workspace_id == workspace.id)
        .group_by(KnowledgeBase.id)
        .order_by(KnowledgeBase.created_at.desc())
    )
    results = await db.execute(stmt)
    kb_list = []
    for kb, count in results.all():
        kb_resp = KnowledgeBaseResponse.model_validate(kb)
        kb_resp.document_count = count
        kb_list.append(kb_resp)
    return kb_list

@router.post("", response_model=KnowledgeBaseResponse)
async def create_knowledge_base(
    req: KnowledgeBaseCreateRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权创建知识库")

    kb = KnowledgeBase(
        workspace_id=workspace.id,
        name=req.name,
        description=req.description,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)

    resp = KnowledgeBaseResponse.model_validate(kb)
    resp.document_count = 0
    return resp

@router.delete("/{kb_id}")
async def delete_knowledge_base(
    kb_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除知识库")

    stmt = select(KnowledgeBase).where(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.workspace_id == workspace.id
    )
    kb = (await db.execute(stmt)).scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")

    # 从 Qdrant 清除向量
    KnowledgeService.delete_kb_from_qdrant(kb.id)

    await db.delete(kb)
    await db.commit()
    return {"message": "知识库已删除"}

@router.get("/{kb_id}/documents", response_model=List[DocumentResponse])
async def list_documents(
    kb_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    # 验证知识库归属
    kb_stmt = select(KnowledgeBase).where(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.workspace_id == workspace.id
    )
    kb = (await db.execute(kb_stmt)).scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")

    stmt = (
        select(Document)
        .where(Document.knowledge_base_id == kb_id)
        .order_by(Document.created_at.desc())
    )
    docs = (await db.execute(stmt)).scalars().all()
    return [DocumentResponse.model_validate(d) for d in docs]

@router.post("/{kb_id}/documents", response_model=DocumentResponse)
async def upload_document(
    kb_id: str,
    file: UploadFile = File(...),
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权上传文档至知识库")

    kb_stmt = select(KnowledgeBase).where(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.workspace_id == workspace.id
    )
    kb = (await db.execute(kb_stmt)).scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="知识库不存在")

    file_bytes = await file.read()
    filename = file.filename or "uploaded_file.txt"

    doc = await KnowledgeService.process_and_index_document(
        db=db,
        kb=kb,
        filename=filename,
        file_bytes=file_bytes,
    )
    return DocumentResponse.model_validate(doc)

@router.get("/{kb_id}/documents/{doc_id}/chunks", response_model=List[DocumentChunkResponse])
async def list_chunks(
    kb_id: str,
    doc_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    stmt = (
        select(DocumentChunk)
        .where(
            DocumentChunk.document_id == doc_id,
            DocumentChunk.workspace_id == workspace.id
        )
        .order_by(DocumentChunk.chunk_index.asc())
    )
    chunks = (await db.execute(stmt)).scalars().all()
    return [DocumentChunkResponse.model_validate(c) for c in chunks]

@router.delete("/{kb_id}/documents/{doc_id}")
async def delete_document(
    kb_id: str,
    doc_id: str,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, role = ws_info
    if role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除文档")

    stmt = select(Document).where(
        Document.id == doc_id,
        Document.knowledge_base_id == kb_id
    )
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文档不存在")

    # 清除 Qdrant 向量
    KnowledgeService.delete_document_from_qdrant(doc.id)

    await db.delete(doc)
    await db.commit()
    return {"message": "文档已删除"}

@router.post("/search", response_model=List[SearchResultItem])
async def test_hybrid_search(
    req: SearchTestRequest,
    ws_info: Annotated[tuple[Workspace, str], Depends(get_current_workspace)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    workspace, _ = ws_info
    results = await RetrievalService.hybrid_search(
        db=db,
        workspace_id=workspace.id,
        query=req.query,
        kb_ids=req.kb_ids,
        top_k=req.top_k,
    )
    return [SearchResultItem(**r) for r in results]
