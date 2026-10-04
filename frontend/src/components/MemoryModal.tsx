import React, { useState } from 'react';
import { api } from '../api/client';
import type { Memory } from '../types';
import {
  X,
  Plus,
  Trash2,
  Brain,
  Check,
  AlertCircle,
  Sparkles,
  UserCheck,
  Database,
  History,
  Pencil,
  Clock,
  RotateCcw,
} from 'lucide-react';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  memories,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'preference' | 'fact' | 'episodic'>('all');
  const [formMode, setFormMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [category, setCategory] = useState<'preference' | 'fact' | 'episodic'>('preference');
  const [content, setContent] = useState('');
  const [confidence, setConfidence] = useState(0.95);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTip, setSuccessTip] = useState<string | null>(null);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setSuccessTip(msg);
    setTimeout(() => setSuccessTip(null), 3000);
  };

  const resetForm = () => {
    setCategory('preference');
    setContent('');
    setConfidence(0.95);
    setError(null);
    setFormMode('none');
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setFormMode('add');
  };

  const handleOpenEdit = (m: Memory) => {
    setEditingId(m.id);
    setCategory(m.category);
    setContent(m.content);
    setConfidence(m.confidence || 0.9);
    setError(null);
    setFormMode('edit');
  };

  const handleDelete = async (memoryId: string) => {
    if (!confirm('确定要遗忘删除此条记忆吗？')) return;
    try {
      await api.deleteMemory(memoryId);
      onRefresh();
      showNotification('记忆已删除');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('请输入具体的记忆内容');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (formMode === 'add') {
        await api.createMemory({
          category,
          content: content.trim(),
          confidence,
        });
        showNotification('成功录入新记忆！');
      } else if (formMode === 'edit' && editingId) {
        await api.updateMemory(editingId, {
          category,
          content: content.trim(),
          confidence,
        });
        showNotification('记忆已更新！');
      }

      resetForm();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredMemories =
    activeTab === 'all' ? memories : memories.filter((m) => m.category === activeTab);

  const totalRecall = memories.reduce((acc, cur) => acc + (cur.recall_count || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                智能体长期记忆库 (Long-Term Memory)
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  语义自动抽取 & 向量召回
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                跨越会话持久沉淀你的开发习惯、系统事实与偏好，使智能体随交互越用越懂你
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tip */}
        {successTip && (
          <div className="mx-6 mt-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{successTip}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {formMode === 'none' ? (
            <>
              {/* Metrics Stats */}
              <div className="grid grid-cols-3 gap-3.5">
                <div className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800">
                  <div className="text-[11px] text-slate-400">沉淀记忆总数</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {memories.length} <span className="text-xs font-normal text-slate-500">条</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800">
                  <div className="text-[11px] text-slate-400">跨对话召回引用</div>
                  <div className="text-lg font-bold text-purple-400 mt-1">
                    {totalRecall} <span className="text-xs font-normal text-slate-500">次</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800">
                  <div className="text-[11px] text-slate-400">记忆去重消歧</div>
                  <div className="text-lg font-bold text-emerald-400 mt-1">已激活 (Mem0 机制)</div>
                </div>
              </div>

              {/* Tabs & Add Button */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      activeTab === 'all'
                        ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    全部 ({memories.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('preference')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      activeTab === 'preference'
                        ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    偏好习惯 ({memories.filter((m) => m.category === 'preference').length})
                  </button>
                  <button
                    onClick={() => setActiveTab('fact')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      activeTab === 'fact'
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    客观事实 ({memories.filter((m) => m.category === 'fact').length})
                  </button>
                  <button
                    onClick={() => setActiveTab('episodic')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      activeTab === 'episodic'
                        ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    决策经历 ({memories.filter((m) => m.category === 'episodic').length})
                  </button>
                </div>

                <button
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  手动录入记忆
                </button>
              </div>

              {/* Memory List */}
              {filteredMemories.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  当前分类下暂无记忆。在日常提问中，智能体会自动提炼您的偏好与关键业务事实！
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMemories.map((m) => {
                    const catMeta = CATEGORY_MAP[m.category] || CATEGORY_MAP.preference;
                    return (
                      <div
                        key={m.id}
                        className="p-4 rounded-2xl bg-slate-850/60 border border-slate-750 hover:border-slate-650 transition-all space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1 font-medium ${catMeta.color}`}
                            >
                              {catMeta.icon}
                              {catMeta.label}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              置信度: {Math.round(m.confidence * 100)}%
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(m)}
                              className="text-slate-400 hover:text-purple-300 transition-colors p-1"
                              title="编辑"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="text-slate-400 hover:text-rose-400 transition-colors p-1"
                              title="遗忘删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-200 leading-relaxed font-normal">
                          {m.content}
                        </p>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-purple-400/90 font-medium">
                              <RotateCcw className="w-3 h-3" />
                              已在后续对话中召回引用 {m.recall_count} 次
                            </span>
                            {m.last_recalled_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                最近召回: {new Date(m.last_recalled_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <span>录入于: {new Date(m.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Add / Edit Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  {formMode === 'add' ? '手动录入记忆项' : '编辑记忆内容'}
                </h3>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  返回列表
                </button>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">记忆分类</label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as 'preference' | 'fact' | 'episodic')
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="preference">偏好习惯 (代码风格/常用技术栈/交互习惯)</option>
                    <option value="fact">客观事实 (系统环境/端口/企业业务/组织信息)</option>
                    <option value="episodic">决策经历 (关键经验/踩坑复盘/排查结论)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    置信度 ({Math.round(confidence * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.05"
                    value={confidence}
                    onChange={(e) => setConfidence(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 mt-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  记忆事实陈述 <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="用陈述句清晰表述，例如：'用户习惯使用 TypeScript + React 19 开发，且严格要求所有公共组件编写类型接口定义'..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50 shadow-md shadow-purple-600/20"
                >
                  {loading ? '保存中...' : '确认保存'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
