import React, { useState } from 'react';
import { api } from '../api/client';
import type { Skill } from '../types';
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Zap,
  Check,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Terminal,
  Wrench,
} from 'lucide-react';

interface SkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  skills: Skill[];
  onRefresh: () => void;
}

const CATEGORY_OPTIONS = ['内容创作', '研发提效', '业务分析', '办公辅助', '自定义'];

const AVAILABLE_TOOLS = [
  { key: 'web_search', label: '实时联网搜索 (Web Search)', desc: 'DuckDuckGo 实时公开检索' },
  { key: 'code_interpreter', label: 'Python 代码沙箱', desc: '受控隔离数学与脚本执行' },
  { key: 'search_knowledge_base', label: '企业知识库检索 (RAG)', desc: 'Qdrant 向量与关键词混合检索' },
];

export const SkillModal: React.FC<SkillModalProps> = ({
  isOpen,
  onClose,
  skills,
  onRefresh,
}) => {
  const [formMode, setFormMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('研发提效');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [boundTools, setBoundTools] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTip, setSuccessTip] = useState<string | null>(null);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setSuccessTip(msg);
    setTimeout(() => setSuccessTip(null), 3000);
  };

  const resetForm = () => {
    setName('');
    setCode('');
    setCategory('研发提效');
    setDescription('');
    setSystemPrompt('');
    setBoundTools([]);
    setError(null);
    setFormMode('none');
    setEditingSkill(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setFormMode('add');
  };

  const handleOpenEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setName(skill.name);
    setCode(skill.code);
    setCategory(skill.category || '研发提效');
    setDescription(skill.description || '');
    setSystemPrompt(skill.system_prompt || '');
    setBoundTools(skill.bound_tools || []);
    setError(null);
    setFormMode('edit');
  };

  const handleToggleTool = (toolKey: string) => {
    setBoundTools((prev) =>
      prev.includes(toolKey) ? prev.filter((t) => t !== toolKey) : [...prev, toolKey]
    );
  };

  const handleToggleEnable = async (skill: Skill) => {
    try {
      await api.updateSkill(skill.id, { is_enabled: !skill.is_enabled });
      onRefresh();
      showNotification(`技能 [${skill.name}] 已${!skill.is_enabled ? '启用' : '停用'}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '切换状态失败');
    }
  };

  const handleDelete = async (skillId: string, skillName: string) => {
    if (!confirm(`确定要删除技能【${skillName}】吗？此操作不可逆。`)) return;
    try {
      await api.deleteSkill(skillId);
      onRefresh();
      showNotification(`技能【${skillName}】已删除`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !systemPrompt.trim()) {
      setError('请完整填写技能名称、指令代号与专家 SOP 提示词');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (formMode === 'add') {
        await api.createSkill({
          name: name.trim(),
          code: code.trim().toLowerCase(),
          category,
          description: description.trim(),
          system_prompt: systemPrompt.trim(),
          bound_tools: boundTools,
        });
        showNotification('技能创建成功！输入 /' + code.trim().toLowerCase() + ' 即可直接触发');
      } else if (formMode === 'edit' && editingSkill) {
        await api.updateSkill(editingSkill.id, {
          name: name.trim(),
          category,
          description: description.trim(),
          system_prompt: systemPrompt.trim(),
          bound_tools: boundTools,
        });
        showNotification('技能更新成功！');
      }

      resetForm();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                专业技能库 (Skills Ecosystem)
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Slash 快捷指令
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                为智能体注入垂直领域专家 SOP、系统提示词与专属工具权限，聊天框输入 / 即可激活
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

        {/* Notification Tip */}
        {successTip && (
          <div className="mx-6 mt-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{successTip}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {formMode === 'none' ? (
            <>
              {/* Header Actions */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  当前空间已装载 <span className="text-white font-semibold">{skills.length}</span> 项技能
                </div>
                <button
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  新建自定义技能
                </button>
              </div>

              {/* Skills Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      skill.is_enabled
                        ? 'bg-slate-850/70 border-slate-750 hover:border-slate-650'
                        : 'bg-slate-900/40 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">{skill.name}</span>
                        {skill.is_preset ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            预置
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            自定义
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {skill.category}
                        </span>
                      </div>

                      {/* Enable Switch */}
                      <button
                        onClick={() => handleToggleEnable(skill)}
                        className={`text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                          skill.is_enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-400'
                        }`}
                        title={skill.is_enabled ? '点击禁用' : '点击启用'}
                      >
                        {skill.is_enabled ? (
                          <ToggleRight className="w-6 h-6" />
                        ) : (
                          <ToggleLeft className="w-6 h-6" />
                        )}
                      </button>
                    </div>

                    {/* Slash Trigger Command */}
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 flex items-center gap-1 font-medium">
                        <Terminal className="w-3 h-3 text-indigo-400" />
                        /{skill.code}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                      {skill.description || '暂无描述'}
                    </p>

                    {/* Bound Tools & Bottom Actions */}
                    <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Wrench className="w-3 h-3 text-slate-500" />
                        <span>
                          {skill.bound_tools && skill.bound_tools.length > 0
                            ? `工具: ${skill.bound_tools.join(', ')}`
                            : '无专属工具'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(skill)}
                          className="text-slate-400 hover:text-indigo-300 transition-colors"
                        >
                          编辑
                        </button>
                        {!skill.is_preset && (
                          <button
                            onClick={() => handleDelete(skill.id, skill.name)}
                            className="text-slate-400 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Add / Edit Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  {formMode === 'add' ? '新建专家技能' : `编辑技能: ${editingSkill?.name}`}
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    技能名称 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如：技术博客写作专家"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    指令代号 (Slash Command) <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 focus-within:border-indigo-500">
                    <span className="text-indigo-400 font-mono text-xs mr-1">/</span>
                    <input
                      type="text"
                      disabled={formMode === 'edit'}
                      value={code}
                      onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="如：tech_blogger"
                      className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none disabled:opacity-50 font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    只能使用小写英文字母、数字和下划线，用于聊天框快捷呼出
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">技能分类</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">简要描述</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="一句话说明该技能的擅长场景与用途"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  专家 SOP 系统提示词 (System Prompt) <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={6}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="详细定义该角色的专业定位、步骤规范、思考流程、质量准则及格式输出要求..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  关联调用工具 (多选)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {AVAILABLE_TOOLS.map((tool) => {
                    const isChecked = boundTools.includes(tool.key);
                    return (
                      <div
                        key={tool.key}
                        onClick={() => handleToggleTool(tool.key)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-indigo-600/15 border-indigo-500/60 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold mb-1">
                          <span>{tool.label}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                        </div>
                        <div className="text-[10px] text-slate-500">{tool.desc}</div>
                      </div>
                    );
                  })}
                </div>
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
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 shadow-md shadow-indigo-600/20"
                >
                  {loading ? '正在保存...' : '确认保存'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
