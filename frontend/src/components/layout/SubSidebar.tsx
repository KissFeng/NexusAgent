import React, { useState } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Trash2,
  Compass,
  Cpu,
  Zap,
  BookOpen,
  Radio,
  CalendarClock,
  Shield,
  Layers,
  Filter,
  Bot,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { Conversation, KnowledgeBase, Skill, Workspace } from '../../types';
import type { MainNavTab } from './LeftRail';

export type SettingsSubTab = 'model' | 'mcp' | 'skill' | 'channels' | 'tasks' | 'knowledge' | 'governance';
export type PlazaCategory = 'all' | 'mcp' | 'skill';

interface SubSidebarProps {
  activeMainTab: MainNavTab;
  currentWorkspace: Workspace | null;

  // Chat 相关
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  streamingConversationIds?: string[];

  // Agents 相关
  skills?: Skill[];
  selectedAgentId?: string | null;
  onSelectAgent?: (skill: Skill) => void;
  onCreateAgent?: () => void;
  onEditAgent?: (skill: Skill) => void;
  onNewAgentConversation?: (agent: Skill) => void;
  onSelectAgentConversation?: (agent: Skill, convId: string) => void;

  // Plaza 相关
  plazaCategory: PlazaCategory;
  onSelectPlazaCategory: (cat: PlazaCategory) => void;
  plazaTagFilter: string | null;
  onSelectPlazaTagFilter: (tag: string | null) => void;

  // Knowledge 相关
  knowledgeBases: KnowledgeBase[];
  selectedKbId: string | null;
  onSelectKb: (id: string) => void;
  onCreateKb: () => void;

  // Settings 相关
  activeSettingsTab: SettingsSubTab;
  onSelectSettingsTab: (tab: SettingsSubTab) => void;
}

export const SubSidebar: React.FC<SubSidebarProps> = ({
  activeMainTab,
  currentWorkspace,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  streamingConversationIds = [],
  skills = [],
  selectedAgentId,
  onSelectAgent,
  onCreateAgent,
  onEditAgent,
  onNewAgentConversation,
  onSelectAgentConversation,
  plazaCategory,
  onSelectPlazaCategory,
  plazaTagFilter,
  onSelectPlazaTagFilter,
  knowledgeBases,
  selectedKbId,
  onSelectKb,
  onCreateKb,
  activeSettingsTab,
  onSelectSettingsTab,
}) => {
  const [chatSearch, setChatSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [selectedAgentCategory, setSelectedAgentCategory] = useState<string>('全部');
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const handleSaveRename = (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed && onRenameConversation) {
      onRenameConversation(id, trimmed);
    }
    setEditingConversationId(null);
  };

  // 1. 对话子侧边栏
  if (activeMainTab === 'chat') {
    // 过滤未发消息的空草稿对话（用户说第一句话前不展示）且仅展示通用对话（无 skill_code）
    const visibleConversations = conversations.filter(
      (c) => !c.id.startsWith('draft-new') && !c.skill_code
    );
    const filteredConversations = visibleConversations.filter((c) =>
      c.title.toLowerCase().includes(chatSearch.toLowerCase())
    );

    return (
      <aside className="w-[250px] h-full bg-slate-900/60 border-r border-slate-800/80 flex flex-col shrink-0 select-none">
        {/* 顶部操作条 */}
        <div className="p-3 border-b border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 tracking-wide truncate max-w-[170px]" title={currentWorkspace?.name}>
              {currentWorkspace?.name || '会话列表'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              {visibleConversations.length}
            </span>
          </div>

          <button
            onClick={onNewConversation}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建对话</span>
          </button>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索历史会话..."
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-slate-500 text-xs">
              <MessageSquare className="w-6 h-6 mb-2 opacity-30" />
              <span>暂无匹配的会话</span>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isActive = c.id === activeConversationId;
              const isStreaming = streamingConversationIds.includes(c.id);
              const isEditing = editingConversationId === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (!isEditing) {
                      onSelectConversation(c.id);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingConversationId(c.id);
                    setEditingTitle(c.title || '新对话');
                  }}
                  title={isEditing ? undefined : '双击可重命名'}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-white font-medium shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                    {isStreaming ? (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                      </span>
                    ) : (
                      <MessageSquare
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'
                        }`}
                      />
                    )}
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveRename(c.id);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingConversationId(null);
                          }
                        }}
                        onBlur={() => handleSaveRename(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        className="w-full bg-slate-950 border border-indigo-500/80 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none ring-1 ring-indigo-500/50"
                      />
                    ) : (
                      <span className="truncate">{c.title || '新对话'}</span>
                    )}
                  </div>

                  {!isEditing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-slate-500 rounded transition-opacity cursor-pointer shrink-0 ml-1"
                      title="删除会话"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    );
  }

  // 2. 智能体子侧边栏 (专属于业务角色与专业助手，带有专属会话生命周期管理)
  if (activeMainTab === 'agents') {
    const categories = ['全部', '研发提效', '内容创作', '业务分析', '办公辅助', '自定义'];
    const filteredSkills = (skills || []).filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
        s.description.toLowerCase().includes(agentSearch.toLowerCase()) ||
        s.code.toLowerCase().includes(agentSearch.toLowerCase()) ||
        conversations.some(
          (c) => c.skill_code === s.code && c.title.toLowerCase().includes(agentSearch.toLowerCase())
        );
      const matchCategory =
        selectedAgentCategory === '全部' || s.category === selectedAgentCategory;
      return matchSearch && matchCategory;
    });

    return (
      <aside className="w-[270px] h-full bg-slate-900/60 border-r border-slate-800/80 flex flex-col shrink-0 select-none">
        {/* 顶部操作条 */}
        <div className="p-3 border-b border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-slate-200 tracking-wide">
                业务智能体
              </span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              {skills?.length || 0}
            </span>
          </div>

          <button
            onClick={onCreateAgent}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>创建智能体</span>
          </button>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索智能体或对话记录..."
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* 分类快捷标签 */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => {
              const isSelected = selectedAgentCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedAgentCategory(cat)}
                  className={`text-[10px] px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40'
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 智能体卡片与专属会话列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredSkills.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-slate-500 text-xs">
              <Bot className="w-6 h-6 mb-2 opacity-30" />
              <span>暂无匹配的智能体</span>
            </div>
          ) : (
            filteredSkills.map((agent) => {
              const isSelected = agent.id === selectedAgentId || agent.code === selectedAgentId;
              const agentConvs = conversations.filter((c) => c.skill_code === agent.code);
              const hasKnowledge = agent.bound_tools?.includes('search_knowledge_base');
              const hasWebSearch = agent.bound_tools?.includes('web_search');
              const hasCode = agent.bound_tools?.includes('code_interpreter');

              return (
                <div
                  key={agent.id}
                  className={`rounded-xl transition-all border overflow-hidden ${
                    isSelected
                      ? 'bg-slate-900/90 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/20'
                      : 'bg-slate-900/40 hover:bg-slate-900/70 border-slate-800/60'
                  }`}
                >
                  {/* 智能体头部卡片 */}
                  <div
                    onClick={() => onSelectAgent?.(agent)}
                    className="p-2.5 cursor-pointer flex flex-col gap-1.5"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-800 text-indigo-400'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{agent.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            /{agent.code}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* 该智能体专属新建对话按钮 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onNewAgentConversation) {
                              onNewAgentConversation(agent);
                            } else {
                              onSelectAgent?.(agent);
                            }
                          }}
                          className="p-1 rounded hover:bg-indigo-600/30 text-indigo-300 hover:text-white transition-all cursor-pointer"
                          title={`新建 ${agent.name} 对话`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        {/* 配置按钮 */}
                        {onEditAgent && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditAgent(agent);
                            }}
                            className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                            title="配置此智能体"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* 数量徽标 */}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono ml-0.5">
                          {agentConvs.length}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-1 leading-snug">
                      {agent.description}
                    </p>

                    {/* 标签徽标 */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-medium">
                        {agent.category}
                      </span>
                      {hasKnowledge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950/40 text-indigo-300 border border-indigo-500/20">
                          📚 知识库
                        </span>
                      )}
                      {hasWebSearch && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-950/40 text-sky-300 border border-sky-500/20">
                          🌐 联网
                        </span>
                      )}
                      {hasCode && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/20">
                          🐍 沙箱
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 展开的专属会话抽屉（对齐 Cherry Studio Agent Sessions） */}
                  {isSelected && (
                    <div className="border-t border-slate-800/80 bg-slate-950/50 p-2 space-y-1">
                      <div className="flex items-center justify-between px-1 py-1 text-[11px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1 text-indigo-300">
                          <MessageSquare className="w-3 h-3" />
                          <span>历史任务会话 ({agentConvs.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNewAgentConversation) {
                              onNewAgentConversation(agent);
                            }
                          }}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 hover:underline cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>新建</span>
                        </button>
                      </div>

                      {agentConvs.length === 0 ? (
                        <div
                          onClick={() => onNewAgentConversation?.(agent)}
                          className="p-3 text-center rounded-lg border border-dashed border-slate-800/80 hover:border-indigo-500/40 hover:bg-indigo-950/10 transition-colors cursor-pointer text-slate-500 hover:text-indigo-300 text-[11px]"
                        >
                          <p>暂无历史对话</p>
                          <p className="text-[10px] text-slate-600 mt-0.5">点击在此开启专属任务</p>
                        </div>
                      ) : (
                        <div className="space-y-0.5 max-h-48 overflow-y-auto no-scrollbar">
                          {agentConvs.map((c) => {
                            const isConvActive = c.id === activeConversationId;
                            const isStreaming = streamingConversationIds.includes(c.id);
                            const isEditing = editingConversationId === c.id;

                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  if (!isEditing) {
                                    if (onSelectAgentConversation) {
                                      onSelectAgentConversation(agent, c.id);
                                    } else {
                                      onSelectConversation(c.id);
                                    }
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingConversationId(c.id);
                                  setEditingTitle(c.title || '新对话');
                                }}
                                title={isEditing ? undefined : '双击可重命名'}
                                className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                                  isConvActive
                                    ? 'bg-indigo-600/25 border border-indigo-500/40 text-white font-medium shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                                  {isStreaming ? (
                                    <span className="relative flex h-2 w-2 shrink-0">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                                    </span>
                                  ) : (
                                    <MessageSquare
                                      className={`w-3 h-3 shrink-0 ${
                                        isConvActive
                                          ? 'text-indigo-400'
                                          : 'text-slate-500 group-hover:text-slate-400'
                                      }`}
                                    />
                                  )}

                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleSaveRename(c.id);
                                        } else if (e.key === 'Escape') {
                                          e.preventDefault();
                                          setEditingConversationId(null);
                                        }
                                      }}
                                      onBlur={() => handleSaveRename(c.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      onDoubleClick={(e) => e.stopPropagation()}
                                      autoFocus
                                      onFocus={(e) => e.target.select()}
                                      className="w-full bg-slate-950 border border-indigo-500/80 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none ring-1 ring-indigo-500/50"
                                    />
                                  ) : (
                                    <span className="truncate text-[11px]">{c.title || '新任务'}</span>
                                  )}
                                </div>

                                {!isEditing && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`确定要删除对话【${c.title}】吗？`)) {
                                        onDeleteConversation(c.id);
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all shrink-0 cursor-pointer"
                                    title="删除此对话"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    );
  }

  // 3. 广场子侧边栏
  if (activeMainTab === 'plaza') {
    const categories: Array<{ id: PlazaCategory; label: string; icon: any; countNote?: string }> = [
      { id: 'all', label: '全部广场资源', icon: Compass },
      { id: 'mcp', label: 'MCP 广场 (工具生态)', icon: Layers, countNote: 'Tools' },
      { id: 'skill', label: 'Skill 广场 (智能体技能)', icon: Zap, countNote: 'Prompts' },
    ];

    const tags = ['全部标签', '联网搜索', '研发提效', '内容创作', '商业分析', '系统工具', '合规法务'];

    return (
      <aside className="w-[250px] h-full bg-slate-900/60 border-r border-slate-800/80 flex flex-col shrink-0 select-none">
        <div className="p-3 border-b border-slate-800/80">
          <div className="text-xs font-bold text-slate-200 tracking-wide mb-1">
            生态广场
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            发现并一键安装官方与社区开源的 MCP 服务及专业技能。
          </p>
        </div>

        <div className="p-2 space-y-1">
          <div className="text-[10px] font-semibold text-slate-500 px-2 py-1 uppercase tracking-wider">
            资源类型
          </div>
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = plazaCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectPlazaCategory(cat.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span>{cat.label}</span>
                </div>
                {cat.countNote && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {cat.countNote}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-2 border-t border-slate-800/80 space-y-1 flex-1 overflow-y-auto">
          <div className="text-[10px] font-semibold text-slate-500 px-2 py-1 uppercase tracking-wider flex items-center gap-1">
            <Filter className="w-3 h-3" />
            <span>分类过滤</span>
          </div>
          {tags.map((tag) => {
            const isAll = tag === '全部标签';
            const isActive = isAll ? !plazaTagFilter : plazaTagFilter === tag;
            return (
              <button
                key={tag}
                onClick={() => onSelectPlazaTagFilter(isAll ? null : tag)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-indigo-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                }`}
              >
                <span>{tag}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  // 3. 知识库子侧边栏
  if (activeMainTab === 'knowledge') {
    return (
      <aside className="w-[250px] h-full bg-slate-900/60 border-r border-slate-800/80 flex flex-col shrink-0 select-none">
        <div className="p-3 border-b border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 tracking-wide">
              知识库空间
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              {knowledgeBases.length}
            </span>
          </div>
          <button
            onClick={onCreateKb}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>创建知识库</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {knowledgeBases.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-slate-500 text-xs">
              <BookOpen className="w-6 h-6 mb-2 opacity-30" />
              <span>暂无知识库</span>
            </div>
          ) : (
            knowledgeBases.map((kb) => {
              const isActive = kb.id === selectedKbId;
              return (
                <div
                  key={kb.id}
                  onClick={() => onSelectKb(kb.id)}
                  className={`flex flex-col p-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate font-semibold text-slate-200">{kb.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {kb.document_count} 篇
                    </span>
                  </div>
                  {kb.description && (
                    <div className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                      {kb.description}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    );
  }

  // 4. 记忆子侧边栏
  if (activeMainTab === 'memory') {
    return (
      <aside className="w-[250px] h-full bg-slate-900/60 border-r border-slate-800/80 flex flex-col shrink-0 select-none">
        <div className="p-3 border-b border-slate-800/80">
          <div className="text-xs font-bold text-slate-200 tracking-wide mb-1">
            用户长期画像
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            每轮对话后自动提炼的偏好、事实事实记忆与约束习惯。
          </p>
        </div>

        <div className="p-2 space-y-1">
          <div className="text-[10px] font-semibold text-slate-500 px-2 py-1 uppercase tracking-wider">
            记忆分类
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-indigo-300">
            已开启自动沉淀与混合向量消歧召回
          </div>
        </div>
      </aside>
    );
  }

  // 5. 设置中心子侧边栏 (Cherry Studio 经典菜单风格)
  if (activeMainTab === 'settings') {
    const settingsItems: Array<{
      id: SettingsSubTab;
      label: string;
      desc: string;
      icon: any;
      group?: string;
    }> = [
      { id: 'model', label: '模型服务 (Model)', desc: '供应商、密钥与连通探测', icon: Cpu, group: '核心基础' },
      { id: 'mcp', label: 'MCP 服务 (MCP)', desc: '协议网关与工具列表', icon: Layers, group: '能力扩展' },
      { id: 'skill', label: '专业技能 (Skills)', desc: '系统提示词与Slash指令', icon: Zap, group: '能力扩展' },
      { id: 'channels', label: '外部频道 (Channels)', desc: '飞书、微信、QQ、钉钉', icon: Radio, group: '协同互通' },
      { id: 'tasks', label: '定时任务 (Tasks)', desc: 'Cron 调度与主动播报', icon: CalendarClock, group: '协同互通' },
      { id: 'knowledge', label: '知识库设置 (Knowledge)', desc: '检索参数与分块优化', icon: BookOpen, group: '知识底座' },
      { id: 'governance', label: '用量与审计 (Audit)', desc: 'Token 配额与操作审计', icon: Shield, group: '治理运维' },
    ];

    let lastGroup = '';

    return (
      <aside className="w-[250px] h-full bg-slate-900/60 border-r border-slate-800/80 flex flex-col shrink-0 select-none">
        <div className="p-3 border-b border-slate-800/80">
          <span className="text-xs font-bold text-slate-200 tracking-wide">
            系统设置
          </span>
          <div className="text-[11px] text-slate-500 mt-0.5">
            配置模型、MCP、技能与自动化通道
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {settingsItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSettingsTab === item.id;
            const isNewGroup = item.group && item.group !== lastGroup;
            if (item.group) lastGroup = item.group;

            return (
              <React.Fragment key={item.id}>
                {isNewGroup && (
                  <div className="text-[10px] font-semibold text-slate-500 px-2 pt-2.5 pb-1 uppercase tracking-wider">
                    {item.group}
                  </div>
                )}
                <button
                  onClick={() => onSelectSettingsTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-300 font-medium border border-indigo-500/30 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-850 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <div className="min-w-0 flex-1 truncate">
                    <div className="truncate font-medium">{item.label}</div>
                    <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </aside>
    );
  }

  return null;
};
