import React, { useState } from 'react';
import type { Workspace, Conversation, User } from '../types';
import {
  MessageSquare,
  Plus,
  Trash2,
  Building,
  User as UserIcon,
  LogOut,
  ChevronDown,
} from 'lucide-react';

interface SidebarProps {
  user: User;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  onSelectWorkspace: (ws: Workspace) => void;
  onCreateWorkspace: (name: string) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onLogout: () => void;
  streamingConversationIds?: string[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onLogout,
  streamingConversationIds = [],
}) => {
  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showNewWsInput, setShowNewWsInput] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  const handleCreateWs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    onCreateWorkspace(newWsName.trim());
    setNewWsName('');
    setShowNewWsInput(false);
    setShowWsMenu(false);
  };

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-full shrink-0 select-none">
      {/* Workspace Switcher */}
      <div className="p-3 border-b border-slate-800 relative">
        <button
          onClick={() => setShowWsMenu(!showWsMenu)}
          className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              {currentWorkspace?.type === 'enterprise' ? (
                <Building className="w-4 h-4 text-indigo-400" />
              ) : (
                <UserIcon className="w-4 h-4 text-indigo-400" />
              )}
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-white truncate">
                {currentWorkspace?.name || '选择工作空间'}
              </div>
              <div className="text-[10px] text-slate-400 capitalize">
                {currentWorkspace?.type === 'enterprise' ? '企业空间' : '个人空间'}
              </div>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
        </button>

        {/* Workspace Dropdown */}
        {showWsMenu && (
          <div className="absolute top-16 left-3 right-3 z-30 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 space-y-1">
            <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
              切换工作空间
            </div>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  onSelectWorkspace(ws);
                  setShowWsMenu(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  currentWorkspace?.id === ws.id
                    ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {ws.type === 'enterprise' ? (
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{ws.name}</span>
                </div>
                {ws.role && (
                  <span className="text-[10px] text-slate-500 uppercase">{ws.role}</span>
                )}
              </button>
            ))}

            <div className="border-t border-slate-800 pt-1 mt-1">
              {!showNewWsInput ? (
                <button
                  onClick={() => setShowNewWsInput(true)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  创建企业空间
                </button>
              ) : (
                <form onSubmit={handleCreateWs} className="p-1 space-y-1.5">
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="输入企业空间名称"
                    autoFocus
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-1">
                    <button
                      type="submit"
                      className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium"
                    >
                      确定
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewWsInput(false)}
                      className="px-2 py-1 bg-slate-800 text-slate-400 hover:text-white rounded text-[11px]"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold shadow-md shadow-indigo-500/15 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          新建会话
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          历史会话 ({conversations.length})
        </div>
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-500">
            暂无历史对话，点击上方按钮开始
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isGenerating = streamingConversationIds.includes(conv.id);
            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white font-medium border border-slate-700/80 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate" title={isGenerating ? '智能体正在生成中...' : conv.title}>
                  {isGenerating ? (
                    <span className="flex h-3.5 w-3.5 relative items-center justify-center shrink-0">
                      <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                    </span>
                  ) : (
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-indigo-400' : 'text-slate-500'
                      }`}
                    />
                  )}
                  <span className="truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-rose-400 transition-opacity"
                  title="删除会话"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Current User & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white font-semibold text-xs shrink-0 shadow">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="truncate">
              <div className="text-xs font-medium text-white truncate">{user.username}</div>
              <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
