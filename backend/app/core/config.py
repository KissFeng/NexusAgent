import os

# Clean IPv6 entries from no_proxy to avoid httpx URL parsing bug with '::1'
for env_k in ["no_proxy", "NO_PROXY"]:
    if env_k in os.environ:
        parts = [p.strip() for p in os.environ[env_k].split(",") if "::" not in p]
        os.environ[env_k] = ",".join(parts)

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise Agent Platform"
    API_V1_STR: str = "/api/v1"
    
    # Database
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres123"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "agent_demo"
    
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Qdrant Vector DB
    QDRANT_URL: str = "http://127.0.0.1:6333"

    # SiliconFlow / Embedding settings
    SILICONFLOW_API_KEY: str | None = None
    EMBEDDING_BASE_URL: str = "https://api.siliconflow.cn/v1"
    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    EMBEDDING_DIMENSION: int = 1024

    # Security
    SECRET_KEY: str = "enterprise_agent_platform_super_secret_jwt_key_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
