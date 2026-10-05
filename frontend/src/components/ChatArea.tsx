import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  Message,
  ModelConfig,
  Conversation,
  Citation,
  PendingApproval,
  Skill,
  ToolCallEvent,
  User,
  KnowledgeBase,
} from '../types';
import {
  Square,
  Bot,
  User as UserIcon,
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
  ArrowUp,
  Paperclip,
  Globe,
  AtSign,
  RotateCcw,
  SquarePen,
  PlusSquare,
  PanelLeft,
  SlidersHorizontal,
  GitBranch,
} from 'lucide-react';

interface ChatAreaProps {
  user?: User | null;
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
  knowledgeBases?: KnowledgeBase[];
  onSelectModel: (id: string) => void;
  onSendMessage: (
    content: string,
    options?: {
      webSearch?: boolean;
      knowledgeBaseIds?: string[];
      attachments?: string[];
    }
  ) => void;
  onStopStreaming: () => void;
  onNavigateToPlaza?: () => void;
  onNavigateToSettings?: () => void;
  onApproveAction: (approved: boolean) => void;
  onRegenerateMessage?: (messageId: string, modelId?: string) => void;
  onEditAndResendMessage?: (messageId: string, newContent: string) => void;
  onToggleSidebar?: () => void;
  onForkAtMessage?: (messageId: string) => void;
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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 select-none overflow-hidden rounded-xl border border-purple-900/40 bg-purple-950/20 shadow-sm">
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
            <span className="text-xs font-medium text-purple-300 font-mono">
              深度推演过程
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
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-purple-300 hover:text-white hover:bg-purple-800/40 transition-colors cursor-pointer"
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
        <div className="border-t border-purple-900/40 px-3.5 py-3 border-l-2 border-l-purple-500/80 bg-purple-950/30">
          <div className="font-mono text-xs text-purple-200/90 leading-relaxed whitespace-pre-wrap break-words select-text max-h-72 overflow-y-auto pr-1">
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
    label: '企业知识库检索',
    icon: <BookOpen className="w-3.5 h-3.5 text-indigo-400" />,
    border: 'border-l-indigo-500',
    bg: 'bg-indigo-950/25',
    text: 'text-indigo-300',
  },
  web_search: {
    label: '实时联网搜索',
    icon: <Search className="w-3.5 h-3.5 text-sky-400" />,
    border: 'border-l-sky-500',
    bg: 'bg-sky-950/25',
    text: 'text-sky-300',
  },
  code_interpreter: {
    label: 'Python 代码执行沙箱',
    icon: <Terminal className="w-3.5 h-3.5 text-emerald-400" />,
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-950/25',
    text: 'text-emerald-300',
  },
  call_mcp_tool: {
    label: 'MCP 扩展工具协议',
    icon: <Cpu className="w-3.5 h-3.5 text-teal-400" />,
    border: 'border-l-teal-500',
    bg: 'bg-teal-950/25',
    text: 'text-teal-300',
  },
  delegate_subtask: {
    label: '子智能体任务委派',
    icon: <Layers className="w-3.5 h-3.5 text-purple-400" />,
    border: 'border-l-purple-500',
    bg: 'bg-purple-950/25',
    text: 'text-purple-300',
  },
  execute_sensitive_action: {
    label: '高危敏感操作审批决策',
    icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />,
    border: 'border-l-amber-500',
    bg: 'bg-amber-950/25',
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
    bg: 'bg-slate-900/40',
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
    <div className={`my-2 rounded-xl border border-slate-800/80 ${cfg.bg} border-l-2 ${cfg.border} overflow-hidden shadow-sm`}>
      {/* 头部摘要栏 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3.5 py-2 text-left transition-colors hover:bg-slate-850 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight
            className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-200 ${
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
        <div className="border-t border-slate-800/80 p-3 space-y-2.5 text-xs bg-slate-950/60">
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
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60 whitespace-pre-wrap leading-relaxed select-text">
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
      <code className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-xs border border-slate-700/50" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-lg group">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
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

  const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch) {
    const extracted = thinkMatch[1].trim();
    thinking = thinking ? `${thinking}\n\n${extracted}` : extracted;
    mainAnswer = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
  }

  return { thinking: thinking.trim(), mainAnswer: mainAnswer.trim() };
}

// ─── 格式化时间戳 (对齐 Cherry Studio: 10/04 20:16) ─────────────────────────
function formatTimestamp(isoString?: string): string {
  if (!isoString) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
  }
  try {
    const d = new Date(isoString);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
  } catch {
    return '10/04 20:16';
  }
}

// ─── 附件项结构 ─────────────────────────────────────────────────────────────
interface AttachedFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
}

// ─── 主对话区组件 (ChatArea) ────────────────────────────────────────────────
export const ChatArea: React.FC<ChatAreaProps> = ({
  user,
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
  knowledgeBases = [],
  onSelectModel,
  onSendMessage,
  onStopStreaming,
  onNavigateToPlaza,
  onNavigateToSettings,
  onApproveAction,
  onRegenerateMessage,
  onEditAndResendMessage,
  onToggleSidebar,
  onForkAtMessage,
}) => {
  const [input, setInput] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [showKbPicker, setShowKbPicker] = useState(false);
  const [showMcpPopup, setShowMcpPopup] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expandedCitationId, setExpandedCitationId] = useState<string | null>(null);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');

  const handleSaveAndResend = (messageId: string) => {
    const trimmed = editingContent.trim();
    if (!trimmed) return;
    setEditingMessageId(null);
    if (onEditAndResendMessage) {
      onEditAndResendMessage(messageId, trimmed);
    } else {
      onSendMessage(trimmed);
    }
  };

  // 寻找最后一条用户消息 ID (仅在最后一条用户消息展示“编辑”按钮)
  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id;
    }
    return null;
  }, [messages]);

  // 寻找最后一条消息是否为 AI 消息 (仅在整个对话最后一条是 AI 回复时展示“重新回答”按钮)
  const lastAssistantMessageId = useMemo(() => {
    if (messages.length === 0) return null;
    const last = messages[messages.length - 1];
    return last.role === 'assistant' ? last.id : null;
  }, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;
    let finalContent = input.trim();
    if (attachedFiles.length > 0) {
      const fileNames = attachedFiles.map((f) => `[附件: ${f.name}]`).join(' ');
      finalContent = finalContent ? `${fileNames}\n${finalContent}` : fileNames;
    }

    onSendMessage(finalContent, {
      webSearch: isWebSearchActive,
      knowledgeBaseIds: selectedKbIds,
      attachments: attachedFiles.map((f) => f.name),
    });

    setInput('');
    setAttachedFiles([]);
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

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // 文件上传处理
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems: AttachedFileItem[] = Array.from(files).map((f) => ({
      id: `file-${Date.now()}-${Math.random()}`,
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setAttachedFiles((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  // 重新生成指定消息
  const handleTriggerRegenerate = (msgIndex: number, targetModelId?: string) => {
    // 寻找上一条用户消息
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        if (targetModelId) {
          onSelectModel(targetModelId);
        }
        if (onRegenerateMessage) {
          onRegenerateMessage(messages[msgIndex].id, targetModelId);
        } else {
          onSendMessage(messages[i].content);
        }
        return;
      }
    }
    // 未找到前序用户消息时，直接发送提示
    onSendMessage('请结合上文重新生成回答');
  };

  // 解析当前流式输出的 thinking 和 mainAnswer
  const currentStreamingParsed = useMemo(() => {
    return parseThinkingSegments(streamingContent, streamingThinking);
  }, [streamingContent, streamingThinking]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0F17] text-slate-100 relative overflow-hidden font-sans">
      {/* 隐藏的文件上传 input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        multiple
        className="hidden"
      />

      {/* ─── 顶部 Header (对齐 Cherry Studio: 侧边栏开关 + 默认助手 > 模型选择器) ── */}
      <header className="h-13 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 bg-slate-900/80 backdrop-blur-md z-10 select-none">
        {/* 左侧：折叠侧边栏图标 + 面包屑导航 (助手名 > 模型名) */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            title="侧边栏"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {/* 面包屑导航项 */}
          <div className="flex items-center gap-1.5 text-xs">
            {/* 默认助手徽标 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-200 font-medium border border-slate-700/40">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 ring-2 ring-emerald-400/20" />
              <span className="truncate max-w-[130px]">
                {currentConversation?.title || '默认助手'}
              </span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            {/* 模型选择器 (圆角卡片切换) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-750 text-slate-200 text-xs font-mono transition-colors cursor-pointer border border-slate-700/60 shadow-sm"
              >
                <div className="w-4 h-4 rounded bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  {selectedModel?.name ? selectedModel.name.slice(0, 1) : '默'}
                </div>
                <span className="truncate max-w-[180px]">
                  {selectedModel?.name || '选择模型'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {/* 模型切换下拉菜单 */}
              {showModelDropdown && (
                <div className="absolute left-0 mt-1.5 w-72 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                    <span>切换模型服务</span>
                    <span className="text-[9px] text-slate-500 font-mono">会话即时生效</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1 space-y-0.5">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectModel(m.id);
                          setShowModelDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                          selectedModelId === m.id
                            ? 'bg-indigo-600/20 text-indigo-300 font-medium border border-indigo-500/30'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex flex-col text-left min-w-0 pr-2">
                          <span className="truncate font-semibold">{m.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono truncate">{m.model_name}</span>
                        </div>
                        {m.is_default && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 font-mono">
                            默认
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isStreaming && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[10px] text-indigo-400 font-mono animate-pulse shrink-0">
              <Sparkles className="w-2.5 h-2.5 text-indigo-400 animate-spin" />
              推演中
            </span>
          )}
        </div>

        {/* 右侧：调参、广场、设置图标按钮组 */}
        <div className="flex items-center gap-1.5 text-slate-400">
          {/* 模型推理参数调参 (Sliders) */}
          <button
            type="button"
            onClick={() => setShowParamsModal(!showParamsModal)}
            className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title="模型推理参数调参 (Sliders)"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* 快捷进入生态广场 */}
          {onNavigateToPlaza && (
            <button
              type="button"
              onClick={onNavigateToPlaza}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 text-xs text-indigo-300 transition-colors cursor-pointer ml-1"
              title="探索 MCP 与专业技能广场"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>生态广场</span>
            </button>
          )}

          {/* 快捷进入设置 */}
          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              title="系统设置 (模型/MCP/技能/频道/定时任务)"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* 参数微调模态浮窗 */}
      {showParamsModal && (
        <div className="absolute right-4 top-14 w-76 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-4 z-40 space-y-3.5 animate-in fade-in zoom-in-95 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="font-semibold text-slate-100 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              模型推理参数控制 (Inference)
            </span>
            <button
              type="button"
              onClick={() => setShowParamsModal(false)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400 font-mono text-[11px]">
              <span>Temperature (发散度)</span>
              <span className="text-indigo-300 font-bold">0.7</span>
            </div>
            <input type="range" min="0" max="2" step="0.1" defaultValue="0.7" className="w-full accent-indigo-500" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400 font-mono text-[11px]">
              <span>Top P (核采样)</span>
              <span className="text-indigo-300 font-bold">0.95</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" defaultValue="0.95" className="w-full accent-indigo-500" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400 font-mono text-[11px]">
              <span>Max Tokens (最大长度)</span>
              <span className="text-indigo-300 font-bold">8192</span>
            </div>
            <input type="range" min="512" max="16384" step="512" defaultValue="8192" className="w-full accent-indigo-500" />
          </div>
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            当前绑定: {selectedModel?.name || '默认模型'} · 上下文窗口 128k
          </div>
        </div>
      )}

      {/* ─── 消息流主视口 (对齐 Cherry Studio: 左对齐桌面级时间线流式布局) ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* 空会话欢迎状态 */}
        {messages.length === 0 && !streamingContent && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto my-auto text-slate-400 py-12">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-sky-600/20 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-xl">
              <Bot className="w-7 h-7 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-100 mb-1">
              {currentConversation?.title || '开始一次新的对话'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              已全面集成可折叠深度思考、MCP 工具调用、企业 RAG 知识库与专业技能
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full text-left text-xs">
              <div
                onClick={() => onSendMessage('/xhs_writer 帮我写一篇关于企业级 AI 智能体提效的小红书文案')}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-medium text-amber-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">爆款文案专家 (/xhs_writer)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  黄金前三秒、痛点挖掘与爆款文案标准 SOP
                </div>
              </div>

              <div
                onClick={() => onSendMessage('/code_architect 请帮我评审一段高并发账户余额扣减代码，分析死锁与幂等设计')}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">代码评审 (/code_architect)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  并发扣减、悲观/乐观锁与一致性设计
                </div>
              </div>

              <div
                onClick={() => onSendMessage('帮我用 Python 计算斐波那契数列前 30 项并绘制增长比率')}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-medium text-emerald-300">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Python 数据计算沙箱</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  安全沙箱即时运行 Python 脚本
                </div>
              </div>

              <div
                onClick={() => onSendMessage('我们平台的安全守则中对高危操作是如何规定的？')}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-medium text-sky-300">
                  <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">知识库 RAG 问答</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  向量混合检索与精准溯源标注
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 消息条目渲染 */}
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const invocation = isUser ? parseSkillInvocation(msg.content) : null;
          const { thinking, mainAnswer } = isUser
            ? { thinking: '', mainAnswer: msg.content }
            : parseThinkingSegments(msg.content, msg.thinking);

          // Token 统计 (对齐 Cherry Studio: Tokens: 1 或 Tokens: 10904 ↑10899 ↓5)
          const totalTokens = msg.token_count || Math.max(1, Math.round((msg.content?.length || 10) / 2.5));
          const upTokens = Math.max(1, Math.round(totalTokens * 0.95));
          const downTokens = Math.max(1, totalTokens - upTokens);

          // 用户消息：靠右对齐展示 (经典气泡布局，移除 Tokens 显示)
          if (isUser) {
            return (
              <div
                key={msg.id}
                className="w-full max-w-4xl mx-auto py-2.5 px-4 flex justify-end group"
              >
                <div className="flex flex-row-reverse items-start gap-3 max-w-[85%] sm:max-w-[75%]">
                  {/* 用户头像 (最右侧) */}
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 border border-indigo-500/40 flex items-center justify-center shrink-0 text-white shadow-sm shadow-indigo-600/20 overflow-hidden mt-0.5">
                    <UserIcon className="w-4.5 h-4.5 text-white" />
                  </div>

                  {/* 用户内容区域 (靠右排列) */}
                  <div className="flex flex-col items-end min-w-0">
                    {/* 发件人与时间 (右对齐) */}
                    <div className="flex items-center gap-2 mb-1 text-xs text-slate-400">
                      <span className="font-mono text-[11px] text-slate-500">{formatTimestamp(msg.created_at)}</span>
                      <span className="font-medium text-slate-300">{user?.username || 'Power'}</span>
                    </div>

                    {/* 用户调用的技能徽标 (右对齐) */}
                    {invocation && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-mono mb-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>/{invocation.code}</span>
                        {invocation.skill && (
                          <span className="text-slate-400 font-sans">· {invocation.skill.name}</span>
                        )}
                      </div>
                    )}

                    {/* 用户消息展示区：支持行内编辑或普通气泡 */}
                    {editingMessageId === msg.id ? (
                      <div className="w-full min-w-[280px] sm:min-w-[360px] max-w-xl bg-slate-900 border border-indigo-500/60 rounded-2xl p-3 shadow-xl shadow-indigo-950/40 text-left">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveAndResend(msg.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingMessageId(null);
                            }
                          }}
                          rows={Math.min(8, Math.max(2, editingContent.split('\n').length))}
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 resize-y leading-relaxed"
                          placeholder="修改您的问题..."
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => setEditingMessageId(null)}
                            className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveAndResend(msg.id)}
                            disabled={!editingContent.trim()}
                            className="px-3.5 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-indigo-600/30 active:scale-95"
                          >
                            <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>保存并重新发送</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* 用户消息气泡 (现代深色蓝紫优雅圆角气泡) */}
                        <div className="rounded-2xl rounded-tr-sm bg-indigo-600/90 text-white px-4 py-2.5 text-sm leading-relaxed shadow-sm break-words select-text text-left">
                          <div className="whitespace-pre-wrap">
                            {invocation ? invocation.prompt : msg.content}
                          </div>
                        </div>

                        {/* 消息底部操作栏 (复制 + 仅最后一条提问的编辑，右对齐；已彻底删除 Tokens 行) */}
                        <div className="flex items-center gap-1 pt-1 text-slate-500">
                          {/* 1. 复制 */}
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, mainAnswer)}
                            className="p-1 rounded hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                            title="复制内容"
                          >
                            {copiedMessageId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* 2. 编辑 (仅保留在自己上次输入给AI的对话那条) */}
                          {msg.id === lastUserMessageId && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditingContent(msg.content);
                              }}
                              className="p-1 rounded hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="编辑提问"
                            >
                              <SquarePen className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // AI 助手消息：靠左对齐展示 (完整时间线与思考/工具/溯源/Token统计)
          const assistantModelName = msg.model_name || selectedModel?.name || '默认模型';
          const assistantInitial = assistantModelName ? assistantModelName.slice(0, 1) : '默';

          return (
            <div
              key={msg.id}
              className="w-full max-w-4xl mx-auto py-3 px-4 rounded-xl hover:bg-slate-900/40 transition-colors group flex justify-start"
            >
              <div className="flex items-start gap-3.5 max-w-[90%] sm:max-w-[85%]">
                {/* 1. 左侧头像 (绑定该条消息生成时使用的 AI 模型) */}
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 text-indigo-300 font-bold flex items-center justify-center text-xs shrink-0 shadow-sm mt-0.5" title={assistantModelName}>
                  {assistantInitial}
                </div>

                {/* 2. 右侧主体内容 */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* 第一行：发件人名称 (保持生成该回答时的模型名) */}
                  <div className="text-sm font-semibold text-slate-100 leading-snug">
                    {assistantModelName}
                  </div>

                  {/* 第二行：时间戳 */}
                  <div className="text-xs text-slate-500 font-mono">
                    {formatTimestamp(msg.created_at)}
                  </div>

                  {/* 第三行：思考过程与正文内容 */}
                  <div className="pt-1.5 space-y-2">
                    {/* 思考过程折叠块 (Assistant) */}
                    {thinking && (
                      <ReasoningBlock thinking={thinking} defaultOpen={false} />
                    )}

                    {/* 工具调用历史 (Assistant) */}
                    {msg.tool_calls && msg.tool_calls.length > 0 && (
                      <div className="space-y-1.5">
                        {msg.tool_calls.map((tc) => (
                          <ToolCallBlock key={tc.tool_id} tool={tc} defaultOpen={false} />
                        ))}
                      </div>
                    )}

                    {/* 消息正文文本 (Markdown 解答) */}
                    <div className="text-sm text-slate-200 leading-relaxed break-words font-normal">
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
                    </div>

                    {/* 知识库溯源引用 (Assistant) */}
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
                                type="button"
                                onClick={() =>
                                  setExpandedCitationId(
                                    expandedCitationId === c.point_id ? null : c.point_id
                                  )
                                }
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 transition-all cursor-pointer"
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
                              </button>
                              {expandedCitationId === c.point_id && (
                                <div className="mt-1 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed select-text">
                                  {c.content}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 第四行：Token 统计 (仅在 AI 消息保留展示) */}
                    <div className="pt-1 text-[11px] text-slate-500 font-mono select-none">
                      <span>Tokens: {totalTokens} ↑{upTokens} ↓{downTokens}</span>
                    </div>

                    {/* 第五行：消息底部操作栏 */}
                    <div className="flex items-center gap-1 pt-1 text-slate-500">
                      {/* 1. 复制 */}
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.id, mainAnswer)}
                        className="p-1.5 rounded-md hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="复制内容"
                      >
                        {copiedMessageId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* 开启分支 (AI 说的每一条话均可开启分支到左侧会话栏继续对话) */}
                      <button
                        type="button"
                        onClick={() => onForkAtMessage?.(msg.id)}
                        className="p-1.5 rounded-md hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="从此处开启分支对话"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                      </button>

                      {/* 3. 重新让 AI 回答 (仅在当前最后一条是 AI 说的且不在流式中时展示) */}
                      {msg.id === lastAssistantMessageId && !isStreaming && (
                        <button
                          type="button"
                          onClick={() => handleTriggerRegenerate(index)}
                          className="p-1.5 rounded-md hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="重新回答"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* 正在流式生成中的助手消息 (对齐 Cherry Studio) */}
        {isStreaming && (
          <div className="w-full max-w-4xl mx-auto py-3 px-4 rounded-xl hover:bg-slate-900/40 transition-colors">
            <div className="flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 text-indigo-400 font-bold flex items-center justify-center text-xs shrink-0 shadow-sm animate-pulse">
                {selectedModel?.name ? selectedModel.name.slice(0, 1) : '默'}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-sm font-semibold text-slate-100 leading-snug">
                  {selectedModel?.name || 'gpt-6.1-sol | New API'}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {formatTimestamp()} · 实时生成中
                </div>

                <div className="pt-1.5 space-y-2">
                  {/* 流式思考过程 */}
                  {(currentStreamingParsed.thinking || isStreaming) && (
                    <ReasoningBlock
                      thinking={currentStreamingParsed.thinking}
                      isStreaming={isStreaming && !currentStreamingParsed.mainAnswer}
                      defaultOpen={true}
                    />
                  )}

                  {/* 实时工具调用 */}
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

                  {/* 打字机正文渲染 */}
                  {currentStreamingParsed.mainAnswer && (
                    <div className="prose prose-invert prose-sm max-w-none break-words text-slate-200">
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

                  {/* 打字光标 */}
                  <div className="inline-block w-2 h-4 bg-indigo-400 animate-pulse align-middle" />

                  {/* 实时知识库引用 */}
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
                            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono"
                          >
                            [{c.source_index}] {c.filename}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 人在回路审批卡片 */}
        {pendingApproval && (
          <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 space-y-3 max-w-xl mx-auto shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>智能体申请执行高危敏感操作，需人工审批</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5 font-mono text-slate-300">
              <div>操作类型: <span className="text-amber-300 font-bold">{pendingApproval.action_type}</span></div>
              <div>目标对象: <span className="text-slate-200">{pendingApproval.target}</span></div>
              <div>执行理由: <span className="text-slate-400">{pendingApproval.reason}</span></div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onApproveAction(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-medium transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>拒绝操作</span>
              </button>
              <button
                type="button"
                onClick={() => onApproveAction(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-md"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>批准并执行</span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── 底部输入框与工具栏 (Composer: 对齐 Cherry Studio 图二与源码架构) ── */}
      <div className="p-4 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/95 to-transparent relative z-20">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Slash 指令弹窗提示 */}
          {isSlashTyping && matchingSkills.length > 0 && (
            <div className="p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl mb-1.5 space-y-0.5 max-h-56 overflow-y-auto">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>匹配专业技能 (Tab / Enter 选中)</span>
                <span>{matchingSkills.length} 个可用</span>
              </div>
              {matchingSkills.map((s, idx) => (
                <div
                  key={s.id}
                  onClick={() => handleSelectSkill(s)}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 text-slate-300 font-mono">
                      {s.category}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 统一快速面板 (QuickPanel: [+] 弹出聚合菜单) */}
          {showQuickPanel && (
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl mb-2 grid grid-cols-2 gap-2 max-h-60 overflow-y-auto text-xs animate-in fade-in zoom-in-95">
              <div className="col-span-2 pb-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 flex justify-between">
                <span>快捷面板 (QuickPanel)</span>
                <span className="text-slate-500">点击填入</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInput('/xhs_writer 帮我写一篇关于人工智能效率工具的爆款小红书文案');
                  setShowQuickPanel(false);
                  textareaRef.current?.focus();
                }}
                className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-200 transition-colors"
              >
                <div className="font-medium text-amber-300 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  爆款小红书文案
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">/xhs_writer 爆款文案 SOP</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput('/code_architect 请帮我评审一段高并发账户余额扣减代码，分析死锁与幂等设计');
                  setShowQuickPanel(false);
                  textareaRef.current?.focus();
                }}
                className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-200 transition-colors"
              >
                <div className="font-medium text-indigo-300 flex items-center gap-1">
                  <Terminal className="w-3 h-3" />
                  架构与代码评审
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">/code_architect 事务与防重幂等</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput('帮我用 Python 计算斐波那契数列前 30 项并绘制增长比率');
                  setShowQuickPanel(false);
                  textareaRef.current?.focus();
                }}
                className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-200 transition-colors"
              >
                <div className="font-medium text-emerald-300 flex items-center gap-1">
                  <Terminal className="w-3 h-3" />
                  Python 代码沙箱
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">数据推演与图表计算</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput('我们平台的安全守则中对高危操作是如何规定的？');
                  setShowQuickPanel(false);
                  textareaRef.current?.focus();
                }}
                className="p-2.5 text-left rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 text-slate-200 transition-colors"
              >
                <div className="font-medium text-sky-300 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  知识库合规问答
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">精准溯源企业知识库内容</div>
              </button>
            </div>
          )}

          {/* 知识库选择器弹窗 (Knowledge Base Picker) */}
          {showKbPicker && (
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl mb-2 text-xs animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  选择关联知识库检索范围
                </span>
                <button
                  type="button"
                  onClick={() => setShowKbPicker(false)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {knowledgeBases.length === 0 ? (
                  <div className="text-slate-500 text-center py-2">暂无知识库，请先在知识库模块创建</div>
                ) : (
                  knowledgeBases.map((kb) => {
                    const isSelected = selectedKbIds.includes(kb.id);
                    return (
                      <div
                        key={kb.id}
                        onClick={() => {
                          setSelectedKbIds((prev) =>
                            isSelected ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                          );
                        }}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{kb.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {kb.document_count} 文档
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* MCP 工具箱状态弹窗 (MCP Tool Popup) */}
          {showMcpPopup && (
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl mb-2 text-xs animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-teal-400" />
                  MCP 外部协议工具箱服务
                </span>
                <button
                  type="button"
                  onClick={() => setShowMcpPopup(false)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                当前智能体已挂载外部 MCP 扩展工具支持，可在设置中配置并启停更多 MCP Server。
              </p>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="text-[10px] text-emerald-400 font-mono">MCP 连接协议: 活跃中</span>
                {onNavigateToSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMcpPopup(false);
                      onNavigateToSettings();
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px]"
                  >
                    前往 MCP 管理
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 挂载的 Token 标签区域 (附件、知识库范围、联网搜索状态) */}
          {(attachedFiles.length > 0 || selectedKbIds.length > 0 || isWebSearchActive) && (
            <div className="flex items-center gap-2 flex-wrap px-1">
              {/* 联网搜索激活徽标 */}
              {isWebSearchActive && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-950/60 border border-sky-500/40 text-sky-300 text-xs font-mono shadow-sm">
                  <Globe className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                  <span>实时联网检索: 已开启</span>
                  <button
                    type="button"
                    onClick={() => setIsWebSearchActive(false)}
                    className="hover:text-white cursor-pointer ml-1 text-slate-400"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 知识库范围徽标 */}
              {selectedKbIds.map((kbId) => {
                const kb = knowledgeBases.find((k) => k.id === kbId);
                return (
                  <div
                    key={kbId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 text-xs shadow-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span>知识库: {kb?.name || '指定知识库'}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedKbIds((prev) => prev.filter((id) => id !== kbId))}
                      className="hover:text-white cursor-pointer ml-1 text-slate-400"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              {/* 挂载的附件列表 */}
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-850 border border-slate-700 text-slate-200 text-xs shadow-sm"
                >
                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                    className="hover:text-rose-400 cursor-pointer ml-1 text-slate-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 激活技能徽标提示 */}
          {activeMatchedSkill && (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 px-3 py-1 rounded-lg bg-amber-950/20 border border-amber-500/30 w-fit">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>当前已挂载技能: <strong>{activeMatchedSkill.name}</strong> (/{activeMatchedSkill.code})</span>
            </div>
          )}

          {/* 输入框主卡片容器 (对齐 Cherry Studio 图二底部暗黑圆角盒子与深蓝高亮) */}
          <div className="relative rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-2xl focus-within:border-indigo-500/70 transition-all p-3">
            {/* 多行输入文本域 */}
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="在这里输入消息，按 Enter 发送"
              className="w-full bg-transparent px-1 py-1 text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none min-h-[48px]"
            />

            {/* 底部功能工具栏 (对齐 Cherry Studio 图二底部横向排版与真实事件) */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-1">
              {/* 左侧工具栏按钮组: [+], 附件, 联网, 知识库, MCP, @, 分割线, 更多 */}
              <div className="flex items-center gap-1 text-slate-400">
                {/* 快捷面板 [+] */}
                <button
                  type="button"
                  onClick={() => setShowQuickPanel(!showQuickPanel)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    showQuickPanel ? 'text-indigo-400 bg-indigo-500/15' : 'hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="预设提示词与常用工具面板 (QuickPanel)"
                >
                  <PlusSquare className="w-4 h-4" />
                </button>

                {/* 附件上传 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="上传文件/附件 (Attachment)"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* 实时联网搜索切换 */}
                <button
                  type="button"
                  onClick={() => setIsWebSearchActive(!isWebSearchActive)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isWebSearchActive
                      ? 'text-sky-400 bg-sky-500/20 border border-sky-500/40'
                      : 'hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title={isWebSearchActive ? '联网搜索已开启' : '点击开启实时联网搜索 (Web Search)'}
                >
                  <Globe className="w-4 h-4" />
                </button>

                {/* 知识库引用 */}
                <button
                  type="button"
                  onClick={() => setShowKbPicker(!showKbPicker)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    showKbPicker || selectedKbIds.length > 0
                      ? 'text-indigo-400 bg-indigo-500/15'
                      : 'hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="指定企业知识库检索范围 (Knowledge Base)"
                >
                  <BookOpen className="w-4 h-4" />
                </button>

                {/* MCP 工具箱 */}
                <button
                  type="button"
                  onClick={() => setShowMcpPopup(!showMcpPopup)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    showMcpPopup ? 'text-teal-400 bg-teal-500/15' : 'hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="外部 MCP 服务协议状态 (MCP Status)"
                >
                  <Cpu className="w-4 h-4" />
                </button>

                {/* @ 技能呼出 */}
                <button
                  type="button"
                  onClick={() => {
                    setInput('/');
                    textareaRef.current?.focus();
                  }}
                  className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="呼出专业技能与智能体 (/)"
                >
                  <AtSign className="w-4 h-4" />
                </button>

                {/* 分割线 */}
                <span className="h-3.5 w-px bg-slate-800 mx-1" />

                {/* 更多生态广场探索 */}
                <button
                  type="button"
                  onClick={() => onNavigateToPlaza?.()}
                  className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="生态广场探索"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* 右侧动作按钮组: 经典圆形发送按钮 (保留统一主题高亮) */}
              <div className="flex items-center gap-2">
                {/* 经典圆形发送按钮 (对齐 Cherry Studio 图二形状，保留系统统一高亮) */}
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopStreaming}
                    className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-rose-600/30"
                    title="停止生成"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() && attachedFiles.length === 0}
                    className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-indigo-600/30"
                    title="发送消息"
                  >
                    <ArrowUp className="w-4 h-4 stroke-[2.5]" />
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
