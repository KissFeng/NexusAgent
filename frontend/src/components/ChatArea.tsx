import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ModelConfig, Conversation, Citation, PendingApproval, Skill, ToolCallEvent } from '../types';
import {
  Send,
  Square,
  Bot,
  User,
  Settings,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Layers,
  BookOpen,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Zap,
  Wrench,
  Terminal,
  Brain,
  Search,
  Cpu,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';

interface ChatAreaProps {
  currentConversation: Conversation | null;
  messages: Message[];
  streamingContent: string;
  streamingThinking?: string;
  streamingToolCalls?: ToolCallEvent[];
  streamingCitations: Citation[];
  pendingApproval: PendingApproval | null;
  isStreaming: boolean;
  models: ModelConfig[];
  selectedModelId: string | null;
  skills: Skill[];
  onSelectModel: (id: string) => void;
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  onNavigateToPlaza?: () => void;
  onNavigateToSettings?: () => void;
  onApproveAction: (approved: boolean) => void;
}

// ─── 思考过程组件 (Reasoning / Thinking) ───────────────────────────────────
interface ReasoningBlockProps {
  thinking: string;
  isStreaming?: boolean;
  defaultOpen?: boolean;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  thinking,
  isStreaming = false,
  defaultOpen,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? isStreaming);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    }
  }, [isStreaming]);

  if (!thinking && !isStreaming) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 select-none overflow-hidden rounded-xl border border-purple-900/30 bg-purple-950/15">
      {/* 头部触发条 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3.5 py-2 text-left transition-colors hover:bg-purple-900/20 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400 shrink-0" />
          {isStreaming ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-purple-300 animate-pulse font-mono">
              <Sparkles className="w-3 h-3 text-purple-400 animate-spin" />
              正在深度思考中...
            </span>
          ) : (
            <span className="text-xs font-medium text-purple-300/90 font-mono">
              深度思考过程
            </span>
          )}
          <span className="text-[11px] text-purple-400/60 font-mono">
            {thinking ? `(${thinking.trim().length} 字符)` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isOpen && thinking && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-purple-300 hover:text-white hover:bg-purple-800/40 transition-colors"
              title="复制思考过程"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-purple-400/70 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* 展开的思考正文 */}
      {isOpen && (
        <div className="border-t border-purple-900/30 px-3.5 py-3 border-l-2 border-l-purple-500/60 bg-purple-950/20">
          <div className="font-mono text-xs text-purple-200/85 leading-relaxed whitespace-pre-wrap break-words select-text max-h-72 overflow-y-auto pr-1">
            {thinking || (isStreaming ? '正在组织思考架构与推演步骤...' : '')}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 工具调用卡片组件 (Collapsible Tool Call) ──────────────────────────────
interface ToolCallBlockProps {
  tool: ToolCallEvent;
  defaultOpen?: boolean;
}

const TOOL_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; border: string; bg: string; text: string }
> = {
  search_knowledge_base: {
    label: '企业知识库混合检索',
    icon: <BookOpen className="w-3.5 h-3.5 text-indigo-400" />,
    border: 'border-l-indigo-500',
    bg: 'bg-indigo-950/20',
    text: 'text-indigo-300',
  },
  web_search: {
    label: '实时联网搜索 (DuckDuckGo)',
    icon: <Search className="w-3.5 h-3.5 text-sky-400" />,
    border: 'border-l-sky-500',
    bg: 'bg-sky-950/20',
    text: 'text-sky-300',
  },
  code_interpreter: {
    label: 'Python 代码执行沙箱',
    icon: <Terminal className="w-3.5 h-3.5 text-emerald-400" />,
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-950/20',
    text: 'text-emerald-300',
  },
  call_mcp_tool: {
    label: '外部 MCP 协议远程工具',
    icon: <Cpu className="w-3.5 h-3.5 text-teal-400" />,
    border: 'border-l-teal-500',
    bg: 'bg-teal-950/20',
    text: 'text-teal-300',
  },
  delegate_subtask: {
    label: '子智能体任务委派',
    icon: <Layers className="w-3.5 h-3.5 text-purple-400" />,
    border: 'border-l-purple-500',
    bg: 'bg-purple-950/20',
    text: 'text-purple-300',
  },
  execute_sensitive_action: {
    label: '高危敏感操作审批决策',
    icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />,
    border: 'border-l-amber-500',
    bg: 'bg-amber-950/20',
    text: 'text-amber-300',
  },
};

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ tool, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || tool.status === 'running');
  const [copied, setCopied] = useState(false);

  const cfg = TOOL_CONFIG[tool.tool_name] || {
    label: tool.tool_name,
    icon: <Wrench className="w-3.5 h-3.5 text-slate-400" />,
    border: 'border-l-slate-500',
    bg: 'bg-slate-800/30',
    text: 'text-slate-300',
  };

  const getArgsPreview = (): string => {
    if (!tool.args) return '';
    if (tool.args.query) return `query: "${tool.args.query}"`;
    if (tool.args.code) return `code: "${tool.args.code.slice(0, 30)}..."`;
    if (tool.args.instruction) return `instruction: "${tool.args.instruction.slice(0, 30)}..."`;
    if (tool.args.tool_name) return `tool: ${tool.args.tool_name}`;
    try {
      const s = JSON.stringify(tool.args);
      return s.length > 40 ? s.slice(0, 40) + '...' : s;
    } catch {
      return '';
    }
  };

  const preview = getArgsPreview();

  const handleCopy = () => {
    const textToCopy = `[Tool]: ${tool.tool_name}\n[Args]: ${JSON.stringify(tool.args, null, 2)}\n[Result]:\n${tool.content || ''}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`my-2 rounded-xl border border-slate-800/80 ${cfg.bg} border-l-2 ${cfg.border} overflow-hidden`}>
      {/* 头部摘要栏 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3.5 py-2 text-left transition-colors hover:bg-slate-800/50 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
          <span className="shrink-0">{cfg.icon}</span>
          <span className={`text-xs font-semibold ${cfg.text} shrink-0`}>{cfg.label}</span>
          {preview && (
            <>
              <span className="text-[10px] text-slate-600">/</span>
              <span className="text-xs font-mono text-slate-400 truncate max-w-xs">{preview}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tool.status === 'running' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono animate-pulse">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              执行中
            </span>
          ) : tool.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
              <CheckCircle className="w-2.5 h-2.5" />
              已完成
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono">
              <XCircle className="w-2.5 h-2.5" />
              异常
            </span>
          )}
        </div>
      </button>

      {/* 展开的入参与执行结果 */}
      {isOpen && (
        <div className="border-t border-slate-800/60 p-3 space-y-2.5 text-xs bg-slate-950/40">
          {/* 输入参数 */}
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>输入参数 (Parameters)</span>
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}

          {/* 执行结果 */}
          {tool.content && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                <span>执行产出 (Output Result)</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? '已复制' : '复制结果'}</span>
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60 whitespace-pre-wrap leading-relaxed select-text">
                {tool.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── 代码块带语言与一键复制组件 ──────────────────────────────────────────────
export const MarkdownCodeBlock: React.FC<{
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}> = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-lg group">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
        <span className="uppercase font-semibold text-indigo-400">{language || 'CODE'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? '已复制' : '复制代码'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
};

// ─── 消息分段解析（提取 <think> 标签） ────────────────────────────────────────
export function parseThinkingSegments(content: string, rawThinking?: string): {
  thinking: string;
  mainAnswer: string;
} {
  let thinking = rawThinking || '';
  let mainAnswer = content;

  // 正则检测 <think>...</think>
  const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch) {
    const extracted = thinkMatch[1].trim();
    thinking = thinking ? `${thinking}\n\n${extracted}` : extracted;
    mainAnswer = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
  }

  return { thinking: thinking.trim(), mainAnswer: mainAnswer.trim() };
}

// ─── 主对话区组件 (ChatArea) ────────────────────────────────────────────────
export const ChatArea: React.FC<ChatAreaProps> = ({
  currentConversation,
  messages,
  streamingContent,
  streamingThinking,
  streamingToolCalls = [],
  streamingCitations,
  pendingApproval,
  isStreaming,
  models,
  selectedModelId,
  skills,
  onSelectModel,
  onSendMessage,
  onStopStreaming,
  onNavigateToPlaza,
  onNavigateToSettings,
  onApproveAction,
}) => {
  const [input, setInput] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [expandedCitationId, setExpandedCitationId] = useState<string | null>(null);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingThinking, streamingToolCalls, streamingCitations, pendingApproval]);

  // Slash 指令联想逻辑
  const isSlashTyping = input.startsWith('/') && !input.includes(' ');
  const slashKeyword = isSlashTyping ? input.slice(1).toLowerCase() : '';
  const matchingSkills = isSlashTyping
    ? skills.filter(
        (s) =>
          s.is_enabled &&
          (s.code.toLowerCase().includes(slashKeyword) ||
            s.name.toLowerCase().includes(slashKeyword) ||
            (s.category && s.category.toLowerCase().includes(slashKeyword)))
      )
    : [];

  useEffect(() => {
    setSelectedSkillIndex(0);
  }, [slashKeyword]);

  const activeMatchedSkill = skills.find((s) => {
    const prefix = `/${s.code}`;
    return input === prefix || input.startsWith(`${prefix} `);
  });

  const handleSelectSkill = (skill: Skill) => {
    setInput(`/${skill.code} `);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSlashTyping && matchingSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSkillIndex((prev) => (prev + 1) % matchingSkills.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSkillIndex((prev) => (prev - 1 + matchingSkills.length) % matchingSkills.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !input.includes(' '))) {
        e.preventDefault();
        handleSelectSkill(matchingSkills[selectedSkillIndex]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const selectedModel = models.find((m) => m.id === selectedModelId) || models[0];

  const parseSkillInvocation = (content: string) => {
    const match = content.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
    if (!match) return null;
    const code = match[1].toLowerCase();
    const prompt = match[2] || '';
    const skill = skills.find((s) => s.code.toLowerCase() === code);
    return { code, prompt, skill };
  };

  // 解析当前流式输出的 thinking 和 mainAnswer
  const currentStreamingParsed = useMemo(() => {
    return parseThinkingSegments(streamingContent, streamingThinking);
  }, [streamingContent, streamingThinking]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0F17] relative overflow-hidden">
      {/* 顶部状态与模型工具导航 */}
      <header className="h-14 border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0 bg-slate-900/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white truncate max-w-xs">
            {currentConversation?.title || '新会话'}
          </h2>
          {isStreaming && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-400 font-mono animate-pulse">
              <Sparkles className="w-3 h-3 text-indigo-400 animate-spin" />
              Agent 推理中
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* 快捷跳转到广场 */}
          {onNavigateToPlaza && (
            <button
              onClick={onNavigateToPlaza}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/20 text-xs text-indigo-300 hover:text-white transition-all cursor-pointer"
              title="探索 MCP 服务与专业技能广场"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>生态广场</span>
            </button>
          )}

          {/* 模型选择器 */}
          <div className="relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-medium text-slate-200 transition-all cursor-pointer shadow-sm"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span className="truncate max-w-[140px] font-mono">
                {selectedModel?.name || '选择模型'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showModelDropdown && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 flex items-center justify-between">
                  <span>切换推理模型</span>
                  <span className="text-[9px] text-slate-500 font-mono">按会话生效</span>
                </div>
                <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onSelectModel(m.id);
                        setShowModelDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        selectedModelId === m.id
                          ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                          : 'text-slate-300 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex flex-col text-left min-w-0 pr-2">
                        <span className="truncate">{m.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono truncate">{m.model_name}</span>
                      </div>
                      {m.is_default && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                          默认
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 快捷进入设置 */}
          {onNavigateToSettings && (
            <button
              onClick={onNavigateToSettings}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="系统设置 (模型/MCP/技能/频道/定时任务)"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* 消息流主视口 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && !streamingContent && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto my-auto text-slate-400">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-500/20 via-indigo-500/20 to-sky-500/20 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-xl">
              <Bot className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">企业级 AI 智能体 · Claude Code 级交互协同</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              已全面集成可折叠深度思考（Reasoning）、工具调用过程可视化、专业技能 (Slash 指令) 与企业 RAG。
            </p>
            <div className="grid grid-cols-2 gap-3 w-full text-left text-xs">
              <div
                onClick={() => onSendMessage('/xhs_writer 帮我写一篇关于“企业级 AI 智能体降低人工成本”的爆款小红书文案')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-amber-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>爆款文案专家 (/xhs_writer)</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  黄金前三秒、痛点挖掘与爆款文案标准 SOP
                </div>
              </div>

              <div
                onClick={() => onSendMessage('/code_architect 请帮我评审一段高并发账户余额扣减代码，分析死锁与幂等设计')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <span>架构与代码评审 (/code_architect)</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  分析并发竞态、防重幂等与事务一致性
                </div>
              </div>

              <div
                onClick={() => onSendMessage('帮我用 Python 计算斐波那契数列前 30 项并绘制增长比率')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Python 代码沙箱执行</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  安全沙箱即时运行 Python 脚本并返回计算数据
                </div>
              </div>

              <div
                onClick={() => onSendMessage('我们平台的安全守则中对高危操作是如何规定的？')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-sky-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-sky-300">
                  <BookOpen className="w-4 h-4 text-sky-400" />
                  <span>知识库 RAG 问答</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  自动 Qdrant 稠密/稀疏混合检索与精准溯源标注
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 历史消息渲染 */}
        {messages.map((msg) => {
          if (msg.role === 'user') {
            const invocation = parseSkillInvocation(msg.content);
            return (
              <div key={msg.id} className="flex gap-3 max-w-3xl ml-auto flex-row-reverse">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs shadow bg-indigo-600 text-white">
                  <User className="w-4 h-4" />
                </div>
                <div className="rounded-2xl rounded-tr-none px-4 py-3 text-sm leading-relaxed max-w-2xl bg-indigo-600 text-white shadow-sm">
                  {invocation ? (
                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-indigo-950/80 text-amber-300 border border-amber-500/30 text-[11px] font-mono">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>/{invocation.code}</span>
                        {invocation.skill && (
                          <span className="text-slate-300 font-sans">· {invocation.skill.name}</span>
                        )}
                      </div>
                      {invocation.prompt && <div className="whitespace-pre-wrap">{invocation.prompt}</div>}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            );
          }

          // Assistant 消息渲染
          const { thinking, mainAnswer } = parseThinkingSegments(msg.content, msg.thinking);

          return (
            <div key={msg.id} className="flex gap-3 max-w-3xl mr-auto">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow bg-gradient-to-tr from-purple-600 via-indigo-600 to-sky-600">
                <Bot className="w-4 h-4" />
              </div>

              <div className="rounded-2xl rounded-tl-none px-4 py-3.5 text-sm leading-relaxed max-w-2xl bg-slate-900/90 border border-slate-800/80 text-slate-100 shadow-md space-y-3 flex-1 overflow-hidden">
                {/* 1. 可折叠深度思考过程 */}
                {thinking && <ReasoningBlock thinking={thinking} defaultOpen={false} />}

                {/* 2. 关联的工具调用历史 */}
                {msg.tool_calls && msg.tool_calls.length > 0 && (
                  <div className="space-y-1.5">
                    {msg.tool_calls.map((tc) => (
                      <ToolCallBlock key={tc.tool_id} tool={tc} defaultOpen={false} />
                    ))}
                  </div>
                )}

                {/* 3. 正文 Markdown 渲染（增强代码块一键复制） */}
                {mainAnswer && (
                  <div className="prose prose-invert prose-sm max-w-none break-words">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: MarkdownCodeBlock,
                      }}
                    >
                      {mainAnswer}
                    </ReactMarkdown>
                  </div>
                )}

                {/* 4. 知识库检索溯源卡片 */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1 font-mono">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>检索溯源参考 ({msg.citations.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((c) => (
                        <div key={c.point_id} className="w-full">
                          <button
                            onClick={() =>
                              setExpandedCitationId(
                                expandedCitationId === c.point_id ? null : c.point_id
                              )
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-[11px] text-slate-300 transition-all cursor-pointer"
                          >
                            <ChevronRight
                              className={`w-3 h-3 text-slate-500 transition-transform ${
                                expandedCitationId === c.point_id ? 'rotate-90' : ''
                              }`}
                            />
                            <span className="font-semibold text-indigo-300">[{c.source_index}]</span>
                            <span className="truncate max-w-xs">{c.filename}</span>
                            <span className="text-[10px] text-emerald-400/90 font-mono">
                              匹配度: {c.score <= 1 ? `${(c.score * 100).toFixed(1)}%` : c.score}
                            </span>
                            {c.match_type && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-950/70 text-purple-300 border border-purple-800/40">
                                {c.match_type}
                              </span>
                            )}
                          </button>
                          {expandedCitationId === c.point_id && (
                            <div className="mt-1 p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed select-text">
                              {c.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 正在流式生成的实时气泡 */}
        {isStreaming && (
          <div className="flex gap-3 max-w-3xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-sky-600 flex items-center justify-center shrink-0 text-white shadow">
              <Bot className="w-4 h-4 animate-spin-slow" />
            </div>
            <div className="rounded-2xl rounded-tl-none px-4 py-3.5 text-sm leading-relaxed max-w-2xl bg-slate-900/90 border border-slate-800/80 text-slate-100 shadow-xl space-y-3 flex-1 overflow-hidden">
              {/* 1. 流式思考过程渲染 */}
              {(currentStreamingParsed.thinking || isStreaming) && (
                <ReasoningBlock
                  thinking={currentStreamingParsed.thinking}
                  isStreaming={isStreaming && !currentStreamingParsed.mainAnswer}
                  defaultOpen={true}
                />
              )}

              {/* 2. 实时工具调用状态 */}
              {streamingToolCalls.length > 0 && (
                <div className="space-y-1.5">
                  {streamingToolCalls.map((tc) => (
                    <ToolCallBlock
                      key={tc.tool_id}
                      tool={tc}
                      defaultOpen={tc.status === 'running'}
                    />
                  ))}
                </div>
              )}

              {/* 3. 实时打字机 Markdown 渲染 */}
              {currentStreamingParsed.mainAnswer && (
                <div className="prose prose-invert prose-sm max-w-none break-words">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: MarkdownCodeBlock,
                    }}
                  >
                    {currentStreamingParsed.mainAnswer}
                  </ReactMarkdown>
                </div>
              )}

              {/* 4. 实时打字光标 */}
              <div className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />

              {/* 5. 实时知识库引用 */}
              {streamingCitations.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1 font-mono">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>检索溯源参考 ({streamingCitations.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {streamingCitations.map((c) => (
                      <span
                        key={c.point_id}
                        className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono"
                      >
                        [{c.source_index}] {c.filename}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 人在回路审批卡片 */}
        {pendingApproval && (
          <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 space-y-3 max-w-xl mx-auto shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>智能体申请执行敏感操作，需人工决策</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5 font-mono text-slate-300">
              <div>操作类型: <span className="text-amber-300 font-bold">{pendingApproval.action_type}</span></div>
              <div>目标对象: <span className="text-slate-200">{pendingApproval.target}</span></div>
              <div>执行理由: <span className="text-slate-400">{pendingApproval.reason}</span></div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => onApproveAction(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-medium transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>拒绝操作</span>
              </button>
              <button
                onClick={() => onApproveAction(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-md"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>批准并继续</span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入框与控制台 (Composer) */}
      <div className="p-4 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/95 to-transparent relative z-20">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Slash 指令弹窗提示 */}
          {isSlashTyping && matchingSkills.length > 0 && (
            <div className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl mb-1.5 space-y-0.5 max-h-56 overflow-y-auto">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>匹配专业技能 (Tab / Enter 选中)</span>
                <span>{matchingSkills.length} 个可用</span>
              </div>
              {matchingSkills.map((s, idx) => (
                <div
                  key={s.id}
                  onClick={() => handleSelectSkill(s)}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    idx === selectedSkillIndex
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className={`w-3.5 h-3.5 ${idx === selectedSkillIndex ? 'text-amber-300' : 'text-amber-400'}`} />
                    <span className="font-mono font-semibold">/{s.code}</span>
                    <span className={idx === selectedSkillIndex ? 'text-indigo-100' : 'text-slate-400'}>
                      {s.name}
                    </span>
                  </div>
                  {s.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-slate-300 font-mono">
                      {s.category}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 激活技能徽标或快捷芯片 */}
          {activeMatchedSkill ? (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 px-3 py-1 rounded-lg bg-amber-950/30 border border-amber-500/30 w-fit">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>当前已激活专家技能: <strong>{activeMatchedSkill.name}</strong> (/{activeMatchedSkill.code})</span>
            </div>
          ) : (
            /* 快捷 Slash 技能胶囊 */
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="text-[11px] text-slate-500 shrink-0 font-medium">推荐技能:</span>
              {skills.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSkill(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 text-[11px] text-slate-300 hover:text-white shrink-0 transition-colors cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span className="font-mono">/{s.code}</span>
                  <span className="text-slate-400">· {s.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* 输入框主容器 */}
          <div className="relative rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl focus-within:border-indigo-500/80 transition-all overflow-hidden">
            <textarea
              ref={textareaRef}
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题，或键入 '/' 调用专业技能（如 /sql_tuner, /xhs_writer）..."
              className="w-full bg-transparent p-4 text-sm text-white placeholder-slate-500 focus:outline-none resize-none"
            />

            {/* 底部操作栏 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800/60 bg-slate-900/60">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <span>Enter 发送</span>
                <span>·</span>
                <span>Shift + Enter 换行</span>
              </div>

              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <button
                    onClick={onStopStreaming}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors cursor-pointer shadow"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>停止生成</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition-all cursor-pointer shadow disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>发送</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
