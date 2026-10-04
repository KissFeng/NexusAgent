import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ModelConfig, Conversation, Citation, PendingApproval } from '../types';
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
  onSelectModel: (id: string) => void;
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  onOpenModelConfig: () => void;
  onOpenKnowledgeBase: () => void;
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
  onSelectModel,
  onSendMessage,
  onStopStreaming,
  onOpenModelConfig,
  onOpenKnowledgeBase,
  onApproveAction,
}) => {
  const [input, setInput] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [expandedCitationId, setExpandedCitationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingCitations, pendingApproval]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

        {/* Top Actions: KB, Model Selector & Settings */}
        <div className="flex items-center gap-2.5">
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
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto my-auto text-slate-400">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-xl">
              <Layers className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">企业级 LangGraph 智能体平台</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              已挂载 Qdrant 混合检索 RAG 知识库与人在回路审批中断防护机制。
            </p>
            <div className="grid grid-cols-2 gap-3 w-full text-left text-xs">
              <div
                onClick={() => onSendMessage('我们平台的安全守则中对高危操作是如何规定的？')}
                className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
              >
                <div className="font-medium text-slate-200">知识库 RAG 问答 📚</div>
                <div className="text-[11px] text-slate-500 mt-1">自动混合检索与溯源标注</div>
              </div>
              <div
                onClick={() => onSendMessage('请帮我向全体研发人员发布一条全员公告：明天召开安全架构评审会')}
                className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
              >
                <div className="font-medium text-slate-200">人在回路高危审批 🛡️</div>
                <div className="text-[11px] text-slate-500 mt-1">触发安全中断与人工决策</div>
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
                <div className="whitespace-pre-wrap">{msg.content}</div>
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
                              onClick={() => setExpandedCitationId(expandedCitationId === c.point_id ? null : c.point_id)}
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
                          onClick={() => setExpandedCitationId(expandedCitationId === c.point_id ? null : c.point_id)}
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
      <div className="p-4 bg-slate-950/80 border-t border-slate-800">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-2xl bg-slate-900 border border-slate-700/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all p-3 shadow-lg">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题或指令... (Enter 发送，Shift + Enter 换行)"
              className="w-full bg-transparent text-sm text-white placeholder-slate-500 resize-none focus:outline-none pr-12"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
              <div className="text-[11px] text-slate-500">
                当前运行模型: <span className="text-slate-300 font-medium">{activeModel?.name}</span>
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
