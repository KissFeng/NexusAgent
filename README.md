# Enterprise Agent Platform

企业级智能体开发与协作平台。

## 系统架构与模块

- **后端**：FastAPI + SQLAlchemy 2.0 (Async) + PostgreSQL (带 pgvector) + LangChain
- **前端**：React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons + React Markdown
- **通信**：Server-Sent Events (SSE) 流式传输

## 快速启动

### 1. 数据库
已连接本地 PostgreSQL (Port: 5432, Database: `agent_demo`)。

### 2. 后端启动
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
API 文档接口地址：`http://localhost:8000/api/docs`

### 3. 前端启动
```bash
cd frontend
pnpm dev
```
前端访问地址：`http://localhost:3000`

## 第 1 阶段已实现功能

1. **用户与认证体系**：基于 JWT 与 Bcrypt 的登录注册体系。
2. **多租户空间模型**：支持个人空间（注册自动生成）与企业团队空间创建与隔离。
3. **多模型适配管理**：支持 DeepSeek、OpenAI、通义千问、Ollama、自定义端点。
4. **SSE 流式对话**：打字机效果实时呈现，支持多轮历史记录持久化与会话管理。
