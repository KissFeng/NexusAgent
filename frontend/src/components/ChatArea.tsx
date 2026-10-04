import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ModelConfig, Conversation } from '../types';
import {
  Send,
  Square,
  Bot,
  User,
  Settings,
  Sparkles,
  ChevronDown,
  Layers,
} from 'lucide-react';

interface ChatAreaProps {
  currentConversation: Conversation | null;
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  models: ModelConfig[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  onOpenModelConfig: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentConversation,
  messages,
  streamingContent,
  isStreaming,
  models,
  selectedModelId,
  onSelectModel,
  onSendMessage,
  onStopStreaming,
  onOpenModelConfig,
}) => {
  const [input, setInput] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

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

        {/* Top Actions: Model Selector & Settings */}
        <div className="flex items-center gap-2.5">
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
            <h3 className="text-lg font-bold text-white mb-2">欢迎使用企业级 Agent 对话</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              系统已就绪！支持多空间权限隔离、多模型快速切换与 SSE 实时流式交互。
            </p>
            <div className="grid grid-cols-2 gap-3 w-full text-left text-xs">
              <div
                onClick={() => onSendMessage('介绍一下你自己和这个系统的架构特点')}
                className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
              >
                <div className="font-medium text-slate-200">系统架构特点 🚀</div>
                <div className="text-[11px] text-slate-500 mt-1">询问企业级 Agent 骨架</div>
              </div>
              <div
                onClick={() => onSendMessage('用 Python 写一个支持 SSE 流式返回的简单例子')}
                className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
              >
                <div className="font-medium text-slate-200">代码编写测试 💻</div>
                <div className="text-[11px] text-slate-500 mt-1">测试大模型流式生成</div>
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
                  : 'bg-slate-800/80 border border-slate-700/60 text-slate-100 rounded-tl-none shadow-sm'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
            <div className="rounded-2xl rounded-tl-none px-4 py-3 text-sm leading-relaxed max-w-2xl bg-slate-800/80 border border-slate-700/60 text-slate-100 shadow-sm">
              <div className="prose prose-invert prose-sm max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent || '思考中...'}
                </ReactMarkdown>
              </div>
              <div className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
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
              placeholder="输入你的消息... (Enter 发送，Shift + Enter 换行)"
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
