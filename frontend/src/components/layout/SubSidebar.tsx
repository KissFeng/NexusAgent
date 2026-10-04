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
} from 'lucide-react';
import type { Conversation, KnowledgeBase, Workspace } from '../../types';
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
  streamingConversationIds?: string[];

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
  streamingConversationIds = [],
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

  // 1. 对话子侧边栏
  if (activeMainTab === 'chat') {
    const filteredConversations = conversations.filter((c) =>
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
              {conversations.length}
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

              return (
                <div
                  key={c.id}
                  onClick={() => onSelectConversation(c.id)}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-white font-medium shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
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
                    <span className="truncate">{c.title || '新对话'}</span>
                  </div>

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
                </div>
              );
            })
          )}
        </div>
      </aside>
    );
  }

  // 2. 广场子侧边栏
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
