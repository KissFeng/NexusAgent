import React from 'react';
import {
  MessageSquare,
  Compass,
  BookOpen,
  Brain,
  Settings,
  Building,
  LogOut,
} from 'lucide-react';
import type { User, Workspace } from '../../types';

export type MainNavTab = 'chat' | 'plaza' | 'knowledge' | 'memory' | 'settings';

interface LeftRailProps {
  user: User;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  activeTab: MainNavTab;
  onSelectTab: (tab: MainNavTab) => void;
  onSelectWorkspace: (ws: Workspace) => void;
  onCreateWorkspace?: (name: string) => void;
  onLogout: () => void;
  streamingCount?: number;
}

export const LeftRail: React.FC<LeftRailProps> = ({
  user,
  currentWorkspace,
  workspaces,
  activeTab,
  onSelectTab,
  onSelectWorkspace,
  onLogout,
  streamingCount = 0,
}) => {
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  const navItems = [
    {
      id: 'chat' as MainNavTab,
      label: '对话',
      icon: MessageSquare,
      badge: streamingCount > 0 ? streamingCount : undefined,
    },
    {
      id: 'plaza' as MainNavTab,
      label: '广场',
      icon: Compass,
      tag: 'HOT',
    },
    {
      id: 'knowledge' as MainNavTab,
      label: '知识库',
      icon: BookOpen,
    },
    {
      id: 'memory' as MainNavTab,
      label: '记忆',
      icon: Brain,
    },
  ];

  return (
    <div className="w-[60px] h-full bg-slate-950 border-r border-slate-800/80 flex flex-col items-center justify-between py-3.5 select-none shrink-0 z-30">
      {/* 顶部 Logo */}
      <div className="flex flex-col items-center gap-4">
        <div
          onClick={() => onSelectTab('chat')}
          className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-[1px] shadow-lg shadow-indigo-500/20 cursor-pointer hover:scale-105 active:scale-95 transition-all group"
          title="Enterprise Agent Platform"
        >
          <div className="w-full h-full bg-slate-950/90 rounded-[11px] flex items-center justify-center">
            <span className="text-base font-black bg-gradient-to-tr from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent group-hover:from-indigo-300 group-hover:to-pink-300">
              ⚡
            </span>
          </div>
        </div>

        {/* 主导航图标列表 */}
        <nav className="flex flex-col items-center gap-2 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`relative w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 shadow-sm shadow-indigo-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title={item.label}
              >
                {isActive && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                )}
                <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-indigo-400' : ''}`} />
                <span className="text-[10px] scale-90 font-medium tracking-tight mt-0.5">
                  {item.label}
                </span>

                {/* 流式生成徽标 */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-[10px] text-white font-mono flex items-center justify-center ring-2 ring-slate-950 animate-pulse">
                    {item.badge}
                  </span>
                )}

                {/* 广场热点标记 */}
                {item.tag && !isActive && (
                  <span className="absolute -top-1 -right-1 px-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-[8px] text-amber-300 font-mono scale-75">
                    {item.tag}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部功能区：设置、用户与工作空间 */}
      <div className="flex flex-col items-center gap-2.5 w-full px-2 relative">
        {/* 设置中心按钮 */}
        <button
          onClick={() => onSelectTab('settings')}
          className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer group relative ${
            activeTab === 'settings'
              ? 'bg-indigo-600/20 text-indigo-400 shadow-sm shadow-indigo-500/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
          title="系统设置 (模型/MCP/技能/频道/定时任务/知识库)"
        >
          {activeTab === 'settings' && (
            <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          )}
          <Settings className={`w-5 h-5 transition-transform group-hover:rotate-45 ${activeTab === 'settings' ? 'text-indigo-400' : ''}`} />
          <span className="text-[10px] scale-90 font-medium tracking-tight mt-0.5">
            设置
          </span>
        </button>

        {/* 分割线 */}
        <div className="w-8 h-[1px] bg-slate-800 my-0.5" />

        {/* 用户/空间头像按钮 */}
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer relative"
          title={`${user.username} (${currentWorkspace?.name || '空间'})`}
        >
          {currentWorkspace?.type === 'enterprise' ? (
            <Building className="w-4 h-4 text-indigo-400" />
          ) : (
            <div className="w-6 h-6 rounded-lg bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-xs font-bold uppercase">
              {user.username.slice(0, 1)}
            </div>
          )}
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
        </button>

        {/* 用户与工作空间弹出菜单 */}
        {showUserMenu && (
          <div className="absolute bottom-2 left-14 z-50 w-64 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-2 text-slate-200 animate-in fade-in zoom-in-95 duration-100">
            <div className="p-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-xs uppercase">
                  {user.username.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate">{user.username}</div>
                  <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                </div>
              </div>
            </div>

            <div className="py-1">
              <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                当前空间
              </div>
              <div className="px-2 py-1.5 rounded-lg bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-between text-xs text-indigo-300">
                <span className="truncate font-medium">{currentWorkspace?.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                  {currentWorkspace?.type === 'enterprise' ? '企业版' : '个人版'}
                </span>
              </div>
            </div>

            {workspaces.length > 1 && (
              <div className="py-1 border-t border-slate-800/80">
                <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                  切换空间
                </div>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      onSelectWorkspace(ws);
                      setShowUserMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      ws.id === currentWorkspace?.id
                        ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                        : 'text-slate-300 hover:bg-slate-800/80'
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
                    <span className="text-[10px] text-slate-500 capitalize">{ws.type}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="pt-1 mt-1 border-t border-slate-800/80">
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>退出登录</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
