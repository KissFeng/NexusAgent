from app.core.config import settings
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

# Connect to Qdrant Docker container
qdrant_client = QdrantClient(url=settings.QDRANT_URL)

COLLECTION_NAME = "knowledge_chunks"
VECTOR_DIMENSION = settings.EMBEDDING_DIMENSION

def init_qdrant_collection():
    """Ensure the target collection exists with matching vector dimension and Cosine metric."""
    if qdrant_client.collection_exists(COLLECTION_NAME):
        info = qdrant_client.get_collection(COLLECTION_NAME)
        current_size = info.config.params.vectors.size
        if current_size != VECTOR_DIMENSION:
            # Recreate with the new embedding dimension (e.g. 1024 for BAAI/bge-m3)
            qdrant_client.delete_collection(COLLECTION_NAME)
            qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=VECTOR_DIMENSION,
                    distance=Distance.COSINE
                ),
            )
    else:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=VECTOR_DIMENSION,
                distance=Distance.COSINE
            ),
        )

# Initialize on module load
init_qdrant_collection()
