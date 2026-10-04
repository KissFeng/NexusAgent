import React, { useState } from 'react';
import { api } from '../../api/client';
import type { Memory } from '../../types';
import {
  Brain,
  Plus,
  Trash2,
  UserCheck,
  Database,
  History,
} from 'lucide-react';

interface MemoryViewProps {
  memories: Memory[];
  onRefresh: () => void;
}

const CATEGORY_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  preference: {
    label: '偏好习惯',
    color: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    icon: <UserCheck className="w-3.5 h-3.5 text-purple-400" />,
  },
  fact: {
    label: '客观事实',
    color: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    icon: <Database className="w-3.5 h-3.5 text-blue-400" />,
  },
  episodic: {
    label: '决策经历',
    color: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    icon: <History className="w-3.5 h-3.5 text-amber-400" />,
  },
};

export const MemoryView: React.FC<MemoryViewProps> = ({ memories, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'preference' | 'fact' | 'episodic'>('all');
  const [formMode, setFormMode] = useState<'none' | 'add'>('none');

  // Form states
  const [category, setCategory] = useState<'preference' | 'fact' | 'episodic'>('preference');
  const [content, setContent] = useState('');
  const [confidence, setConfidence] = useState(0.95);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setCategory('preference');
    setContent('');
    setConfidence(0.95);
    setFormMode('none');
  };

  const handleDelete = async (memoryId: string) => {
    if (!confirm('确定要遗忘删除此条记忆吗？')) return;
    try {
      await api.deleteMemory(memoryId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      if (formMode === 'add') {
        await api.createMemory({
          category,
          content: content.trim(),
          confidence,
        });
      }
      resetForm();
      onRefresh();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredMemories = memories.filter((m) => {
    if (activeTab === 'all') return true;
    return m.category === activeTab;
  });

  return (
    <div className="flex-1 h-full bg-slate-950 flex flex-col overflow-hidden text-slate-100">
      {/* 顶部 Header */}
      <header className="px-8 py-5 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <span>用户画像与长期记忆 (Long-Term Memory)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            由对话自动萃取沉淀的长期偏好、事实与约束，在新会话中自动消歧召回注入 Agent 提示词
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setFormMode('add');
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>手动新增记忆</span>
        </button>
      </header>

      {/* 新增表单 */}
      {formMode === 'add' && (
        <form onSubmit={handleSubmit} className="mx-8 mt-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">新增记忆点</h3>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-400 hover:text-white"
            >
              取消
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">记忆类别</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
              >
                <option value="preference">偏好习惯 (如：回答代码时默认使用 TypeScript)</option>
                <option value="fact">客观事实 (如：公司后端架构使用 FastAPI + PostgreSQL)</option>
                <option value="episodic">决策经历 (如：用户曾强调对并发数据一致性有极高要求)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">置信度 (0.0 ~ 1.0)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">记忆内容</label>
              <textarea
                rows={3}
                required
                placeholder="清楚、凝练地记录该项偏好或事实..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md cursor-pointer disabled:opacity-50"
            >
              {loading ? '保存中...' : '确认沉淀'}
            </button>
          </div>
        </form>
      )}

      {/* 记忆列表 */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {(['all', 'preference', 'fact', 'episodic'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === tab
                    ? 'bg-slate-800 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'all' ? '全部' : CATEGORY_MAP[tab]?.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 font-mono">
            共 {filteredMemories.length} 条已沉淀记忆
          </span>
        </div>

        {filteredMemories.length === 0 ? (
          <div className="h-60 flex flex-col items-center justify-center text-slate-500 text-xs">
            <Brain className="w-8 h-8 mb-2 opacity-30" />
            <span>暂无匹配的长期记忆点</span>
          </div>
        ) : (
          filteredMemories.map((m) => {
            const meta = CATEGORY_MAP[m.category] || CATEGORY_MAP.preference;
            return (
              <div
                key={m.id}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-start justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${meta.color}`}>
                      {meta.icon}
                      <span>{meta.label}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      置信度: {(m.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      召回次数: {m.recall_count}
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed">
                    {m.content}
                  </p>
                </div>

                <button
                  onClick={() => handleDelete(m.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 cursor-pointer"
                  title="遗忘删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
