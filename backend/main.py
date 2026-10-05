from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
import app.models  # Ensure all models are registered
from app.api.v1.auth import router as auth_router
from app.api.v1.workspace import router as workspace_router
from app.api.v1.model_provider import router as model_router
from app.api.v1.chat import router as chat_router
from app.api.v1.knowledge import router as knowledge_router
from app.api.v1.skills import router as skills_router
from app.api.v1.tools import router as tools_router
from app.api.v1.memories import router as memories_router
from app.api.v1.schedules import router as schedules_router
from app.api.v1.governance import router as governance_router
from app.api.v1.webhooks import router as webhooks_router
from sqlalchemy import text
from app.services.scheduler_service import SchedulerService

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时自动初始化数据表并安全扩充列
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS model_name VARCHAR(255);"))

    # 启动定时任务引擎并恢复已有任务
    SchedulerService.start_scheduler()
    try:
        await SchedulerService.load_all_jobs_from_db()
    except Exception as e:
        print(f"Warning: load_all_jobs_from_db error: {e}")

    yield

    # 关闭定时任务引擎与数据库引擎
    SchedulerService.shutdown_scheduler()
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载路由
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(workspace_router, prefix=settings.API_V1_STR)
app.include_router(model_router, prefix=settings.API_V1_STR)
app.include_router(chat_router, prefix=settings.API_V1_STR)
app.include_router(knowledge_router, prefix=settings.API_V1_STR)
app.include_router(skills_router, prefix=settings.API_V1_STR)
app.include_router(tools_router, prefix=settings.API_V1_STR)
app.include_router(memories_router, prefix=settings.API_V1_STR)
app.include_router(schedules_router, prefix=settings.API_V1_STR)
app.include_router(governance_router, prefix=settings.API_V1_STR)
app.include_router(webhooks_router, prefix=settings.API_V1_STR)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
