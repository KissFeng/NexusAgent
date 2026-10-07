# NexusAgent

> **企业级全栈智能体工作台平台（Enterprise Full-Stack Agent Platform）**  
> 基于 LangGraph 状态图执行引擎与三栏式工作台架构，融合混合检索 RAG、人机协同审批（Human-in-the-Loop）、MCP 协议网关与代码沙箱。

---

## 🌟 核心特性

- 🖥️ **现代三栏式交互工作台**
  - 对标现代化桌面端交互规范，支持工作空间切换与智能体侧边栏抽屉。
  - 完整支持 SSE（Server-Sent Events）流式响应、打字机逐字输出、思考链（Thinking Process）展开折叠。
  - 具备分支历史继承、对话版本溯源以及工具调用卡片实时展开。
- 🧠 **LangGraph 状态图引擎**
  - 摒弃传统黑盒脆弱提示词循环，基于显式有向状态图驱动智能体认知决策。
  - 原生集成 Checkpointer 状态持久化快照，支持复杂长流程多轮状态恢复。
  - **人机在回路（Human-in-the-Loop）**：高危工具（系统修改、外部变更）触发 `interrupt` 审批中断，支持管理员在前端可视化审查并一键继续恢复执行。
- 📚 **企业级双路混合检索 RAG**
  - 向量数据库：基于 Qdrant 稠密向量（Dense Retrieval）语义计算。
  - 关键词检索：集成 BM25 稀疏检索（Sparse Retrieval）精准匹配术语与编号。
  - 融合排序：采用倒数排名融合（RRF, Reciprocal Rank Fusion）综合打分，大幅提升召回精度。
  - 知识溯源：流式渲染携带结构化切片引用（Citations），原文一键溯源查看。
- 🔌 **开放工具生态与沙箱执行**
  - **代码与命令沙箱**：内置通用安全 Bash 工作区执行环境，支持复杂计算与指令联动。
  - **联网检索与阅读**：集成多源 Web 搜索与网页深度清洗阅读能力。
  - **MCP 协议支持**：兼容 Model Context Protocol 规范，快速对接外部工具与私有能力。
- 🏢 **多租户与多模型企业治理**
  - 统一模型工厂（LLM Factory）：无缝适配 DeepSeek、OpenAI、通义千问、Ollama 及各类兼容端点。
  - 多租户数据隔离：支持个人空间与团队企业空间隔离。
  - 定时调度与自动化运营：内置任务调度与服务治理监控大屏。

---

## 🏗️ 系统全景架构

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   前端交互层 (React 19 + TypeScript + Vite)              │
│  - 工作空间与模型设置  - 三栏式会话工作台  - SSE 打字机流式渲染         │
│  - 思考折叠与工具留痕  - 溯源证据卡片    - 人在回路审批中断弹窗         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / SSE (EventStream)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       FastAPI 核心服务网关                             │
│  - JWT 认证与多租户上下文拦截 (X-Workspace-Id)                          │
│  - 统一模型适配工厂 (DeepSeek / OpenAI / Qwen / Ollama)                 │
│  - 混合检索服务 (Dense Vector + BM25 Sparse + RRF 融合重排)            │
│  - LangGraph 状态图编排 (StateGraph + Checkpointer + Interrupt)        │
│  - 扩展执行层 (Bash 沙箱 / Web Reader / MCP 网关客户端)                │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
┌───────────────────▼──────────────┐   ┌────────────▼────────────────────┐
│      关系型数据库 (PostgreSQL)    │   │      向量数据库 (Qdrant)        │
│  - 用户体系、租户空间与成员角色  │   │  - HNSW 稠密向量索引 (Cosine)   │
│  - 模型配置、会话历史与消息明细  │   │  - Payload 工作空间级物理隔离   │
│  - 知识库、切片元数据与审计记录  │   │  - 混合检索打分与切片检索       │
└──────────────────────────────────┘   └─────────────────────────────────┘
```

---

## 🛠️ 技术栈

### 前端
* **核心框架**：React 19 + TypeScript + Vite
* **样式与组件**：Tailwind CSS + Lucide Icons + clsx / tailwind-merge
* **内容渲染**：React Markdown + Remark GFM（支持公式、表格与代码高亮排版）
* **代码规范**：Oxlint

### 后端
* **服务框架**：FastAPI + Uvicorn + Pydantic v2
* **持久化**：SQLAlchemy 2.0 (Async) + asyncpg + PostgreSQL
* **向量检索**：Qdrant Client + Rank-BM25 + BAAI/bge-m3 Embedding
* **智能体执行**：LangGraph + LangChain Core + LangChain OpenAI
* **工具协议**：MCP (Model Context Protocol) + APScheduler 定时引擎

---

## 🚀 快速启动

### 1. 环境准备

确保本机已安装以下基础环境：
* **Python**：3.11 或更高版本（推荐使用 `uv` 管理）
* **Node.js**：18+ 及 **pnpm**
* **PostgreSQL**：14+
* **Qdrant**：向量数据库实例

> **提示**：可使用 Docker 快速拉起 Qdrant 向量数据库：
> ```bash
> docker run -d -p 6333:6333 -p 6334:6334 -v $(pwd)/qdrant_storage:/qdrant/storage:z qdrant/qdrant
> ```

---

### 2. 后端配置与启动

```bash
# 1. 进入后端目录
cd backend

# 2. 创建并激活虚拟环境（以 uv 为例）
uv venv
source .venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 初始化环境配置文件
cp .env.example .env
# 编辑 .env 文件，填写数据库连接与大模型/Embedding API 密钥

# 5. 启动后端 API 服务
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

后端服务就绪后，访问 API 交互式文档：`http://localhost:8000/api/docs`

---

### 3. 前端工作台启动

打开新终端窗口：

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装 Node 依赖
pnpm install

# 3. 启动开发服务器
pnpm dev
```

启动完成后，在浏览器打开：`http://localhost:3000` 即可进入 NexusAgent 工作台。

---

## 📁 目录结构

```text
.
├── backend/
│   ├── app/
│   │   ├── agent/               # LangGraph 状态图定义、节点逻辑与工具集成
│   │   ├── api/                 # FastAPI REST & SSE 路由端点
│   │   ├── core/                # 全局配置、安全性与上下文拦截
│   │   ├── llm/                 # 统一模型适配工厂 (LLM Factory)
│   │   ├── models/              # SQLAlchemy 数据库实体定义
│   │   ├── schemas/             # Pydantic 校验与数据传输对象 (DTO)
│   │   └── services/            # 混合检索、向量存储、沙箱等核心业务服务
│   ├── .env.example             # 后端环境变量示例模板
│   ├── main.py                  # 后端启动入口
│   └── requirements.txt         # 后端 Python 依赖列表
├── frontend/
│   ├── src/
│   │   ├── api/                 # 前端 API 请求与 SSE 连接管理
│   │   ├── components/          # 工作台布局、设置抽屉、审批卡片等 UI 组件
│   │   ├── types/               # TypeScript 类型定义
│   │   ├── App.tsx              # 应用主组件
│   │   └── main.tsx             # 前端入口
│   ├── package.json             # 前端依赖配置
│   └── vite.config.ts           # Vite 构建配置
├── PROJECT_DEVELOPMENT_LOG.md   # 系统详细研发日志与设计规约
└── README.md                    # 项目主说明文档
```

---

## 📄 开源许可

本项目采用 [MIT](LICENSE) 许可证。
