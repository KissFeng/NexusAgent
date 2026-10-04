# 企业级智能体平台开发与实施全链路指南

本项目致力于构建一个可商用交付、高内聚、易扩展的企业级智能体（Agent）平台。本文档作为全流程开发档案与工程实践手册，系统记录各阶段的设计考量、核心知识点、实施步骤、接口定义与验证记录，供后续维护与系统演进参考。

---

## 一、系统全景架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                          前端交互层 (React 19 + TypeScript + Vite)       │
│  - 工作空间切换 (Personal / Enterprise)  - 模型供应商配置抽屉          │
│  - SSE 流式打字机渲染 (Markdown / GFM)  - 溯源证据卡片与审批中断弹窗  │
│  - 知识库管理与混合检索测试沙箱                                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / SSE (EventStream)
┌───────────────────────────────────▼────────────────────────────────────┐
│                        FastAPI 异步核心服务网关                        │
│  - JWT 认证与租户上下文拦截器 (X-Workspace-Id 注入)                    │
│  - 模型适配工厂 (LLM Factory: DeepSeek / OpenAI / Qwen / Ollama)       │
│  - 知识库与切片解析引擎 (PyPDF / Docx / RecursiveSplitter)             │
│  - 混合检索器 (RetrievalService: Qdrant Dense + BM25 Sparse + RRF)     │
│  - LangGraph 状态图执行引擎 (StateGraph + Checkpointer + Interrupt)   │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
┌───────────────────▼──────────────┐   ┌────────────▼────────────────────┐
│      关系型数据库 (PostgreSQL)    │   │      向量数据库 (Qdrant)        │
│  - Users, Workspaces, Members    │   │  - HNSW 稠密向量索引 (1536维)   │
│  - ModelConfigs, Conversations   │   │  - Payload 工作空间物理级隔离   │
│  - KnowledgeBases, Documents     │   │  - 混合检索 (Dense + BM25 + RRF)│
└──────────────────────────────────┘   └─────────────────────────────────┘
```

---

## 二、项目实施阶段路线图

| 阶段 | 核心任务与能力产出 | 状态 |
| :--- | :--- | :---: |
| **第 1 阶段** | 跑通骨架与对话：FastAPI 基础、SQLAlchemy 异步 ORM、多租户空间模型、多模型工厂、React SSE 流式对话 | **已完成** |
| **第 2 阶段** | Agent 核心与 RAG 落地：LangGraph 状态图、Checkpointer 持久化、Qdrant 向量检索、混合检索 RAG、审批中断 | **已完成** |
| **第 3 阶段** | 能力拓展与工具生态：工具调用标准、专业技能体系、MCP 协议网关、长期记忆沉淀、子智能体委派、多会话并发流式隔离 | **已完成** |
| **第 4 阶段** | 自动化与外部渠道：定时任务调度机制、企微/飞书/钉钉 Webhook 验签解密与机器人互通 | 待开始 |
| **第 5 阶段** | 企业级治理与上线结项：用量统计算法、审计日志、Docker Compose 生产调优、压测与论文结项 | 待开始 |

---

## 三、第 1 阶段实施记录：跑通骨架与对话

### 1. 核心设计与知识点
* **FastAPI + SQLAlchemy 2.0 (Asyncpg) + Pydantic v2**：大模型生成慢 IO 高并发架构，分层解耦。
* **多租户行级隔离模型**：`personal` 个人空间与 `enterprise` 企业团队空间隔离，`X-Workspace-Id` 上下文拦截。
* **统一多模型工厂（LLM Factory）**：抽象 `ChatOpenAI` 客户端适配 DeepSeek、OpenAI、通义千问、Ollama。
* **SSE（Server-Sent Events）流式推送机制**：单向规范化事件流，前端打字机渲染与历史自动持久化。

### 2. 数据库实体
* `users`、`workspaces`、`workspace_members`、`model_configs`、`conversations`、`messages`。

---

## 四、第 2 阶段实施记录：Agent 核心与 RAG 落地

### 1. 核心设计与知识点

#### 1.1 LangGraph 状态机（StateGraph）机制
* 放弃黑盒脆弱的传统 ReAct，采用基于有向状态图的工作流编排。
* **State** 维护全局上下文：`messages`（消息历史）、`citations`（检索溯源分块）、`workspace_id`、`kb_ids`。
* **Nodes & Edges**：
  * `agent` 节点：接收当前提示词与历史，调用大模型分析意图；
  * `tools` 节点：执行安全工具（知识库检索）或触发敏感审批；
  * 条件边：模型输出 `tool_calls` 流转至工具节点，否则直接流向 `END`。

#### 1.2 Checkpointer 持久化与恢复
* 使用 `MemorySaver`（可无缝切换 PostgresCheckpointer），根据会话 `thread_id` 自动快照保存图节点跃迁状态。
* 支持多轮会话状态机复用以及中断后精准断点续跑。

#### 1.3 人在回路（Human-in-the-Loop）与审批中断（Interrupt）
* 通过 LangGraph 原生 `interrupt(approval_payload)` 实现高危敏感工具拦截。
* 当触发审批动作（如全员广播、修改系统策略）时，图执行主动暂停，通过 SSE 推送 `type: "approval_required"`。
* 前端呈现安全审批卡片；管理员点击批准/驳回后，前端调用 `/chat/approve`，后端以 `Command(resume={"approved": ...})` 恢复状态图继续执行。

#### 1.4 文档解析、切分与 Qdrant 向量化入库
* **解析引擎**：统一支持 `.txt`、`.md`、`.pdf` (PyPDF)、`.docx` (python-docx)。
* **递归分块**：`chunk_size = 600`，`chunk_overlap = 120`，保留跨分块语义。
* **向量数据库**：Qdrant 实例（Port: 6333, Collection: `knowledge_chunks`，1536 维，Cosine 相似度）。
* **Payload 物理隔离**：每个向量点保存 `workspace_id`、`knowledge_base_id`、`document_id`，严格按空间检索。

#### 1.5 混合检索（Hybrid Search）与 RRF 融合打分
* **稠密向量检索（Dense）**：Qdrant `query_points` 计算意图语义相似度。
* **稀疏关键词检索（Sparse）**：BM25Okapi 计算专有名词与精确编号匹配度。
* **倒数排名融合（RRF）**：$RRF(d) = \frac{1}{60 + r_{dense}} + \frac{1}{60 + r_{sparse}}$ 综合打分重排，兼顾语义泛化与精确匹配。
* **溯源呈现（Citation）**：将检索出的切片作为结构化引用卡片注入流式响应，并在前端支持点击展开查看原文。

### 2. 数据库新增实体

```sql
-- 知识库表
knowledge_bases (id, workspace_id, name, description, created_at)

-- 文档表
documents (id, knowledge_base_id, filename, file_type, file_size, chunk_count, status, error_message, created_at)

-- 文档分块表
document_chunks (id, document_id, knowledge_base_id, workspace_id, chunk_index, content, qdrant_point_id, created_at)
```

### 3. API 接口扩展清单

| 模块 | 方法 | 路径 | 描述 |
| :--- | :--- | :--- | :--- |
| **KB** | GET | `/api/v1/knowledge-bases` | 获取空间知识库列表（含文档统计） |
| **KB** | POST | `/api/v1/knowledge-bases` | 创建新知识库 |
| **KB** | DELETE | `/api/v1/knowledge-bases/{id}` | 删除知识库并级联清理 Qdrant 向量 |
| **KB** | GET | `/api/v1/knowledge-bases/{id}/documents` | 获取知识库中的文档列表 |
| **KB** | POST | `/api/v1/knowledge-bases/{id}/documents` | 上传文件（自动提取、分块并存入 Qdrant） |
| **KB** | DELETE | `/api/v1/knowledge-bases/{id}/documents/{docId}` | 删除文档及对应向量切片 |
| **KB** | POST | `/api/v1/knowledge-bases/search` | 测试混合检索沙箱（Dense + BM25 + RRF） |
| **Agent**| POST | `/api/v1/chat/approve` | 人在回路恢复接口：批准或驳回高危操作 |

### 4. 验证闭环记录

1. **Qdrant 向量存储**：容器化运行于 6333 端口，集合 `knowledge_chunks` 自动对齐 1024 维并成功通过向量写入与查询校验。
2. **硅基流动（SiliconFlow）向量与大模型**：接入高精度开源中文向量模型 **BAAI/bge-m3**（1024 维）与 **DeepSeek-V3** 旗舰大语言模型，验证真实外部 API 向量提取与图状态机流式调用。
3. **文档分块与混合检索**：上传技术规范文档，分块并执行测试搜索，成功验证 Dense 检索与 BM25 RRF 综合打分重排逻辑。
4. **LangGraph 流式执行与审批中断**：验证了状态机基于 `thread_id` 保持会话，支持调用 `search_knowledge_base` 实时溯源（[1]、[2] 引用），遇到敏感操作时主动触发挂起中断并支持通过 `/chat/approve` 断点续跑。
5. **前端构建与交互**：完成知识库管理弹窗、混合检索测试沙箱、对话证据卡片（展开原文）及审批决策卡片的前端集成，`tsc -b` 及 `vite build` 0 报错通过。

---

## 三、RAG 知识库切片重构与检索召回率优化专项

针对实际使用中检索得分偏低（如出现 `0.0164` 倒数分数误解）、切片割裂腰斩、专有名词与中文脱靶等问题，开展了深度排查与端到端重构。

### 1. 深度根因分析与定位

1. **PDF 底层异形编码问题（康熙部首）**：
   * 调查发现部分设计软件导出的 PDF 包含 Unicode 兼容异形字符（如 `\u2f2f` 康熙部首 `⼯` 替代 `工`、`⼤` 替代 `大`、`多租⼾` 替代 `多租户`、`赵 杰` 包含字距空格），导致词向量与分词器无法与用户常规输入对齐。
2. **切片机制机械截断**：
   * 原递归切片器按固定 600 字符强行分割，导致项目经历、技术栈与业务亮点在句子甚至单词中间被切断（如“预测报”与“告功能”分散在两个分块中），造成上下文碎片化。
3. **中文 BM25 稀疏检索未分词（100% 词击穿）**：
   * 原代码使用 `str.split()` 进行切分，中文长句未按词语拆分，BM25 关键词匹配得分全部为 0，稀疏检索退化。
4. **RRF 倒数打分展示误导**：
   * 原始 RRF 公式为 $\frac{1}{60 + rank}$，单路命中第一名仅为 $0.0164$，用户容易误解为准确度只有 1.6%，缺乏归一化与可解释性。

### 2. 优化方案与实施

1. **智能结构化清洗与语义分块引擎（`SmartSemanticSplitter`）**：
   * **Unicode 规范化**：引入 `unicodedata.normalize('NFKC')` 自动将所有康熙部首兼容字统一还原为标准 CJK 简体汉字。
   * **排版空格智能修复**：自动识别并清除中文字符间的版面字距空格（`赵 杰` $\to$ `赵杰`，`学 历` $\to$ `学历`），智能拼接非标点折行。
   * **层次语义聚合**：按大纲、项目时间段、技能块等独立单元切分，单块保持在 350~650 字符，保证完整业务内聚，绝不断字断词。
2. **中文分词与高召回混合检索（`RetrievalService`）**：
   * **集成 Jieba 搜索引擎分词**：对语料与用户 Query 分词并过滤停用单字，精准捕获专有名词。
   * **密集向量分数提取**：提取 Qdrant 原生 Cosine 相似度。
   * **科学归一化融合（Calibrated Hybrid Fusion）**：
     * 双路混合命中：综合得分 $S = 0.55 \times S_{dense} + 0.40 \times S_{sparse} + 0.05$。
     * 纯语义/纯关键词命中分级自适应打分，输出标准 0~100% 相关度，并标记命中类型（混合命中、语义命中、关键词命中）。
3. **前端呈现升级**：
   * 在知识库测试沙箱和对话流式溯源中，将内部低分改为直观的百分比相关度（如 `86.3% 混合命中`），提供清晰的命中标签。

### 3. 实测验证效果

* **美业 SaaS 多租户管理平台**：相关度从原先无法识别提升至 **86.3%（混合命中）**，完整涵盖项目背景、职责、技术栈与亮点。
* **乾坤掼蛋小游戏平台**：精准命中完整项目分块，相关度 **80.6%（混合命中）**。
* **赵杰有什么成就**：精准命中个人教育、国家奖学金（占全国0.2%）、发明专利3项、软件著作权4项，相关度 **73.4%（混合命中）**。
* **量化交易系统年化收益**：精准命中量化特征工程与回测指标，相关度 **77.5%（混合命中）**。

---

## 四、模型供应商配置增强：编辑与默认模型管理

为了方便灵活维护和热切换大模型接入点（如 DeepSeek-V3、OpenAI、SiliconFlow、本地 Ollama 等），扩展了模型供应商的编辑与默认设置能力。

### 1. 后端功能升级

* **全量字段编辑支持（`PUT /api/v1/models/{id}`）**：支持更新 `name`（显示名称）、`provider`（供应商类型）、`model_name`（实际模型标识）、`base_url`（API 接入点）、`api_key`（可选覆盖或保持原密钥）、`is_default`（空间默认状态）。
* **一键设为默认接口（`POST /api/v1/models/{id}/set-default`）**：自动排他性切换空间内当前模型的 `is_default` 状态，确保工作区始终有且仅有一个生效的默认模型。

### 2. 前端交互与视图升级（`ModelConfigModal.tsx`）

* **编辑配置入口与表单**：
  * 在模型列表卡片右侧新增显眼的【编辑】按钮；
  * 点击编辑进入内联表单，自动回填当前模型的全部字段（`api_key` 提示留空保持现有密钥，输入新密钥则覆盖更新）；
  * 保存后即时刷新模型列表与会话下拉选择。
* **默认模型标识与切换**：
  * 对当前生效的默认模型，展示高亮金色徽标【★ 默认模型】；
  * 对非默认模型，提供直观的【设为默认】按钮，点击立即排他性切换并弹出轻量操作反馈。

---

## 五、第 3 阶段实施记录：能力拓展与工具生态

### 1. 核心设计与知识点

#### 1.1 长期记忆沉淀与个性化消歧召回（`MemoryService`）
* **自动提炼机制**：每轮对话生成完成后，后台通过轻量 LLM 自动分析用户意图，从对话中抽取用户偏好、背景信息、工作习惯（`category`: `preference`, `fact`, `constraint`），自动沉淀到 PostgreSQL `memories` 表。
* **混合向量记忆（Qdrant `agent_memories`）**：将记忆内容生成 1024 维向量存储于 Qdrant，并附带 `user_id` 与 `workspace_id` 过滤条件。
* **智能消歧与召回注入**：当用户发起新提问时，系统在 LangGraph Agent 执行前自动检索与当前 Query 最相关的用户长期记忆，作为动态上下文注入 Agent 提示词，实现“千人千面、随用随记”的长期偏好对齐。

#### 1.2 工业级 MCP（Model Context Protocol）协议网关（`MCPService`）
* **标准化工具集成**：引入 Anthropic 主导的 `mcp` 官方 SDK（`mcp>=1.3.0`），支持以标准 JSON-RPC 规范接入外部独立 MCP Server（Stdio 与 SSE 协议）。
* **动态工具发现与装载**：系统启动或工具启用时，自动与 MCP Server 握手执行 `list_tools`，将返回的 Tool Schema 动态转译为 LangChain 标准工具格式。
* **隔离调用与容错**：工具执行统一经由异步安全沙箱，当外部 MCP Server 超时或异常时，执行回退并由 Agent 进行自我修正。

#### 1.3 显式子智能体委派架构（Supervisor-Worker 模式 / `SubagentService`）
* **主从图拓扑**：主智能体作为 Supervisor 负责顶层规划与结果汇总；定义 `delegate_subtask` 工具，使 Supervisor 能够将复杂的子问题（如深度检索、代码编写、数据对比）委派给独立的 Worker Agent。
* **上下文隔离与独立上下文栈**：Worker Agent 拥有独立的提示词配置与专属工具集，独立执行并返回结构化报告，避免主会话上下文窗口膨胀。

#### 1.4 专业技能体系（Skills）与 Slash 快捷交互
* **技能定义与工具绑定**：内置 4 大核心技能（数据分析师 `data_analyst`、全栈工程师 `fullstack_dev`、学术研究员 `academic_researcher`、企业法务助理 `legal_advisor`），每个技能定义专门的 System Prompt 与预设绑定工具。
* **Slash 快捷呼出补全**：前端输入框键入 `/` 即可触发键盘交互式技能建议列表，支持按上下键切换并按 Tab / Enter 快捷填充，挂载后直观展示技能指示器。
* **原生安全沙箱工具**：集成 DuckDuckGo 互联网实时搜索、Python 安全计算执行沙箱，满足复杂数学运算与实时资讯查询。

---

## 六、多会话并发流式隔离架构（Multi-Session Streaming Isolation）

针对多会话切换场景中容易出现的“会话 A 正在流式生成时切换到会话 B，导致会话 A 的输出串流到会话 B，且完成时覆盖会话 B 历史”的经典前端状态串流 Bug，设计并落地了按会话作用域隔离的流式状态管理架构。

### 1. 架构瓶颈根因定位

1. **单点全局标量污染**：前端原有的 `isStreaming`、`streamingContent`、`streamingCitations`、`pendingApproval` 等状态均为全局单一状态。`ChatArea` 直接读取全局状态渲染，只要有任意会话在生成，当前视口就会强制展示该流式内容。
2. **跨会话历史粗暴覆盖**：在会话 A 的 `streamChat.onDone` 中直接执行 `setMessages(updatedMsgs)`，若此时用户已切换到会话 B，会话 B 的当前消息列表会被会话 A 的完成结果粗暴覆盖。
3. **流式并发拦截冲突**：全局 `if (isStreaming) return;` 导致任意一个会话在生成时，其他所有会话的输入均被禁用，无法实现多会话并行提问。

### 2. 会话作用域隔离方案设计

```
                    ┌──────────────────────────────────────────────┐
                    │               App (Root State)               │
                    │  - activeConversationId: "conv-B"            │
                    │  - activeConversationIdRef.current: "conv-B" │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
            ┌───────────────▼──────────────┐ ┌─────────────▼────────────────┐
            │  messagesByConv (会话消息缓存)│ │  streamingSessions (流式会话) │
            │  {                           │ │  {                           │
            │    "conv-A": [Msg1, Msg2...],│ │    "conv-A": {               │
            │    "conv-B": [Msg3, Msg4...] │ │      isStreaming: true,      │
            │  }                           │ │      content: "A生成中...",   │
            └───────────────┬──────────────┘ │      controller: AbortCtrl   │
                            │                │    }                         │
                            │                │  }                           │
                            │                └─────────────┬────────────────┘
                            │                              │
    ┌───────────────────────▼──────────────────────────────▼───────────────────────┐
    │                        当前活动视口 (ChatArea)                                 │
    │  messages = messagesByConv["conv-B"]  (会话 B 的独立消息，毫秒级切换，零闪烁)  │
    │  isStreaming = streamingSessions["conv-B"]?.isStreaming || false (允许提问)  │
    │  streamingContent = streamingSessions["conv-B"]?.content || "" (彻底隔离)   │
    └──────────────────────────────────────────────────────────────────────────────┘
```

### 3. 关键实现特性

1. **双字典状态隔离（`messagesByConv` & `streamingSessions`）**：
   * 将会话消息和流式状态完全以 `conversationId` 为键进行字典化隔离；
   * 会话 A 收到 SSE chunk 时仅增量修改 `streamingSessions["conv-A"].content`，绝不触碰任何其他会话；
   * 会话 A 收到 `[DONE]` 时仅更新 `messagesByConv["conv-A"]`，完全不干扰正在查看的会话 B。
2. **后台生成无感保留与毫秒级恢复**：
   * 用户在会话 A 发送长指令后可随意切换至会话 B、会话 C 甚至新建会话；
   * 会话 A 的后台推理、工具调用、长期记忆沉淀在后端与后台 SSE 链路中完整运行；
   * 当用户切回会话 A 时，实时无缝接回会话 A 当前已生成的流式打字进度，生成完成后自动以 Markdown 完整呈现。
3. **多会话并行提问与独立中断**：
   * 各会话生成状态完全独立，用户可在会话 A 生成的同时在会话 B 发送新问题，两个会话同时流式响应；
   * 点击【停止生成】仅调用当前会话的 `AbortController.abort()`，后台其他会话的生成不受任何影响。
4. **侧边栏呼吸灯态势感知**：
   * 侧边栏根据 `streamingSessions[conv.id]?.isStreaming` 动态为后台正在推理生成的会话渲染微型脉冲呼吸灯（`animate-ping`），用户可直观获知所有会话的执行状态。

---

## 五、模型供应商连通性探测与端点模型发现体系

为解决多模型配置中“填错 Base URL”、“API Key 误输导致静默报错”、“模型标识拼写错误”以及“不知道供应商支持哪些模型”等高频痛点，系统构建了端到端模型健康探测与端点发现体系。

### 1. 核心架构与功能设计

1. **多级实时健康度与连通性探测（`ModelProbeService.test_connection`）**：
   * **非流式极简 Token 真实推理**：后端向目标端点发起最小 Token 消耗的推理测试，实测端点是否可用；
   * **高精度网络延迟测量（Latency Ping）**：毫秒级度量从请求发出到收到模型回复的真实往返延迟；
   * **多维度智能错误诊断**：
     * `401 / AuthenticationError`：明确提示 API Key 无效、已过期或无访问权限；
     * `404 / NotFoundError`：明确提示模型标识未识别或端点路径不匹配；
     * `402 / QuotaExceeded`：明确提示账户余额不足或配额已耗尽；
     * `429 / RateLimit`：明确提示触发速率限制，并给出调优建议；
     * `ConnectTimeout / ConnectError`：网络超时或连接被拒检测，提示检查代理配置与监听端口。
2. **端点可用模型清单自动探测（`ModelProbeService.discover_models`）**：
   * 支持标准 OpenAI 规范的 `/models` 接口（兼容 SiliconFlow、DeepSeek、OpenAI、vLLM、OneAPI 等）；
   * 支持 Ollama 本地端点的 `/api/tags` 与 `/v1/models`；
   * 自动解析并过滤出可用模型标识列表，前端以标签形式直观列出；
   * 点击任意探测到的模型标签，自动填充至输入框，彻底避免手动打错 model id。
3. **前端全局态势感知与一键测速**：
   * **已配置模型卡片**：各模型卡片常驻【探测】按钮，实时呈现“🟢 正常 248ms”或“🔴 异常”徽标，支持展开查看模型回包样例；
   * **一键测速全部**：支持对工作区内所有已配置模型进行并发测速，快速比选当前最优供应商与网络延迟；
   * **表单即时验证**：在添加或编辑模型时，支持随时点击【测试连接与调用】与【探测端点模型】，保存前即确认 100% 可用。

---

*（本文档随工程迭代持续更新维护）*
