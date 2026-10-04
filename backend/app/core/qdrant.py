from app.core.config import settings
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

# Connect to Qdrant Docker container
qdrant_client = QdrantClient(url=settings.QDRANT_URL)

COLLECTION_NAME = "knowledge_chunks"
MEMORY_COLLECTION_NAME = "agent_memories"
VECTOR_DIMENSION = settings.EMBEDDING_DIMENSION

def init_qdrant_collection():
    """Ensure both knowledge_chunks and agent_memories collections exist with matching dimension."""
    for coll in [COLLECTION_NAME, MEMORY_COLLECTION_NAME]:
        if qdrant_client.collection_exists(coll):
            info = qdrant_client.get_collection(coll)
            current_size = info.config.params.vectors.size
            if current_size != VECTOR_DIMENSION:
                qdrant_client.delete_collection(coll)
                qdrant_client.create_collection(
                    collection_name=coll,
                    vectors_config=VectorParams(
                        size=VECTOR_DIMENSION,
                        distance=Distance.COSINE
                    ),
                )
        else:
            qdrant_client.create_collection(
                collection_name=coll,
                vectors_config=VectorParams(
                    size=VECTOR_DIMENSION,
                    distance=Distance.COSINE
                ),
            )

# Initialize on module load
init_qdrant_collection()
