import React, { useState } from 'react';
import {
  Search,
  Layers,
  Zap,
  Download,
  CheckCircle,
  Sparkles,
  Sliders,
  X,
  Code,
  Globe,
  Database,
  Terminal,
  FileText,
  Bot,
  Plus,
} from 'lucide-react';
import type { ToolConfig, Skill } from '../../types';
import { api } from '../../api/client';
import type { PlazaCategory } from '../layout/SubSidebar';

interface PlazaViewProps {
  currentCategory: PlazaCategory;
  tagFilter: string | null;
  installedTools: ToolConfig[];
  installedSkills: Skill[];
  onRefreshTools: () => void;
  onRefreshSkills: () => void;
  onNavigateToSettings?: (tab: 'mcp' | 'skill') => void;
}

// 预置 MCP 广场服务元数据
interface McpMarketItem {
  id: string;
  name: string;
  tool_type: string;
  provider: string;
  description: string;
  icon: any;
  protocol: 'builtin' | 'stdio' | 'sse';
  tags: string[];
  defaultConfig: Record<string, any>;
}

const MCP_MARKET_ITEMS: McpMarketItem[] = [
  {
    id: 'web_search',
    name: '实时联网搜索 (Web Search)',
    tool_type: 'web_search',
    provider: 'Official Built-in',
    description: '通过 DuckDuckGo / 搜索引擎实时检索互联网最新公开资讯、技术博客与官方文档',
    icon: Globe,
    protocol: 'builtin',
    tags: ['联网搜索', '官方推荐', '系统工具'],
    defaultConfig: {},
  },
  {
    id: 'code_interpreter',
    name: 'Python 代码计算沙箱 (Code Interpreter)',
    tool_type: 'code_interpreter',
    provider: 'Official Built-in',
    description: '隔离受控沙箱运行 Python 3 脚本，执行复杂高精度数学运算、数据格式转换与统计分析',
    icon: Terminal,
    protocol: 'builtin',
    tags: ['研发提效', '商业分析', '系统工具'],
    defaultConfig: {},
  },
  {
    id: 'github_mcp',
    name: 'GitHub 开发者生态助手 (GitHub MCP)',
    tool_type: 'mcp_server',
    provider: 'Model Context Protocol',
    description: '标准 MCP Stdio 接入 GitHub API，支持检索代码仓、查看提交记录与拉取 PR 代码详情',
    icon: Code,
    protocol: 'stdio',
    tags: ['研发提效', '系统工具'],
    defaultConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    },
  },
  {
    id: 'fetch_mcp',
    name: 'Fetch 网页全量提取器 (Fetch MCP)',
    tool_type: 'mcp_server',
    provider: 'Model Context Protocol',
    description: '提取指定 URL 网页的完整 HTML 并通过智能解析算法转译为排版规整的 Markdown 文本',
    icon: Globe,
    protocol: 'stdio',
    tags: ['联网搜索', '系统工具'],
    defaultConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  },
  {
    id: 'filesystem_mcp',
    name: 'Filesystem 本地安全文件系统 (Filesystem MCP)',
    tool_type: 'mcp_server',
    provider: 'Anthropic Official',
    description: '以隔离安全边界访问与分析本地目录文件、配置文件及代码工程，进行就地知识沉淀',
    icon: FileText,
    protocol: 'stdio',
    tags: ['系统工具', '研发提效'],
    defaultConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/zhaojie/Desktop/agent_demo'],
    },
  },
  {
    id: 'postgres_mcp',
    name: 'PostgreSQL 数据库连接器 (PostgreSQL MCP)',
    tool_type: 'mcp_server',
    provider: 'Model Context Protocol',
    description: '只读连接关系型数据库，自动获取数据表 Schema 字典，并允许 Agent 自主执行安全只读查询',
    icon: Database,
    protocol: 'stdio',
    tags: ['商业分析', '研发提效'],
    defaultConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:password@localhost:5432/db'],
    },
  },
  {
    id: 'feishu_mcp',
    name: '外部渠道广播与机器人播报 (Feishu MCP)',
    tool_type: 'mcp_server',
    provider: 'Enterprise Custom',
    description: '基于 MCP JSON-RPC 协议标准，支持 Agent 决策后向已绑定的飞书群或企微机器人实时主动投递通知',
    icon: Bot,
    protocol: 'sse',
    tags: ['协同互通', '系统工具'],
    defaultConfig: {
      server_url: 'http://127.0.0.1:8000/api/v1/tools/mcp-webhooks',
      protocol: 'jsonrpc-2.0',
    },
  },
  {
    id: 'puppeteer_mcp',
    name: 'Puppeteer 网页交互与高清截图 (Puppeteer MCP)',
    tool_type: 'mcp_server',
    provider: 'Community MCP',
    description: '操控无头 Chrome 浏览器加载动态 JavaScript 渲染页面并执行交互验证、生成高清截图',
    icon: Code,
    protocol: 'stdio',
    tags: ['研发提效', '系统工具'],
    defaultConfig: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
  },
];

// 预置 Skill 广场技能元数据
interface SkillMarketItem {
  code: string;
  name: string;
  category: string;
  description: string;
  system_prompt: string;
  bound_tools: string[];
  tags: string[];
}

const SKILL_MARKET_ITEMS: SkillMarketItem[] = [
  {
    code: 'xhs_writer',
    name: '小红书爆款文案专家',
    category: '内容创作',
    description: '精通小红书爆款流量密码，拟定吸睛二极管标题、痛点场景唤醒与高互动排版。',
    system_prompt: `你是一名资深小红书爆款文案操盘手，擅长撰写高点赞、高收藏的干货与种草文案。
【输出格式标准】：
1. 标题库：提供 3-5 个带有数字、悬念、情绪共鸣或反常识的二极管标题（含合适 Emoji）；
2. 正文结构：
   - 痛点共鸣/黄金前三秒开篇
   - 结构化干货/实用解决方案（多用分点符号与空格排版，视觉舒适）
   - 结尾强行动号召（引导评论区互动、收藏备用）
3. 爆款标签：生成 5-8 个契合垂类的热门带 # 话题标签。`,
    bound_tools: ['web_search'],
    tags: ['内容创作', '官方推荐'],
  },
  {
    code: 'code_architect',
    name: '架构设计与代码评审专家',
    category: '研发提效',
    description: '针对软件架构方案、技术选型与代码进行深度评审，排查并发安全、性能瓶颈与设计缺陷。',
    system_prompt: `你是一名顶级软件架构师兼代码评审专家（Staff Engineer 级别），具有极深的大规模分布式系统与高质量代码把控力。
【评审与设计准则】：
1. 架构评估：分析高内聚低耦合、边界条件、单点故障（SPOF）与可扩展性；
2. 性能与并发：审查锁竞争、数据库 N+1 查询、连接池泄露、缓存击穿/雪崩隐患；
3. 防御性设计：严格检验参数边界、异常捕获兜底、幂等性保障与日志可观测性；
4. 输出要求：清晰标出【缺陷等级（P0/P1/P2）】、【问题成因】并提供【最小必要修改的优雅重构方案代码】。`,
    bound_tools: ['search_knowledge_base', 'code_interpreter'],
    tags: ['研发提效', '官方推荐'],
  },
  {
    code: 'market_analyst',
    name: '行业研报与竞品情报分析师',
    category: '商业分析',
    description: '结合联网公开数据与企业私有知识库，输出结构化行业研报、竞品对比矩阵与 SWOT 分析。',
    system_prompt: `你是一名麦肯锡风格的高级商业咨询顾问与行业分析专家。
【分析方法论与输出框架】：
1. 行业宏观背景与驱动因素（技术驱动、政策利好、市场痛点）；
2. 头部竞品横向对比（用 Markdown 表格对比产品定位、核心功能、定价策略、优劣势）；
3. SWOT 深度拆解（优势、劣势、机会、威胁）；
4. 战略落地建议（短中长期破局打法与潜在商业风险提示）。
回答需数据详实、逻辑严密、结论先行。`,
    bound_tools: ['web_search', 'search_knowledge_base'],
    tags: ['商业分析', '官方推荐'],
  },
  {
    code: 'sql_tuner',
    name: 'SQL 性能诊断与索引优化师',
    category: '研发提效',
    description: '精通 MySQL/PostgreSQL 底层执行计划，擅长针对慢查询提供索引组合与重构优化方案。',
    system_prompt: `你是一名资深数据库性能调优专家（DBA 级），精通 PostgreSQL 与 MySQL 内部存储引擎、B+ 树索引结构与查询优化器。
【诊断排查标准】：
1. SQL 执行路径分析：排查全表扫描（Seq Scan）、文件排序（Using filesort）、临时表与隐式类型转换；
2. 索引设计优化：依据最左前缀法则设计最佳覆盖索引（Covering Index），避免宽表冗余；
3. 改写建议：针对深分页、OR 关联、大事务锁等待给出等价的高性能 SQL 改写方案；
4. 附带建表或索引 DDL，并解释调优前后预估成本对比。`,
    bound_tools: ['search_knowledge_base'],
    tags: ['研发提效'],
  },
  {
    code: 'paper_reviewer',
    name: '学术论文审稿专家',
    category: '研发提效',
    description: '按照顶级顶会（NeurIPS/ICLR/ACL）同行评审标准，全面评审论文理论深度、创新点与严密性。',
    system_prompt: `你是一名计算机与人工智能领域国际顶级学术会议（CCF-A 类）的资深审稿人（Senior Reviewer）。
【审稿标准（Peer Review Guideline）】：
1. 核心贡献度（Originality & Contributions）：评估动机是否新颖、理论基础是否牢固；
2. 方法论严密性（Methodology & Soundness）：推导是否有漏洞，对照组与消融实验（Ablation Study）是否充分；
3. 论据与表达（Clarity & Reproducibility）：图表表意清晰度、开源复现可能性；
4. 综合建议：给出详细的审稿意见与最终评分（Strong Accept / Weak Accept / Borderline / Reject）。`,
    bound_tools: ['web_search', 'search_knowledge_base'],
    tags: ['研发提效', '学术科研'],
  },
  {
    code: 'legal_advisor',
    name: '企业法务与合同合规顾问',
    category: '合规法务',
    description: '排查商业合同与合作协议中的违约风险、责任限制、不可抗力条款与保密合规漏洞。',
    system_prompt: `你是一名专业企业商事法务专家与合同合规审查顾问。
【审查与排查重点】：
1. 关键权利义务对等性：排查不平等的单方违约金条款、免责声明；
2. 风险敞口：付款账期风险、交付验收争议解决机制、知识产权归属条款；
3. 保密与合规漏洞：数据安全、竞业限制以及管辖法院管辖权争议；
4. 输出逐条修改建议与防范要点。`,
    bound_tools: ['search_knowledge_base'],
    tags: ['合规法务'],
  },
  {
    code: 'translator',
    name: '中英双语母语级翻译润色官',
    category: '内容创作',
    description: '符合信达雅原则的地道本地化翻译，擅长跨文化语境转换与专业技术/商务术语精准对照。',
    system_prompt: `你是一名资深同传级双语翻译与母语文本润色专家。
【翻译准则】：
1. 拒绝机械字对字生硬翻译，依据地道母语读者习惯重构语序与修辞；
2. 确保专业术语（软件、法律、金融）严格对齐行业权威术语词典；
3. 保留原文全部格式（如 Markdown 链接、代码块、专有名词大小写）；
4. 输出译文并对具有文化差异的难点提供简要译者注。`,
    bound_tools: [],
    tags: ['内容创作', '语言翻译'],
  },
  {
    code: 'fullstack_dev',
    name: '全栈工程师与接口设计专家',
    category: '研发提效',
    description: '精通 React/TypeScript 与 FastAPI/PostgreSQL 全链路设计，提供整洁规范的架构实现。',
    system_prompt: `你是一名拥有十年以上全栈工程经验的资深工程师，专注于前后端一体化高质量代码交付。
【工程准则】：
1. 遵循 Clean Architecture 与低耦合高内聚设计；
2. 前端组件具备清晰类型定义与错误边界，状态更新考虑竞态与并发；
3. 后端接口遵循 RESTful / OpenAPI 规范，具备参数严密校验与异步高性能；
4. 严格输出开箱即用、无缺失引入的完整代码片段。`,
    bound_tools: ['code_interpreter', 'search_knowledge_base'],
    tags: ['研发提效'],
  },
];

export const PlazaView: React.FC<PlazaViewProps> = ({
  currentCategory,
  tagFilter,
  installedTools,
  installedSkills,
  onRefreshTools,
  onRefreshSkills,
  onNavigateToSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'mcp' | 'skill'>(
    currentCategory === 'skill' ? 'skill' : 'mcp'
  );
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 安装 MCP 弹窗配置项
  const [configModalItem, setConfigModalItem] = useState<McpMarketItem | null>(null);
  const [mcpConfigInput, setMcpConfigInput] = useState<string>('');

  const showToast = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // 1. 安装/装上 MCP 服务
  const handleInstallMcp = async (item: McpMarketItem) => {
    // 若需要自定义参数则弹出配置确认
    if (item.protocol === 'stdio' || item.protocol === 'sse') {
      setConfigModalItem(item);
      setMcpConfigInput(JSON.stringify(item.defaultConfig, null, 2));
      return;
    }

    try {
      setInstallingId(item.id);
      await api.createTool({
        tool_type: item.tool_type,
        name: item.name,
        description: item.description,
        config: item.defaultConfig,
        is_enabled: true,
      });
      showToast(`🎉 成功装载 MCP 服务：${item.name}`);
      onRefreshTools();
    } catch (err: any) {
      alert(`安装失败: ${err.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleConfirmCustomMcp = async () => {
    if (!configModalItem) return;
    try {
      setInstallingId(configModalItem.id);
      let parsedConfig = {};
      try {
        parsedConfig = JSON.parse(mcpConfigInput);
      } catch (e) {
        alert('配置 JSON 格式不合法，请检查！');
        return;
      }

      await api.createTool({
        tool_type: configModalItem.tool_type,
        name: configModalItem.name,
        description: configModalItem.description,
        config: parsedConfig,
        is_enabled: true,
      });

      showToast(`🎉 成功接入 MCP 服务：${configModalItem.name}`);
      setConfigModalItem(null);
      onRefreshTools();
    } catch (err: any) {
      alert(`接入失败: ${err.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  // 2. 安装/装上 Skill 技能
  const handleInstallSkill = async (item: SkillMarketItem) => {
    try {
      setInstallingId(item.code);
      await api.createSkill({
        name: item.name,
        code: item.code,
        category: item.category,
        description: item.description,
        system_prompt: item.system_prompt,
        bound_tools: item.bound_tools,
      });
      showToast(`🎉 成功装载专业技能：/${item.code} (${item.name})`);
      onRefreshSkills();
    } catch (err: any) {
      alert(`装载失败: ${err.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  // 判断是否已安装
  const isMcpInstalled = (item: McpMarketItem) => {
    return installedTools.some(
      (t) => t.tool_type === item.tool_type || t.name === item.name
    );
  };

  const isSkillInstalled = (item: SkillMarketItem) => {
    return installedSkills.some((s) => s.code === item.code);
  };

  // 过滤 MCP 列表
  const filteredMcpItems = MCP_MARKET_ITEMS.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = tagFilter ? item.tags.includes(tagFilter) : true;
    return matchesSearch && matchesTag;
  });

  // 过滤 Skill 列表
  const filteredSkillItems = SKILL_MARKET_ITEMS.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = tagFilter ? item.tags.includes(tagFilter) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <div className="flex-1 h-full bg-slate-950 flex flex-col overflow-hidden text-slate-100">
      {/* 顶部 Header：搜索与 Tab 切换 */}
      <header className="px-8 py-5 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span>生态广场 (Plaza)</span>
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono">
              Marketplace
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            开箱即用的 MCP 协议工具生态与专业智能体技能，一键快速装载至当前空间
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索 MCP 服务或技能..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Tab 切换 */}
          <div className="flex p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setActiveTab('mcp')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'mcp'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>MCP 广场 ({MCP_MARKET_ITEMS.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('skill')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'skill'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Skill 广场 ({SKILL_MARKET_ITEMS.length})</span>
            </button>
          </div>

          {/* 快捷添加自定义入口 */}
          {onNavigateToSettings && (
            <button
              onClick={() => onNavigateToSettings(activeTab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                activeTab === 'mcp'
                  ? 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{activeTab === 'mcp' ? '自定义接入 MCP' : '创建自定义技能'}</span>
            </button>
          )}
        </div>
      </header>

      {/* 提示 Banner */}
      {successMessage && (
        <div className="mx-8 mt-4 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400/80 hover:text-emerald-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 主工作内容卡片网格 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {activeTab === 'mcp' ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>精选 MCP 服务列表（遵循 Anthropic 标准工具协议）</span>
              </div>
              <span className="text-xs text-slate-500">
                已装载 {installedTools.length} 个 MCP 服务
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMcpItems.map((item) => {
                const Icon = item.icon;
                const installed = isMcpInstalled(item);
                const isInstalling = installingId === item.id;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/40 hover:bg-slate-900 transition-all shadow-md group"
                  >
                    <div>
                      {/* 卡片头部 */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                              {item.name}
                            </h3>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {item.provider}
                            </div>
                          </div>
                        </div>

                        <span className="text-[10px] px-2 py-0.5 rounded-full uppercase font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          {item.protocol}
                        </span>
                      </div>

                      {/* 卡片描述 */}
                      <p className="text-xs text-slate-400 leading-relaxed min-h-[36px] line-clamp-2 mb-3">
                        {item.description}
                      </p>

                      {/* 标签 */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {item.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-300 border border-slate-750"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 卡片底部操作按钮 */}
                    <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                      <div className="text-[11px] text-slate-500 font-mono">
                        {item.tool_type}
                      </div>

                      {installed ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>已装载</span>
                          </div>
                          {onNavigateToSettings && (
                            <button
                              onClick={() => onNavigateToSettings('mcp')}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
                              title="在设置中配置参数与测试连接"
                            >
                              配置
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleInstallMcp(item)}
                          disabled={isInstalling}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{isInstalling ? '装载中...' : '一键装载'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>精选智能体专业技能（通过 Slash '/' 快捷指令即时唤醒）</span>
              </div>
              <span className="text-xs text-slate-500">
                已装载 {installedSkills.length} 个技能
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSkillItems.map((item) => {
                const installed = isSkillInstalled(item);
                const isInstalling = installingId === item.code;

                return (
                  <div
                    key={item.code}
                    className="flex flex-col justify-between p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-amber-500/40 hover:bg-slate-900 transition-all shadow-md group"
                  >
                    <div>
                      {/* 卡片头部 */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                            <Zap className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                              {item.name}
                            </h3>
                            <div className="text-[11px] text-amber-400/90 font-mono font-semibold mt-0.5">
                              /{item.code}
                            </div>
                          </div>
                        </div>

                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          {item.category}
                        </span>
                      </div>

                      {/* 卡片描述 */}
                      <p className="text-xs text-slate-400 leading-relaxed min-h-[36px] line-clamp-2 mb-3">
                        {item.description}
                      </p>

                      {/* 预绑定工具 */}
                      <div className="mb-4">
                        <div className="text-[10px] text-slate-500 mb-1 font-mono uppercase">
                          预绑定 MCP:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.bound_tools.length === 0 ? (
                            <span className="text-[10px] text-slate-500 italic">纯推理能力</span>
                          ) : (
                            item.bound_tools.map((t) => (
                              <span
                                key={t}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-mono"
                              >
                                {t}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 卡片底部操作按钮 */}
                    <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        提示词工程已预置
                      </span>

                      {installed ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>已装载</span>
                          </div>
                          {onNavigateToSettings && (
                            <button
                              onClick={() => onNavigateToSettings('skill')}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
                              title="在设置中二次编辑 Prompt 与绑定"
                            >
                              二次编辑
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleInstallSkill(item)}
                          disabled={isInstalling}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{isInstalling ? '装载中...' : '一键装载'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 自定义 MCP 接入参数弹窗 */}
      {configModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  接入 MCP 服务：{configModalItem.name}
                </h3>
              </div>
              <button
                onClick={() => setConfigModalItem(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-slate-400">
                该 MCP 服务基于 <span className="text-indigo-400 font-mono font-semibold">{configModalItem.protocol}</span> 标准协议，请根据环境核对配置参数：
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  服务启动配置 (JSON)
                </label>
                <textarea
                  rows={7}
                  value={mcpConfigInput}
                  onChange={(e) => setMcpConfigInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfigModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleConfirmCustomMcp}
                disabled={installingId === configModalItem.id}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
              >
                {installingId === configModalItem.id ? '接入中...' : '确认装载并启用'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
