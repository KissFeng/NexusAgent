import React, { useState } from 'react';
import { api } from '../api/client';
import type { ModelConfig } from '../types';
import { X, Plus, Trash2, Cpu, Check, ShieldCheck, AlertCircle, Pencil, Star } from 'lucide-react';

interface ModelConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelConfig[];
  onRefresh: () => void;
}

const PROVIDER_PRESETS: Record<string, { defaultBaseUrl: string; defaultModel: string }> = {
  deepseek: { defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  openai: { defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  qwen: { defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
  ollama: { defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3:8b' },
  custom: { defaultBaseUrl: '', defaultModel: '' },
};

export const ModelConfigModal: React.FC<ModelConfigModalProps> = ({
  isOpen,
  onClose,
  models,
  onRefresh,
}) => {
  const [formMode, setFormMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [provider, setProvider] = useState<'deepseek' | 'openai' | 'qwen' | 'ollama' | 'custom'>('deepseek');
  const [name, setName] = useState('DeepSeek-V3');
  const [modelName, setModelName] = useState('deepseek-chat');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTip, setSuccessTip] = useState<string | null>(null);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setSuccessTip(msg);
    setTimeout(() => setSuccessTip(null), 3000);
  };

  const handleProviderChange = (newProvider: 'deepseek' | 'openai' | 'qwen' | 'ollama' | 'custom') => {
    setProvider(newProvider);
    const preset = PROVIDER_PRESETS[newProvider];
    if (preset) {
      setBaseUrl(preset.defaultBaseUrl);
      setModelName(preset.defaultModel);
      if (formMode === 'add') {
        setName(`${newProvider.toUpperCase()}-${preset.defaultModel}`);
      }
    }
  };

  const handleStartAdd = () => {
    setEditingId(null);
    setFormMode('add');
    setError(null);
    setProvider('deepseek');
    setName('DeepSeek-V3');
    setModelName('deepseek-chat');
    setBaseUrl('https://api.deepseek.com/v1');
    setApiKey('');
    setIsDefault(models.length === 0);
  };

  const handleStartEdit = (m: ModelConfig) => {
    setEditingId(m.id);
    setFormMode('edit');
    setError(null);
    setProvider((m.provider as any) || 'custom');
    setName(m.name);
    setModelName(m.model_name);
    setBaseUrl(m.base_url || '');
    setApiKey(''); // 留空表示不修改已有 key
    setIsDefault(m.is_default);
  };

  const handleCancelForm = () => {
    setFormMode('none');
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (formMode === 'add') {
        await api.createModel({
          name,
          provider,
          model_name: modelName,
          base_url: baseUrl,
          api_key: apiKey,
          is_default: isDefault,
        });
        showNotification('新模型配置已成功添加');
      } else if (formMode === 'edit' && editingId) {
        const updatePayload: Record<string, any> = {
          name,
          provider,
          model_name: modelName,
          base_url: baseUrl,
          is_default: isDefault,
        };
        if (apiKey.trim()) {
          updatePayload.api_key = apiKey.trim();
        }
        await api.updateModel(editingId, updatePayload);
        showNotification('模型配置已成功更新');
      }

      handleCancelForm();
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, modelDisplayName: string) => {
    if (!confirm(`确定删除模型配置【${modelDisplayName}】吗？`)) return;
    try {
      await api.deleteModel(id);
      showNotification('模型已删除');
      if (editingId === id) {
        handleCancelForm();
      }
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSetDefault = async (m: ModelConfig) => {
    try {
      await api.setDefaultModel(m.id);
      showNotification(`已将【${m.name}】设为空间默认模型`);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '设置默认失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-semibold text-white">模型供应商配置</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successTip && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successTip}</span>
            </div>
          )}

          {/* Model List Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">
                已配置模型 ({models.length})
              </span>
              {formMode === 'none' && (
                <button
                  onClick={handleStartAdd}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增模型
                </button>
              )}
            </div>

            {/* Model Items */}
            <div className="grid gap-3">
              {models.map((m) => {
                const isItemEditing = formMode === 'edit' && editingId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isItemEditing
                        ? 'bg-indigo-950/20 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/30'
                        : m.is_default
                        ? 'bg-slate-850/80 border-slate-700/80 hover:border-indigo-500/40'
                        : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                    } flex items-center justify-between gap-3`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm truncate">{m.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/80 text-slate-300 font-mono">
                          {m.provider}
                        </span>
                        {m.is_default ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                            <Star className="w-3 h-3 fill-indigo-400 text-indigo-400" />
                            默认模型
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-3 flex-wrap">
                        <span>
                          模型名: <code className="text-slate-300 font-mono">{m.model_name}</code>
                        </span>
                        <span className="flex items-center gap-1">
                          {m.has_api_key ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> Key 已就绪
                            </span>
                          ) : (
                            <span className="text-amber-400">未设置 Key</span>
                          )}
                        </span>
                        {m.base_url && (
                          <span className="text-slate-500 truncate max-w-[220px]" title={m.base_url}>
                            URL: {m.base_url}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Set Default Button */}
                      {!m.is_default ? (
                        <button
                          onClick={() => handleSetDefault(m)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 rounded-lg transition-all cursor-pointer shadow-sm"
                          title="设为工作区默认模型"
                        >
                          <Check className="w-3.5 h-3.5 text-indigo-400" />
                          <span>设为默认</span>
                        </button>
                      ) : (
                        <span className="text-xs text-indigo-400/80 px-2 py-1 bg-indigo-950/40 rounded-lg border border-indigo-800/40 font-mono">
                          当前默认
                        </span>
                      )}

                      {/* Edit Button */}
                      <button
                        onClick={() => handleStartEdit(m)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                          isItemEditing
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700'
                        }`}
                        title="编辑模型配置"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>编辑</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(m.id, m.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-500/20"
                        title="删除配置"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add or Edit Model Form */}
          {formMode !== 'none' && (
            <form
              onSubmit={handleSubmit}
              className="p-5 rounded-xl bg-slate-800/70 border border-indigo-500/40 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-indigo-300">
                    {formMode === 'add' ? '添加新模型配置' : `编辑配置：${name}`}
                  </span>
                  {formMode === 'edit' && (
                    <span className="text-[11px] text-slate-400">(修改后立即生效)</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700/50 cursor-pointer"
                >
                  取消
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">供应商</label>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="deepseek">DeepSeek</option>
                    <option value="openai">OpenAI</option>
                    <option value="qwen">通义千问 (DashScope)</option>
                    <option value="ollama">Ollama (本地)</option>
                    <option value="custom">自定义兼容接口 (Custom OpenAI)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">显示名称</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：DeepSeek-V3"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    实际模型标识 (Model ID)
                  </label>
                  <input
                    type="text"
                    required
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="例如：deepseek-ai/DeepSeek-V3"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Base URL (API 接入点)
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.siliconflow.cn/v1"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  API Key
                  {formMode === 'edit' && (
                    <span className="text-slate-400 font-normal ml-1.5 text-[11px]">
                      (留空则保持原密钥，输入新密钥将覆盖)
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    formMode === 'edit'
                      ? '•••••••••••••••• (留空保持原密钥)'
                      : provider === 'ollama'
                      ? '本地 Ollama 可留空'
                      : 'sk-xxxxxxxx'
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                  />
                  <span>设为空间默认模型</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="px-3.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {loading ? '保存中...' : formMode === 'add' ? '确认添加' : '保存修改'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
