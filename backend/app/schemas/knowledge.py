from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

class KnowledgeBaseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None

class KnowledgeBaseResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: Optional[str] = None
    document_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: str
    knowledge_base_id: str
    filename: str
    file_type: str
    file_size: int
    chunk_count: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class DocumentChunkResponse(BaseModel):
    id: str
    document_id: str
    chunk_index: int
    content: str
    qdrant_point_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class SearchTestRequest(BaseModel):
    query: str = Field(min_length=1)
    kb_ids: Optional[List[str]] = None
    top_k: int = 4

class SearchResultItem(BaseModel):
    source_index: int
    point_id: str
    document_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    filename: str
    chunk_index: int
    content: str
    score: float
    dense_score: Optional[float] = None
    sparse_score: Optional[float] = None
    match_type: Optional[str] = "混合命中"
