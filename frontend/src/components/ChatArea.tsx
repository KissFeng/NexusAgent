import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ModelConfig, Conversation, Citation, PendingApproval, Skill } from '../types';
import {
  Send,
  Square,
  Bot,
  User,
  Settings,
  Sparkles,
  ChevronDown,
  Layers,
  BookOpen,
  ShieldAlert,
  CheckCircle,
  XCircle,
  ChevronRight,
  Zap,
  Wrench,
  Terminal,
  Brain,
} from 'lucide-react';

interface ChatAreaProps {
  currentConversation: Conversation | null;
  messages: Message[];
  streamingContent: string;
  streamingCitations: Citation[];
  pendingApproval: PendingApproval | null;
  isStreaming: boolean;
  models: ModelConfig[];
  selectedModelId: string | null;
  skills: Skill[];
  memoryCount?: number;
  onSelectModel: (id: string) => void;
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  onOpenModelConfig: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenSkills: () => void;
  onOpenTools: () => void;
  onOpenMemories: () => void;
  onApproveAction: (approved: boolean) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentConversation,
  messages,
  streamingContent,
  streamingCitations,
  pendingApproval,
  isStreaming,
  models,
  selectedModelId,
  skills,
  memoryCount,
  onSelectModel,
  onSendMessage,
  onStopStreaming,
  onOpenModelConfig,
  onOpenKnowledgeBase,
  onOpenSkills,
  onOpenTools,
  onOpenMemories,
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
  }, [messages, streamingContent, streamingCitations, pendingApproval]);

  // Slash command autocomplete logic
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

  // Active matched skill
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
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const parseSkillInvocation = (text: string) => {
    const match = text.match(/^\/([a-zA-Z0-9_]+)(?:\s+(.*))?$/s);
    if (match) {
      const code = match[1];
      const found = skills.find((s) => s.code.toLowerCase() === code.toLowerCase());
      return {
        code,
        skill: found,
        prompt: match[2] || '',
      };
    }
    return null;
  };

  const activeModel = models.find((m) => m.id === selectedModelId) || models.find((m) => m.is_default) || models[0];

  return (
    <main className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden relative">
      {/* Top Header */}
      <header className="h-14 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 bg-slate-900/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-white text-sm tracking-tight truncate max-w-sm">
            {currentConversation?.title || '新对话'}
          </h2>
        </div>

        {/* Top Actions: Skills, Tools, KB, Model Selector & Settings */}
        <div className="flex items-center gap-2">
          {/* Skills Button */}
          <button
            onClick={onOpenSkills}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
            title="管理专业技能库与 Slash 指令"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>技能库</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-300 font-mono">
              {skills.filter((s) => s.is_enabled).length}
            </span>
          </button>

          {/* Tools & MCP Button */}
          <button
            onClick={onOpenTools}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors cursor-pointer"
            title="管理智能体工具箱与 Model Context Protocol (MCP) 协议服务"
          >
            <Wrench className="w-3.5 h-3.5 text-cyan-400" />
            <span>工具 & MCP</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/15 text-cyan-300 font-mono font-semibold">
              MCP
            </span>
          </button>

          {/* Long-Term Memory Button */}
          <button
            onClick={onOpenMemories}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-purple-300 hover:text-purple-200 transition-colors cursor-pointer"
            title="查看智能体自主提取的长期记忆与偏好"
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span>记忆库</span>
            {memoryCount !== undefined && memoryCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/15 text-purple-300 font-mono">
                {memoryCount}
              </span>
            )}
          </button>

          {/* Knowledge Base Button */}
          <button
            onClick={onOpenKnowledgeBase}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors cursor-pointer"
            title="管理知识库与向量检索"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>知识库 RAG</span>
          </button>

          {/* Model Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/80 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{activeModel?.name || '选择模型'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showModelDropdown && (
              <div className="absolute right-0 top-9 z-30 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-1.5 space-y-1">
                <div className="text-[10px] text-slate-400 font-semibold px-2 py-1 uppercase">
                  可用模型
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      activeModel?.id === m.id
                        ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                        : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{m.provider}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model Config Button */}
          <button
            onClick={onOpenModelConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="配置模型与密钥"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>模型配置</span>
          </button>
        </div>
      </header>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && !streamingContent && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto my-auto text-slate-400">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500/20 via-indigo-500/20 to-purple-500/20 border border-amber-500/30 flex items-center justify-center mb-4 shadow-xl">
              <Zap className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">企业级智能体 · 专业技能与工具协同</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              已全面接入专业技能库 (Slash Commands)、联网搜索沙箱工具、Qdrant 混合检索与人在回路审批。
            </p>
            <div className="grid grid-cols-2 gap-3 w-full text-left text-xs">
              <div
                onClick={() => onSendMessage('/xhs_writer 帮我写一篇关于“企业级 AI 智能体如何降低人工成本”的爆款小红书文案')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-amber-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>爆款文案专家 (/xhs_writer)</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  流量标题二极管、黄金前三秒与互动标签标准 SOP
                </div>
              </div>

              <div
                onClick={() => onSendMessage('/code_architect 请帮我评审一段并发扣减账户余额的逻辑，分析锁竞争与分布式事务风险')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <span>架构与代码评审 (/code_architect)</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  排查并发死锁、N+1 慢查并输出 P0/P1 重构方案
                </div>
              </div>

              <div
                onClick={() => onSendMessage('/market_analyst 请对当前大模型企业落地与私有化知识库市场进行一份 SWOT 分析')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-purple-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-purple-300">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>行业研报分析 (/market_analyst)</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  麦肯锡风格 SWOT 框架与头部竞品深度横向对比
                </div>
              </div>

              <div
                onClick={() => onSendMessage('我们平台的安全守则中对高危操作是如何规定的？')}
                className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <span>知识库 RAG 问答</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                  自动 Qdrant 稠密/稀疏混合检索与溯源参考标注
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-3xl ${
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs shadow ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
              }`}
            >
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-2xl overflow-hidden ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-slate-800/80 border border-slate-700/60 text-slate-100 rounded-tl-none shadow-sm space-y-3'
              }`}
            >
              {msg.role === 'user' ? (
                (() => {
                  const invocation = parseSkillInvocation(msg.content);
                  if (invocation) {
                    return (
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
                    );
                  }
                  return <div className="whitespace-pre-wrap">{msg.content}</div>;
                })()
              ) : (
                <div className="space-y-3">
                  <div className="prose prose-invert prose-sm max-w-none break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-slate-700/60 space-y-1.5">
                      <div className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
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
                              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:border-indigo-500/50 text-[11px] text-slate-300 transition-all cursor-pointer"
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
                              <div className="mt-1 p-2 rounded bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                                {c.content}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming Real-time Bubble */}
        {isStreaming && (
          <div className="flex gap-3 max-w-3xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shrink-0 text-white shadow">
              <Bot className="w-4 h-4" />
            </div>
            <div className="rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed max-w-2xl bg-slate-800/80 border border-slate-700/60 text-slate-100 shadow-sm space-y-3">
              <div className="prose prose-invert prose-sm max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent || '思考中...'}
                </ReactMarkdown>
              </div>
              <div className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />

              {/* Real-time Streaming Citations */}
              {streamingCitations.length > 0 && (
                <div className="pt-2 border-t border-slate-700/60 space-y-1.5">
                  <div className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>检索溯源参考 ({streamingCitations.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {streamingCitations.map((c) => (
                      <div key={c.point_id} className="w-full">
                        <button
                          onClick={() =>
                            setExpandedCitationId(
                              expandedCitationId === c.point_id ? null : c.point_id
                            )
                          }
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:border-indigo-500/50 text-[11px] text-slate-300 transition-all cursor-pointer"
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
                          <div className="mt-1 p-2 rounded bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed">
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
        )}

        {/* Human-in-the-Loop Interrupt Approval Alert Card */}
        {pendingApproval && (
          <div className="max-w-2xl mx-auto my-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 shadow-xl space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">人在回路安全审批（Human-in-the-Loop）</h4>
                <p className="text-xs text-amber-300/80 mt-0.5">
                  智能体检测到敏感操作，图流转已自动中断挂起，等待管理员审批决策
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">操作类型:</span>
                <code className="text-amber-400 font-semibold">{pendingApproval.action_type}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">操作目标:</span>
                <span className="text-slate-200 font-medium">{pendingApproval.target}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">申请原因:</span>
                <span className="text-slate-200 font-medium">{pendingApproval.reason}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => onApproveAction(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                驳回操作
              </button>
              <button
                onClick={() => onApproveAction(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                批准执行
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Area */}
      <div className="p-4 bg-slate-950/80 border-t border-slate-800 relative">
        <div className="max-w-4xl mx-auto relative">
          {/* Slash Autocomplete Popover */}
          {isSlashTyping && matchingSkills.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-3 bg-slate-900/95 backdrop-blur-md border border-slate-750 rounded-2xl shadow-2xl p-2 z-30 max-h-64 overflow-y-auto space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1 text-amber-400 font-sans">
                  <Zap className="w-3.5 h-3.5" />
                  选择并激活专家技能 (Tab 或回车快速选取)
                </span>
                <span className="font-mono text-slate-500">/{slashKeyword}</span>
              </div>
              {matchingSkills.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSkill(s)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    idx === selectedSkillIndex
                      ? 'bg-amber-500/15 border border-amber-500/40 text-white'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-300">/{s.code}</span>
                        <span className="text-xs font-semibold text-white truncate">{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {s.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">{s.description}</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0 font-mono pl-2">Tab 补全</span>
                </button>
              ))}
            </div>
          )}

          <div className="relative rounded-2xl bg-slate-900 border border-slate-700/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all p-3 shadow-lg">
            {/* Active Skill Indicator */}
            {activeMatchedSkill && (
              <div className="flex items-center gap-2 px-2.5 py-1 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  当前已挂载技能: <strong>{activeMatchedSkill.name}</strong> (/{activeMatchedSkill.code})
                </span>
                <span className="text-[10px] text-amber-400/80 ml-auto font-mono">
                  关联工具: {activeMatchedSkill.bound_tools.join(', ') || '通用'}
                </span>
              </div>
            )}

            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题或指令，输入 / 快捷呼出专业技能... (Enter 发送，Shift + Enter 换行)"
              className="w-full bg-transparent text-sm text-white placeholder-slate-500 resize-none focus:outline-none pr-12"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
              <div className="text-[11px] text-slate-500 flex items-center gap-3">
                <span>
                  当前模型: <strong className="text-slate-300 font-medium">{activeModel?.name}</strong>
                </span>
                <span className="hidden sm:inline text-slate-600">|</span>
                <span className="hidden sm:inline text-slate-500">
                  输入 <code className="text-amber-400/90 font-mono">/</code> 唤起技能
                </span>
              </div>

              {isStreaming ? (
                <button
                  onClick={onStopStreaming}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  停止生成
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="flex items-center justify-center p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
