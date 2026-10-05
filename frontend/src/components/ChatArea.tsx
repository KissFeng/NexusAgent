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
  Search,
  Cpu,
  Copy,
  Check,
  ArrowUp,
  Paperclip,
  Globe,
  Folder,
  AtSign,
  RotateCcw,
  SquarePen,
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
  activeAgent?: Skill | null;
  onEditAgent?: (agent: Skill) => void;
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

// ─── 思考过程组件 (Reasoning / Thinking) - 图一 ClaudeCode 极轻量工程风 ──────
interface ReasoningBlockProps {
  thinking: string;
  isStreaming?: boolean;
  defaultOpen?: boolean;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  thinking,
  isStreaming = false,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  if (!thinking && !isStreaming) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-1.5 select-none overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/35 hover:bg-slate-900/55 transition-colors">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2.5 py-1 text-left text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ChevronRight
            className={`w-3 h-3 text-slate-500 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
          <Sparkles className="w-3.5 h-3.5 text-indigo-400/90 shrink-0" />
          <span className="font-medium text-slate-300">思考过程</span>
          {isStreaming ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-indigo-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
              正在深度思考...
            </span>
          ) : (
            thinking && (
              <span className="text-[11px] text-slate-500 font-mono">
                ({thinking.trim().length} 字符)
              </span>
            )
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isOpen && thinking && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="复制思考过程"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-800/80 px-3 py-2 border-l-2 border-l-indigo-500/50 bg-slate-950/40">
          <div className="font-mono text-xs text-slate-300/90 leading-relaxed whitespace-pre-wrap break-words select-text max-h-64 overflow-y-auto">
            {thinking || (isStreaming ? '正在组织思考架构与推演步骤...' : '')}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 工具调用单行折叠组件 (参考 ClaudeCodeUI ToolRenderer / CollapsibleSection) ─
interface ToolCallBlockProps {
  tool: ToolCallEvent;
  defaultOpen?: boolean;
}

const TOOL_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; border: string; accentText: string }
> = {
  search_knowledge_base: {
    label: 'KnowledgeBase',
    icon: <BookOpen className="w-3 h-3 text-indigo-400" />,
    border: 'border-l-indigo-500',
    accentText: 'text-indigo-400',
  },
  web_search: {
    label: 'WebSearch',
    icon: <Search className="w-3 h-3 text-sky-400" />,
    border: 'border-l-sky-500',
    accentText: 'text-sky-400',
  },
  fetch_web_page: {
    label: 'WebReader',
    icon: <Globe className="w-3 h-3 text-cyan-400" />,
    border: 'border-l-cyan-500',
    accentText: 'text-cyan-400',
  },
  bash_executor: {
    label: 'Bash',
    icon: <Terminal className="w-3 h-3 text-emerald-400" />,
    border: 'border-l-emerald-500',
    accentText: 'text-emerald-400',
  },
  file_system: {
    label: 'FileSystem',
    icon: <Folder className="w-3 h-3 text-amber-400" />,
    border: 'border-l-amber-500',
    accentText: 'text-amber-400',
  },
  code_interpreter: {
    label: 'CodeInterpreter',
    icon: <Terminal className="w-3 h-3 text-emerald-400" />,
    border: 'border-l-emerald-500',
    accentText: 'text-emerald-400',
  },
  call_mcp_tool: {
    label: 'MCP',
    icon: <Cpu className="w-3 h-3 text-teal-400" />,
    border: 'border-l-teal-500',
    accentText: 'text-teal-400',
  },
  delegate_subtask: {
    label: 'Subagent',
    icon: <Layers className="w-3 h-3 text-purple-400" />,
    border: 'border-l-purple-500',
    accentText: 'text-purple-400',
  },
  execute_sensitive_action: {
    label: 'Approval',
    icon: <ShieldAlert className="w-3 h-3 text-amber-400" />,
    border: 'border-l-amber-500',
    accentText: 'text-amber-400',
  },
};

export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ tool, defaultOpen = false }) => {
  const isError = tool.status === 'error';
  const [isOpen, setIsOpen] = useState(defaultOpen || isError);
  const [copied, setCopied] = useState(false);

  const cfg = TOOL_CONFIG[tool.tool_name] || {
    label: tool.tool_name,
    icon: <Wrench className="w-3 h-3 text-slate-400" />,
    border: isError ? 'border-l-rose-500' : 'border-l-slate-600',
    accentText: 'text-slate-300',
  };

  // 提取人性化单行参数摘要 (对齐 ClaudeCodeUI OneLineDisplay)
  const getArgsSummary = (): string => {
    if (!tool.args) return 'Parameters';
    if (tool.tool_name === 'bash_executor' || tool.args.command) {
      const cmdFirst = (tool.args.command || '').trim().split('\n')[0];
      return cmdFirst.length > 55 ? `$ ${cmdFirst.slice(0, 55)}...` : `$ ${cmdFirst}`;
    }
    if (tool.tool_name === 'file_system' || tool.args.action) {
      return `${tool.args.action || 'op'} ${tool.args.path || ''}`;
    }
    if (tool.args.query) return `"${tool.args.query}"`;
    if (tool.args.code) {
      const codeFirst = tool.args.code.trim().split('\n')[0];
      return codeFirst.length > 45 ? `${codeFirst.slice(0, 45)}...` : codeFirst;
    }
    if (tool.args.tool_name) return `${tool.args.tool_name}`;
    if (tool.args.url) return `${tool.args.url}`;
    if (tool.args.instruction) {
      return tool.args.instruction.length > 40
        ? `"${tool.args.instruction.slice(0, 40)}..."`
        : `"${tool.args.instruction}"`;
    }
    try {
      const s = JSON.stringify(tool.args);
      return s.length > 45 ? s.slice(0, 45) + '...' : s;
    } catch {
      return 'Parameters';
    }
  };

  const summary = getArgsSummary();

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = tool.content || JSON.stringify(tool.args, null, 2);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTerminal = tool.tool_name === 'code_interpreter';

  return (
    <div className={`my-1 select-none overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/35 border-l-2 ${isError ? 'border-l-rose-500' : cfg.border} transition-all`}>
      {/* 极简单行折叠头部 (对齐 ClaudeCodeUI 图一) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2.5 py-1 text-left text-xs transition-colors hover:bg-slate-850/60 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ChevronRight
            className={`w-3 h-3 text-slate-500 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
          <span className="shrink-0">{cfg.icon}</span>
          <span className={`font-medium ${cfg.accentText} shrink-0`}>{cfg.label}</span>
          <span className="text-[10px] text-slate-600 shrink-0">/</span>
          <span className="truncate font-mono text-[11px] text-slate-400 max-w-md">
            {summary}
          </span>
        </div>

        {/* 右侧微型状态标 (对齐图一) */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {tool.status === 'running' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              Running
            </span>
          ) : tool.status === 'completed' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-medium text-rose-400 bg-rose-500/15 border border-rose-500/40">
              Error
            </span>
          )}
        </div>
      </button>

      {/* 点击展开抽屉 */}
      {isOpen && (
        <div className="border-t border-slate-800/80 p-2.5 space-y-2 text-xs bg-slate-950/50">
          {/* 异常提示栏 (图一风格) */}
          {isError && tool.content && (
            <div className="rounded border border-rose-500/30 bg-rose-950/20 px-2.5 py-1.5 text-xs text-rose-300 font-mono flex items-start gap-1.5 leading-relaxed">
              <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 break-all">
                <span className="font-semibold text-rose-400">错误：</span>
                {tool.content}
              </div>
            </div>
          )}

          {/* 终端风格代码执行结果 (如果为 code_interpreter) */}
          {isTerminal && tool.args?.code && (
            <div className="rounded bg-slate-950 border border-slate-800/80 p-2 font-mono text-[11px]">
              <div className="text-slate-500 flex items-center gap-1 mb-1">
                <span className="text-emerald-400 font-bold">$</span> python3
              </div>
              <pre className="text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
                {tool.args.code}
              </pre>
            </div>
          )}

          {/* 普通结果产出 */}
          {!isError && tool.content && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                <span>执行结果</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
              </div>
              <pre className="p-2 rounded bg-slate-900/80 border border-slate-800/80 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-52 whitespace-pre-wrap leading-relaxed select-text">
                {tool.content}
              </pre>
            </div>
          )}

          {/* raw params 二级微型折叠 (满足工程查看需求，平时不占视线) */}
          {tool.args && Object.keys(tool.args).length > 0 && (
            <details className="group/details mt-1 pt-1 border-t border-slate-800/60">
              <summary className="text-[10px] font-mono text-slate-500 hover:text-slate-400 cursor-pointer list-none flex items-center gap-1 py-0.5">
                <ChevronRight className="w-2.5 h-2.5 transition-transform group-open/details:rotate-90" />
                <span>raw params</span>
              </summary>
              <pre className="mt-1 p-2 rounded bg-slate-950 border border-slate-800/80 font-mono text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

// ─── 知识库检索溯源卡片组件 (融入图一工具流风格) ──────────────────────────
export const CitationsBlock: React.FC<{ citations: Citation[] }> = ({ citations }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!citations || citations.length === 0) return null;

  return (
    <div className="my-1 select-none overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/35 border-l-2 border-l-indigo-500 transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-2.5 py-1 text-left text-xs transition-colors hover:bg-slate-850/60 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ChevronRight
            className={`w-3 h-3 text-slate-500 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
          <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
          <span className="font-medium text-indigo-400 shrink-0">KnowledgeBase</span>
          <span className="text-[10px] text-slate-600 shrink-0">/</span>
          <span className="truncate font-mono text-[11px] text-slate-400">
            命中 {citations.length} 篇参考知识库片段
          </span>
        </div>

        <span className="text-[10px] font-mono text-indigo-400/85 px-1.5 py-0.2 rounded bg-indigo-500/10 border border-indigo-500/20">
          {citations.length} citations
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-800/80 p-2 space-y-1.5 text-xs bg-slate-950/50">
          {citations.map((c, idx) => (
            <div key={c.point_id || idx} className="rounded border border-slate-800/80 bg-slate-900/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-semibold text-indigo-400 shrink-0">[{c.source_index || idx + 1}]</span>
                  <span className="text-slate-200 truncate">{c.filename}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-emerald-400">
                  <span>匹配: {c.score <= 1 ? `${(c.score * 100).toFixed(1)}%` : c.score}</span>
                  <ChevronRight
                    className={`w-2.5 h-2.5 text-slate-500 transition-transform ${
                      expandedIndex === idx ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>
              {expandedIndex === idx && (
                <div className="border-t border-slate-800/80 p-2.5 text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed select-text bg-slate-950/60 font-mono">
                  {c.content}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── 代码块与行内 Code 组件 (彻底修复 react-markdown v9+ 行内 code 标签被误判为大代码块的问题) ──
export const MarkdownCodeBlock: React.FC<{
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  forceBlock?: boolean;
}> = ({ node: _node, inline: _inline, className, children, forceBlock, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children ?? '').replace(/\n$/, '');

  // react-markdown v9+ 不再向 code 传入 inline 标识
  // 仅在 pre 组件中通过 forceBlock 强制标识代码块，或显式带 language- 类名、或含多行换行时视为代码块
  const isBlock = forceBlock || Boolean(className && className.includes('language-')) || /[\r\n]/.test(codeString);

  // 行内高亮小胶囊标签 (对齐图二风格：深色精致小药丸背景、圆角、柔和外框、等宽字体与微边距)
  if (!isBlock) {
    return (
      <code
        className={`mx-0.5 px-1.5 py-0.5 rounded-md bg-slate-800/90 border border-slate-700/60 font-mono text-[0.875em] text-slate-100 select-text break-words align-baseline inline ${
          className || ''
        }`}
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-lg group">
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
      <pre className="p-3 overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
};

// ─── 全套 Markdown 排版与表格美化组件 (彻底解决表格无框线、间距不均) ────────
export const markdownComponents = {
  code: MarkdownCodeBlock,
  pre: ({ children }: { children?: React.ReactNode }) => {
    const child = Array.isArray(children) ? children.find(React.isValidElement) : children;
    if (React.isValidElement(child) && child.type === MarkdownCodeBlock) {
      return React.cloneElement(child, { forceBlock: true } as any);
    }
    return <>{children}</>;
  },
  table: ({ children }: any) => (
    <div className="my-3 w-full overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/60 shadow-md">
      <table className="min-w-full divide-y divide-slate-700/80 border-collapse text-left text-xs sm:text-sm text-slate-200">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-slate-800/90 text-slate-100 font-semibold border-b border-slate-700/80">
      {children}
    </thead>
  ),
  tbody: ({ children }: any) => (
    <tbody className="divide-y divide-slate-800/80 bg-slate-900/30">
      {children}
    </tbody>
  ),
  tr: ({ children }: any) => (
    <tr className="hover:bg-slate-800/50 transition-colors even:bg-slate-900/30">
      {children}
    </tr>
  ),
  th: ({ children }: any) => (
    <th className="px-4 py-2.5 font-semibold text-slate-200 text-xs tracking-wider border-r border-slate-700/60 last:border-r-0 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-4 py-2 text-xs sm:text-sm text-slate-300 border-r border-slate-800/60 last:border-r-0 leading-relaxed align-top">
      {children}
    </td>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-indigo-500/60 pl-3.5 py-1 my-2 text-slate-300 bg-slate-900/40 rounded-r-lg text-xs sm:text-sm italic">
      {children}
    </blockquote>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside space-y-1 my-1.5 text-slate-200 text-xs sm:text-sm">
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside space-y-1 my-1.5 text-slate-200 text-xs sm:text-sm">
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="text-xs sm:text-sm leading-relaxed text-slate-200">
      {children}
    </li>
  ),
  hr: () => (
    <hr className="my-3 border-slate-800" />
  ),
  p: ({ children }: any) => (
    <p className="my-1.5 leading-relaxed text-slate-200 text-xs sm:text-sm">
      {children}
    </p>
  ),
  a: ({ href, children }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors font-medium inline-flex items-center gap-0.5"
    >
      {children}
    </a>
  ),
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
  activeAgent = null,
  onEditAgent,
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
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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
            {/* 智能体模式 vs 通用对话徽标 */}
            {activeAgent ? (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-indigo-950/40 text-slate-100 font-medium border border-indigo-500/30 shadow-sm">
                <div className="w-5 h-5 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-white truncate max-w-[140px]">{activeAgent.name}</span>
                  <span className="text-[10px] text-indigo-400 font-mono">/{activeAgent.code}</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-medium ml-0.5">
                    {activeAgent.category}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-200 font-medium border border-slate-700/40">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 ring-2 ring-emerald-400/20" />
                <span className="truncate max-w-[130px]">
                  {currentConversation?.title || '通用对话'}
                </span>
              </div>
            )}

            {/* 智能体已绑定能力状态胶囊 */}
            {activeAgent && (
              <div className="hidden lg:flex items-center gap-1.5 ml-1">
                {activeAgent.bound_tools?.includes('search_knowledge_base') && (
                  <span className="flex items-center gap-1 text-[10px] text-indigo-300 px-2 py-0.5 rounded-md bg-indigo-950/40 border border-indigo-500/20">
                    <BookOpen className="w-3 h-3 text-indigo-400" />
                    企业知识库
                  </span>
                )}
                {activeAgent.bound_tools?.includes('web_search') && (
                  <span className="flex items-center gap-1 text-[10px] text-sky-300 px-2 py-0.5 rounded-md bg-sky-950/40 border border-sky-500/20">
                    <Globe className="w-3 h-3 text-sky-400" />
                    实时联网
                  </span>
                )}
                {activeAgent.bound_tools?.includes('fetch_web_page') && (
                  <span className="flex items-center gap-1 text-[10px] text-cyan-300 px-2 py-0.5 rounded-md bg-cyan-950/40 border border-cyan-500/20">
                    <Globe className="w-3 h-3 text-cyan-400" />
                    网页深度阅读
                  </span>
                )}
                {activeAgent.bound_tools?.includes('code_interpreter') && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-300 px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-500/20">
                    <Terminal className="w-3 h-3 text-emerald-400" />
                    Python沙箱
                  </span>
                )}
                {activeAgent.bound_tools?.includes('bash_executor') && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-300 px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-500/20">
                    <Terminal className="w-3 h-3 text-emerald-400" />
                    Bash沙箱
                  </span>
                )}
                {currentConversation?.project_path && (
                  <span
                    className="flex items-center gap-1 text-[10px] text-amber-300 px-2 py-0.5 rounded-md bg-amber-950/40 border border-amber-500/20 cursor-help"
                    title={`当前关联的项目执行目录: ${currentConversation.project_path}`}
                  >
                    <Folder className="w-3 h-3 text-amber-400" />
                    {currentConversation.project_path.split('/').pop() || '关联工程'}
                  </span>
                )}
              </div>
            )}

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

        {/* 右侧：调参、智能体配置、广场、设置图标按钮组 */}
        <div className="flex items-center gap-1.5 text-slate-400">
          {/* 智能体配置入口 */}
          {activeAgent && onEditAgent && (
            <button
              type="button"
              onClick={() => onEditAgent(activeAgent)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 text-xs text-indigo-300 transition-colors cursor-pointer mr-1"
              title="配置当前智能体的人设、提示词与工具"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              <span>配置智能体</span>
            </button>
          )}

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
            {activeAgent ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600/30 via-purple-600/30 to-pink-600/30 border border-indigo-500/40 flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/10">
                  <Bot className="w-8 h-8 text-indigo-400" />
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono mb-2">
                  <span>业务专属智能体</span>
                  <span>·</span>
                  <span>/{activeAgent.code}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-2">
                  我是【{activeAgent.name}】
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-6 max-w-md">
                  {activeAgent.description}
                </p>

                {/* 智能体专属 Starter Prompts */}
                <div className="grid grid-cols-2 gap-2.5 w-full text-left text-xs">
                  {activeAgent.code === 'xhs_writer' ? (
                    <>
                      <div
                        onClick={() => onSendMessage('帮我写一篇关于企业级 AI 智能体提效的小红书爆款文案')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-amber-300">
                          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">爆款文案快速创作</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          黄金前三秒、痛点挖掘与爆款排版 SOP
                        </div>
                      </div>
                      <div
                        onClick={() => onSendMessage('将一段技术文档转化为通俗生动的种草笔记')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-amber-300">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">技术干货降维种草</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          把复杂晦涩逻辑转为生动通俗语言
                        </div>
                      </div>
                      <div
                        onClick={() => onSendMessage('为一款程序员养生茶拟定 5 个高点击标题与排版')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-amber-300">
                          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">爆款标题矩阵测试</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          疑问、情绪对比与共鸣感标题设计
                        </div>
                      </div>
                      <div
                        onClick={() => onSendMessage('按照爆款 SOP 梳理脚本大纲与完播率设计')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-amber-300">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">完播率节奏把控</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          开头钩子、中间干货与结尾引导互动
                        </div>
                      </div>
                    </>
                  ) : activeAgent.code === 'code_architect' ? (
                    <>
                      <div
                        onClick={() => onSendMessage('请帮我评审一段高并发账户余额扣减代码，分析死锁与幂等设计')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                          <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">高并发扣减评审</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          并发扣减、悲观/乐观锁与事务一致性
                        </div>
                      </div>
                      <div
                        onClick={() => onSendMessage('为当前的微服务架构设计多租户数据库隔离方案')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                          <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">多租户隔离架构</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          独立Schema vs 共享字段级别安全设计
                        </div>
                      </div>
                      <div
                        onClick={() => onSendMessage('评估 LangGraph 状态图与传统 ReAct 循环的选型优缺点')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                          <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">Agent 状态机选型</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          Checkpoints 状态保存、回滚与人工审批流
                        </div>
                      </div>
                      <div
                        onClick={() => onSendMessage('如何优化高并发环境下的慢 SQL 并制定索引策略')}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                          <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">慢 SQL 与索引优化</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          Explain 执行计划、联合索引与回表成本
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        onClick={() => onSendMessage(`请向我介绍一下作为【${activeAgent.name}】，你的专业职责与标准 SOP 流程`)}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">专家 SOP 与执行框架</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          了解该智能体的专业分工与核心能力边界
                        </div>
                      </div>
                      <div
                        onClick={() => onSendMessage(`请结合你的知识库与能力，帮我制定一份实施建议方案`)}
                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">实施方案与目标拆解</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          自动结合专属知识库输出针对性解决方案
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
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

                  <div
                    onClick={() => onSendMessage('请帮我总结一下当下大模型领域 Agent 的主要技术演进路线')}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-indigo-300">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">技术趋势分析</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      ReAct 范式、状态图与多智能体协同
                    </div>
                  </div>

                  <div
                    onClick={() => onSendMessage('搜索一下今天科技领域的最新热点新闻')}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-850 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-sky-300">
                      <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">联网实时资讯</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      实时检索并归纳最新动态
                    </div>
                  </div>
                </div>
              </>
            )}
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

                    {/* 知识库溯源引用 (Assistant - 工具流前置展示) */}
                    {msg.citations && msg.citations.length > 0 && (
                      <CitationsBlock citations={msg.citations} />
                    )}

                    {/* 消息正文文本 (Markdown 解答) */}
                    <div className="text-sm text-slate-200 leading-relaxed break-words font-normal">
                      <div className="prose prose-invert prose-sm max-w-none break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {mainAnswer}
                        </ReactMarkdown>
                      </div>
                    </div>

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

                  {/* 实时知识库引用 (前置展示) */}
                  {streamingCitations && streamingCitations.length > 0 && (
                    <CitationsBlock citations={streamingCitations} />
                  )}

                  {/* 打字机正文渲染 */}
                  {currentStreamingParsed.mainAnswer && (
                    <div className="prose prose-invert prose-sm max-w-none break-words text-slate-200">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {currentStreamingParsed.mainAnswer}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* 打字光标 */}
                  <div className="inline-block w-2 h-4 bg-indigo-400 animate-pulse align-middle" />
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

          {/* 激活技能/智能体徽标提示 */}
          {activeAgent ? (
            <div className="flex items-center gap-1.5 text-xs text-indigo-300 px-3 py-1 rounded-lg bg-indigo-950/30 border border-indigo-500/30 w-fit shadow-sm">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              <span>专属智能体: <strong>{activeAgent.name}</strong> (/{activeAgent.code})</span>
            </div>
          ) : activeMatchedSkill ? (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 px-3 py-1 rounded-lg bg-amber-950/20 border border-amber-500/30 w-fit">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>当前已挂载技能: <strong>{activeMatchedSkill.name}</strong> (/{activeMatchedSkill.code})</span>
            </div>
          ) : null}

          {/* 输入框主卡片容器 (对齐 Cherry Studio 图二底部暗黑圆角盒子与深蓝高亮) */}
          <div className="relative rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-2xl focus-within:border-indigo-500/70 transition-all p-3">
            {/* 多行输入文本域 */}
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeAgent ? `向「${activeAgent.name}」提问，按 Enter 发送...` : "在这里输入消息，按 Enter 发送..."}
              className="w-full bg-transparent px-1 py-1 text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none min-h-[48px]"
            />

            {/* 底部功能工具栏: 极简纯粹，移除冗余干扰项 */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-1">
              {/* 左侧实用工具: 附件、联网、快捷指令 */}
              <div className="flex items-center gap-1 text-slate-400">
                {/* 附件上传 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="上传本地附件 (Attachment)"
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
                  title={isWebSearchActive ? '联网搜索已开启' : '点击开启实时联网搜索'}
                >
                  <Globe className="w-4 h-4" />
                </button>

                {/* @ / 技能快捷呼出 */}
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
              </div>

              {/* 右侧动作按钮组: 发送提示与经典发送按钮 */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 hidden sm:inline select-none">
                  Enter 发送 · Shift + Enter 换行
                </span>

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