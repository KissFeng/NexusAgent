import React, { useState } from 'react';
import { api } from '../api/client';
import type { ModelConfig } from '../types';
import { X, Plus, Trash2, Cpu, Check, ShieldCheck, AlertCircle } from 'lucide-react';

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
  const [isAdding, setIsAdding] = useState(false);
  const [provider, setProvider] = useState<'deepseek' | 'openai' | 'qwen' | 'ollama' | 'custom'>('deepseek');
  const [name, setName] = useState('DeepSeek-V3');
  const [modelName, setModelName] = useState('deepseek-chat');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider: 'deepseek' | 'openai' | 'qwen' | 'ollama' | 'custom') => {
    setProvider(newProvider);
    const preset = PROVIDER_PRESETS[newProvider];
    if (preset) {
      setBaseUrl(preset.defaultBaseUrl);
      setModelName(preset.defaultModel);
      setName(`${newProvider.toUpperCase()}-${preset.defaultModel}`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.createModel({
        name,
        provider,
        model_name: modelName,
        base_url: baseUrl,
        api_key: apiKey,
        is_default: isDefault,
      });
      setIsAdding(false);
      setApiKey('');
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该模型配置吗？')) return;
    try {
      await api.deleteModel(id);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSetDefault = async (m: ModelConfig) => {
    try {
      await api.updateModel(m.id, { is_default: true });
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '设置默认失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-semibold text-white">模型供应商配置</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Model List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">已配置模型 ({models.length})</span>
              {!isAdding && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增模型
                </button>
              )}
            </div>

            <div className="grid gap-3">
              {models.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between hover:border-slate-600 transition-all"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">{m.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
                        {m.provider}
                      </span>
                      {m.is_default && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                      <span>模型名: <code className="text-slate-300">{m.model_name}</code></span>
                      <span className="flex items-center gap-1">
                        {m.has_api_key ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <ShieldCheck className="w-3.5 h-3.5" /> Key 已就绪
                          </span>
                        ) : (
                          <span className="text-amber-400">未设置 Key</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!m.is_default && (
                      <button
                        onClick={() => handleSetDefault(m)}
                        className="p-1.5 text-xs text-slate-400 hover:text-indigo-400 hover:bg-slate-700/50 rounded-lg transition-colors"
                        title="设为默认模型"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 rounded-lg transition-colors"
                      title="删除配置"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Model Form */}
          {isAdding && (
            <form onSubmit={handleCreate} className="p-5 rounded-xl bg-slate-800/40 border border-indigo-500/30 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
                <span className="text-sm font-semibold text-indigo-300">添加新模型配置</span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">供应商</label>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="deepseek">DeepSeek</option>
                    <option value="openai">OpenAI</option>
                    <option value="qwen">通义千问 (DashScope)</option>
                    <option value="ollama">Ollama (本地)</option>
                    <option value="custom">自定义兼容接口</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">显示名称</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：DeepSeek-V3"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">实际模型标识 (Model ID)</label>
                  <input
                    type="text"
                    required
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="例如：deepseek-chat"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Base URL (API 地址)</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com/v1"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'ollama' ? '本地 Ollama 可留空' : 'sk-xxxxxxxx'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>设为空间默认模型</span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? '保存中...' : '确认添加'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
