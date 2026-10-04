import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Layers,
  Zap,
  Radio,
  CalendarClock,
  BookOpen,
  Shield,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  Play,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import type {
  ModelConfig,
  Skill,
  ToolConfig,
  ScheduledTask,
  WebhookConfig,
  KnowledgeBase,
  UsageSummary,
  AuditLog,
} from '../../types';
import { api } from '../../api/client';
import type { SettingsSubTab } from '../layout/SubSidebar';

interface SettingsViewProps {
  activeTab: SettingsSubTab;
  onNavigateToPlaza?: (cat: 'mcp' | 'skill') => void;
  onNavigateToKnowledge?: () => void;
  models: ModelConfig[];
  onRefreshModels: () => void;
  skills: Skill[];
  onRefreshSkills: () => void;
  tools: ToolConfig[];
  onRefreshTools: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  activeTab,
  onNavigateToPlaza,
  onNavigateToKnowledge,
  models,
  onRefreshModels,
  skills,
  onRefreshSkills,
  tools,
  onRefreshTools,
}) => {
  // ---- 1. Model State ----
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [modelForm, setModelForm] = useState({
    name: '',
    provider: 'deepseek' as ModelConfig['provider'],
    model_name: '',
    base_url: '',
    api_key: '',
    is_default: false,
  });
  const [modelProbeResult, setModelProbeResult] = useState<{
    id: string;
    success: boolean;
    latency_ms?: number;
    message?: string;
  } | null>(null);
  const [probingModelId, setProbingModelId] = useState<string | null>(null);

  // ---- 2. MCP State ----
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [mcpForm, setMcpForm] = useState({
    name: '',
    description: '',
    tool_type: 'mcp_server',
    config_json: '{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-fetch"]\n}',
  });

  // ---- 3. Skill State ----
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [skillForm, setSkillForm] = useState({
    name: '',
    code: '',
    category: '研发提效',
    description: '',
    system_prompt: '',
    bound_tools: [] as string[],
  });

  // ---- 4. Channels State ----
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [isAddingWebhook, setIsAddingWebhook] = useState(false);
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    channel_type: 'feishu' as 'feishu' | 'wecom',
    app_id: '',
    app_secret: '',
    webhook_url: '',
    verification_token: '',
    encrypt_key: '',
    is_active: true,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ---- 5. Scheduled Tasks State ----
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    name: '',
    cron_expression: '0 9 * * *',
    prompt: '',
    skill_code: '',
    channel_type: 'internal' as 'internal' | 'feishu' | 'wecom',
    target_id: '',
  });

  // ---- 6. Knowledge Bases State ----
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  // ---- 7. Governance State ----
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // 加载数据
  useEffect(() => {
    if (activeTab === 'channels') {
      api.listWebhooks().then(setWebhooks).catch(console.error);
    } else if (activeTab === 'tasks') {
      api.listSchedules().then(setTasks).catch(console.error);
    } else if (activeTab === 'knowledge') {
      api.listKnowledgeBases().then(setKnowledgeBases).catch(console.error);
    } else if (activeTab === 'governance') {
      api.getUsageOverview().then(setUsageSummary).catch(console.error);
      api.getAuditLogs().then((res) => setAuditLogs(res.items)).catch(console.error);
    }
  }, [activeTab]);

  // 复制文本提示
  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ================= 1. MODEL HANDLERS =================
  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingModel) {
        await api.updateModel(editingModel.id, modelForm);
      } else {
        await api.createModel(modelForm);
      }
      setIsAddingModel(false);
      setEditingModel(null);
      onRefreshModels();
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    }
  };

  const handleProbeModel = async (model: ModelConfig) => {
    try {
      setProbingModelId(model.id);
      const res = await api.probeExistingModel(model.id);
      setModelProbeResult({ id: model.id, ...res });
    } catch (err: any) {
      setModelProbeResult({ id: model.id, success: false, message: err.message });
    } finally {
      setProbingModelId(null);
    }
  };

  // ================= 2. MCP HANDLERS =================
  const handleSaveMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let cfg = {};
      try {
        cfg = JSON.parse(mcpForm.config_json);
      } catch {
        alert('配置必须是标准 JSON 格式！');
        return;
      }
      await api.createTool({
        name: mcpForm.name,
        description: mcpForm.description,
        tool_type: mcpForm.tool_type,
        config: cfg,
        is_enabled: true,
      });
      setIsAddingMcp(false);
      setMcpForm({
        name: '',
        description: '',
        tool_type: 'mcp_server',
        config_json: '{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-fetch"]\n}',
      });
      onRefreshTools();
    } catch (err: any) {
      alert(`添加 MCP 失败: ${err.message}`);
    }
  };

  const handleToggleTool = async (tool: ToolConfig) => {
    try {
      await api.updateTool(tool.id, { is_enabled: !tool.is_enabled });
      onRefreshTools();
    } catch (err: any) {
      alert(`操作失败: ${err.message}`);
    }
  };

  const handleDeleteTool = async (id: string) => {
    if (!confirm('确定删除该 MCP 服务吗？')) return;
    try {
      await api.deleteTool(id);
      onRefreshTools();
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  // ================= 3. SKILL HANDLERS =================
  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSkill) {
        await api.updateSkill(editingSkill.id, skillForm);
      } else {
        await api.createSkill(skillForm);
      }
      setIsAddingSkill(false);
      setEditingSkill(null);
      onRefreshSkills();
    } catch (err: any) {
      alert(`保存技能失败: ${err.message}`);
    }
  };

  const handleToggleSkill = async (skill: Skill) => {
    try {
      await api.updateSkill(skill.id, { is_enabled: !skill.is_enabled });
      onRefreshSkills();
    } catch (err: any) {
      alert(`操作失败: ${err.message}`);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!confirm('确定删除此技能吗？')) return;
    try {
      await api.deleteSkill(id);
      onRefreshSkills();
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  // ================= 4. CHANNELS HANDLERS =================
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWebhook(webhookForm);
      setIsAddingWebhook(false);
      setWebhookForm({
        name: '',
        channel_type: 'feishu',
        app_id: '',
        app_secret: '',
        webhook_url: '',
        verification_token: '',
        encrypt_key: '',
        is_active: true,
      });
      api.listWebhooks().then(setWebhooks);
    } catch (err: any) {
      alert(`保存渠道配置失败: ${err.message}`);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('确定删除此渠道配置吗？')) return;
    try {
      await api.deleteWebhook(id);
      api.listWebhooks().then(setWebhooks);
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  // ================= 5. TASKS HANDLERS =================
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createSchedule(taskForm);
      setIsAddingTask(false);
      setTaskForm({
        name: '',
        cron_expression: '0 9 * * *',
        prompt: '',
        skill_code: '',
        channel_type: 'internal',
        target_id: '',
      });
      api.listSchedules().then(setTasks);
    } catch (err: any) {
      alert(`创建定时任务失败: ${err.message}`);
    }
  };

  const handleRunTaskImmediately = async (taskId: string) => {
    try {
      await api.triggerSchedule(taskId);
      alert('已触发异步执行！');
      setTimeout(() => api.listSchedules().then(setTasks), 1500);
    } catch (err: any) {
      alert(`执行失败: ${err.message}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定删除此定时任务吗？')) return;
    try {
      await api.deleteSchedule(taskId);
      api.listSchedules().then(setTasks);
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 h-full bg-slate-950 overflow-y-auto px-8 py-6 text-slate-100">
      {/* ────────────────── 1. MODEL CONFIG ────────────────── */}
      {activeTab === 'model' && (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <span>模型供应商配置 (Model Providers)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                接入与管理 DeepSeek、OpenAI、SiliconFlow、Ollama 等多模型端点，支持延迟测速与自动可用模型发现。
              </p>
            </div>

            <button
              onClick={() => {
                setIsAddingModel(true);
                setEditingModel(null);
                setModelForm({
                  name: '',
                  provider: 'deepseek',
                  model_name: 'deepseek-chat',
                  base_url: 'https://api.deepseek.com/v1',
                  api_key: '',
                  is_default: false,
                });
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>添加模型</span>
            </button>
          </div>

          {/* 表单弹窗/展开 */}
          {(isAddingModel || editingModel) && (
            <form onSubmit={handleSaveModel} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  {editingModel ? '编辑模型配置' : '添加新模型服务'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingModel(false);
                    setEditingModel(null);
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">显示名称</label>
                  <input
                    type="text"
                    required
                    placeholder="如：DeepSeek-V3 生产环境"
                    value={modelForm.name}
                    onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">供应商类型</label>
                  <select
                    value={modelForm.provider}
                    onChange={(e) => setModelForm({ ...modelForm, provider: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="deepseek">DeepSeek (官方)</option>
                    <option value="openai">OpenAI (GPT-4o/o3)</option>
                    <option value="qwen">通义千问 (DashScope)</option>
                    <option value="ollama">Ollama (本地自建)</option>
                    <option value="custom">兼容 OpenAI 规范的第三方 (SiliconFlow/OneAPI)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">模型标识 (Model Identifier)</label>
                  <input
                    type="text"
                    required
                    placeholder="如：deepseek-chat 或 Qwen/Qwen2.5-72B-Instruct"
                    value={modelForm.model_name}
                    onChange={(e) => setModelForm({ ...modelForm, model_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">API 基础路径 (Base URL)</label>
                  <input
                    type="text"
                    placeholder="如：https://api.deepseek.com/v1"
                    value={modelForm.base_url}
                    onChange={(e) => setModelForm({ ...modelForm, base_url: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">API Key</label>
                  <input
                    type="password"
                    placeholder={editingModel ? '留空表示保持原有密钥不变' : 'sk-xxxxxxxx'}
                    value={modelForm.api_key}
                    onChange={(e) => setModelForm({ ...modelForm, api_key: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md cursor-pointer"
                >
                  保存配置
                </button>
              </div>
            </form>
          )}

          {/* 模型卡片列表 */}
          <div className="space-y-3">
            {models.map((m) => {
              const probe = modelProbeResult?.id === m.id ? modelProbeResult : null;
              return (
                <div
                  key={m.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{m.name}</span>
                        {m.is_default && (
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ★ 默认模型
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                          {m.provider}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {m.model_name} · {m.base_url || '官方默认端点'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 探测结果 */}
                    {probe && (
                      <span
                        className={`text-[11px] px-2 py-1 rounded-lg border font-mono ${
                          probe.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-red-500/10 border-red-500/30 text-red-300'
                        }`}
                      >
                        {probe.success ? `🟢 正常 (${probe.latency_ms}ms)` : `🔴 异常: ${probe.message}`}
                      </span>
                    )}

                    <button
                      onClick={() => handleProbeModel(m)}
                      disabled={probingModelId === m.id}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                      title="发起探测"
                    >
                      {probingModelId === m.id ? '测速中...' : '探测延迟'}
                    </button>

                    {!m.is_default && (
                      <button
                        onClick={async () => {
                          await api.setDefaultModel(m.id);
                          onRefreshModels();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600/30 hover:text-indigo-300 text-xs text-slate-400 transition-colors cursor-pointer"
                      >
                        设为默认
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setEditingModel(m);
                        setModelForm({
                          name: m.name,
                          provider: m.provider,
                          model_name: m.model_name,
                          base_url: m.base_url || '',
                          api_key: '',
                          is_default: m.is_default,
                        });
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={async () => {
                        if (!confirm('确定删除此模型配置吗？')) return;
                        await api.deleteModel(m.id);
                        onRefreshModels();
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ────────────────── 2. MCP SERVERS CONFIG ────────────────── */}
      {activeTab === 'mcp' && (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <span>MCP 服务管理 (Model Context Protocol)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                所有工具已全面收敛统一至 MCP 标准。支持内置核心能力与外部 Stdio / SSE 独立进程接入。
              </p>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToPlaza && (
                <button
                  onClick={() => onNavigateToPlaza('mcp')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-xs font-semibold cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>前往 MCP 广场装载</span>
                </button>
              )}

              <button
                onClick={() => setIsAddingMcp(!isAddingMcp)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>添加自定义 MCP</span>
              </button>
            </div>
          </div>

          {/* 添加自定义 MCP 表单 */}
          {isAddingMcp && (
            <form onSubmit={handleSaveMcp} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white">添加自定义外部 MCP 服务</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">服务名称</label>
                  <input
                    type="text"
                    required
                    placeholder="如：PostgreSQL 数据自省服务"
                    value={mcpForm.name}
                    onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">协议类型</label>
                  <select
                    value={mcpForm.tool_type}
                    onChange={(e) => setMcpForm({ ...mcpForm, tool_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="mcp_server">MCP Stdio / SSE 外部进程</option>
                    <option value="web_search">内置联网搜索</option>
                    <option value="code_interpreter">内置代码沙箱</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">服务简述</label>
                  <input
                    type="text"
                    placeholder="简要说明该 MCP 服务提供的工具与意图"
                    value={mcpForm.description}
                    onChange={(e) => setMcpForm({ ...mcpForm, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">启动参数配置 (JSON)</label>
                  <textarea
                    rows={5}
                    value={mcpForm.config_json}
                    onChange={(e) => setMcpForm({ ...mcpForm, config_json: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddingMcp(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md cursor-pointer"
                >
                  确认接入
                </button>
              </div>
            </form>
          )}

          {/* MCP 卡片列表 */}
          <div className="space-y-3">
            {tools.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{t.name}</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
                        {t.tool_type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                      {t.description || '标准 MCP 工具服务'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleTool(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      t.is_enabled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t.is_enabled ? '已启用' : '已停用'}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteTool(t.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                    title="卸载 MCP 服务"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────── 3. SKILLS CONFIG ────────────────── */}
      {activeTab === 'skill' && (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <span>专业技能配置 (Agent Skills)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                管理已装载的智能体专业技能，输入框键入 `/` 即可触发，支持绑定专属 MCP 工具与提示词工程。
              </p>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToPlaza && (
                <button
                  onClick={() => onNavigateToPlaza('skill')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/30 text-amber-300 text-xs font-semibold cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>前往 Skill 广场装载</span>
                </button>
              )}

              <button
                onClick={() => {
                  setIsAddingSkill(true);
                  setEditingSkill(null);
                  setSkillForm({
                    name: '',
                    code: '',
                    category: '研发提效',
                    description: '',
                    system_prompt: '',
                    bound_tools: [],
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>创建自定义技能</span>
              </button>
            </div>
          </div>

          {/* 表单 */}
          {(isAddingSkill || editingSkill) && (
            <form onSubmit={handleSaveSkill} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white">
                {editingSkill ? `编辑技能: /${editingSkill.code}` : '新建专业技能'}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">技能名称</label>
                  <input
                    type="text"
                    required
                    placeholder="如：全栈开发专家"
                    value={skillForm.name}
                    onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">快捷指令 (Slash Code)</label>
                  <input
                    type="text"
                    required
                    placeholder="如：fullstack_dev"
                    disabled={!!editingSkill}
                    value={skillForm.code}
                    onChange={(e) => setSkillForm({ ...skillForm, code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">业务分类</label>
                  <input
                    type="text"
                    value={skillForm.category}
                    onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">描述</label>
                  <input
                    type="text"
                    value={skillForm.description}
                    onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">系统提示词 (System Prompt)</label>
                  <textarea
                    rows={6}
                    value={skillForm.system_prompt}
                    onChange={(e) => setSkillForm({ ...skillForm, system_prompt: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingSkill(false);
                    setEditingSkill(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md cursor-pointer"
                >
                  保存技能
                </button>
              </div>
            </form>
          )}

          {/* 技能卡片列表 */}
          <div className="space-y-3">
            {skills.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{s.name}</span>
                      <span className="text-xs text-amber-400 font-mono font-bold">/{s.code}</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-400">
                        {s.category}
                      </span>
                      {s.is_preset && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                          预置
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                      {s.description}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleSkill(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      s.is_enabled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{s.is_enabled ? '已启用' : '已停用'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingSkill(s);
                      setSkillForm({
                        name: s.name,
                        code: s.code,
                        category: s.category,
                        description: s.description,
                        system_prompt: s.system_prompt,
                        bound_tools: s.bound_tools || [],
                      });
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteSkill(s.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────── 4. CHANNELS CONFIG (飞书/QQ/微信/钉钉) ────────────────── */}
      {activeTab === 'channels' && (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-400" />
                <span>外部协同频道接入 (Channels & Webhooks)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                接入飞书 (Feishu/Lark)、企业微信 (WeCom)、QQ 机器人及钉钉，配置双向 Webhook 接收与异步主动播报。
              </p>
            </div>

            <button
              onClick={() => setIsAddingWebhook(!isAddingWebhook)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>添加频道接入</span>
            </button>
          </div>

          {/* 表单 */}
          {isAddingWebhook && (
            <form onSubmit={handleSaveWebhook} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white">配置外部通讯渠道</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">渠道名称</label>
                  <input
                    type="text"
                    required
                    placeholder="如：技术支持飞书服务台群"
                    value={webhookForm.name}
                    onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">渠道类型</label>
                  <select
                    value={webhookForm.channel_type}
                    onChange={(e) => setWebhookForm({ ...webhookForm, channel_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="feishu">飞书 / Lark (推荐)</option>
                    <option value="wecom">企业微信 / 微信机器人</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">App ID</label>
                  <input
                    type="text"
                    placeholder="cli_a1b2c3d4e5"
                    value={webhookForm.app_id}
                    onChange={(e) => setWebhookForm({ ...webhookForm, app_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">App Secret</label>
                  <input
                    type="password"
                    placeholder="密钥秘钥"
                    value={webhookForm.app_secret}
                    onChange={(e) => setWebhookForm({ ...webhookForm, app_secret: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">群机器人 Webhook URL (主动推流地址)</label>
                  <input
                    type="text"
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx"
                    value={webhookForm.webhook_url}
                    onChange={(e) => setWebhookForm({ ...webhookForm, webhook_url: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingWebhook(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md cursor-pointer"
                >
                  确认保存
                </button>
              </div>
            </form>
          )}

          {/* 渠道列表 */}
          <div className="space-y-3">
            {webhooks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
                暂未配置外部通讯频道，点击上方按钮新增。
              </div>
            ) : (
              webhooks.map((w) => (
                <div
                  key={w.id}
                  className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                        {w.channel_type === 'feishu' ? '飞' : '微'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{w.name}</span>
                          <span className="text-[10px] px-2 py-0.2 rounded-full uppercase bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-mono">
                            {w.channel_type}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          App ID: {w.app_id || '未配置'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteWebhook(w.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 回调地址 */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-500 font-mono">接收事件回调地址:</span>
                      <span className="text-indigo-400 font-mono truncate">{w.callback_url}</span>
                    </div>
                    <button
                      onClick={() => copyText(w.callback_url, w.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 cursor-pointer shrink-0 ml-2"
                    >
                      {copiedId === w.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === w.id ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ────────────────── 5. SCHEDULED TASKS CONFIG ────────────────── */}
      {activeTab === 'tasks' && (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-indigo-400" />
                <span>定时任务调度管理 (Scheduled Tasks)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                基于 APScheduler 驱动的时间感知主动智能体，配置 Cron 表达式周期自动执行任务并向飞书/微信群播报。
              </p>
            </div>

            <button
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新建定时任务</span>
            </button>
          </div>

          {/* 表单 */}
          {isAddingTask && (
            <form onSubmit={handleSaveTask} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white">创建主动定时任务</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">任务名称</label>
                  <input
                    type="text"
                    required
                    placeholder="如：每日早 9 点竞品研报汇总"
                    value={taskForm.name}
                    onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cron 表达式</label>
                  <input
                    type="text"
                    required
                    placeholder="0 9 * * * (每日早9点)"
                    value={taskForm.cron_expression}
                    onChange={(e) => setTaskForm({ ...taskForm, cron_expression: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">执行提示词与目标指令</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="如：请联网抓取今日 AI 行业重要融资事件并输出三点行业研报总结..."
                    value={taskForm.prompt}
                    onChange={(e) => setTaskForm({ ...taskForm, prompt: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">绑定执行技能 (可选)</label>
                  <select
                    value={taskForm.skill_code}
                    onChange={(e) => setTaskForm({ ...taskForm, skill_code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="">通用无特定技能</option>
                    {skills.map((s) => (
                      <option key={s.code} value={s.code}>
                        /{s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">输出投递渠道</label>
                  <select
                    value={taskForm.channel_type}
                    onChange={(e) => setTaskForm({ ...taskForm, channel_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="internal">系统内置会话归档</option>
                    <option value="feishu">飞书群机器人</option>
                    <option value="wecom">企业微信机器人</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingTask(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md cursor-pointer"
                >
                  保存并加入调度器
                </button>
              </div>
            </form>
          )}

          {/* 任务列表 */}
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
                暂未配置定时任务。
              </div>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{t.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                        {t.cron_expression}
                      </span>
                      {t.skill_code && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                          /{t.skill_code}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 line-clamp-1">{t.prompt}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3 font-mono">
                      <span>上次运行: {t.last_run_at || '尚未运行'}</span>
                      {t.last_status && (
                        <span className={t.last_status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                          状态: {t.last_status}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRunTaskImmediately(t.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-indigo-400" />
                      <span>立即触发一次</span>
                    </button>

                    <button
                      onClick={() => handleDeleteTask(t.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ────────────────── 6. KNOWLEDGE BASE SETTINGS ────────────────── */}
      {activeTab === 'knowledge' && (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                <span>知识库与混合检索设置 (Knowledge & RAG)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                当前空间共拥有 {knowledgeBases.length} 个知识库资产。检索融合采用 Qdrant 稠密语义 + BM25Okapi 关键词精准分词 + RRF 融合打分策略。
              </p>
            </div>

            {onNavigateToKnowledge && (
              <button
                onClick={onNavigateToKnowledge}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>进入沉浸式知识库视口</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                混合检索融合策略 (Calibrated Hybrid Fusion)
              </h3>
              <div className="space-y-2 text-xs text-slate-400">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span>Dense 稠密语义向量权重</span>
                  <span className="font-mono text-indigo-400 font-bold">55%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span>Sparse 稀疏关键词权重</span>
                  <span className="font-mono text-indigo-400 font-bold">40%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span>双路共振增益基础分</span>
                  <span className="font-mono text-indigo-400 font-bold">+5%</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>分块预设尺寸 (Chunk Size)</span>
                  <span className="font-mono text-indigo-400 font-bold">350~650 字符 (语义自适应)</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                分块预处理与清洗引擎
              </h3>
              <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                <li><span className="text-slate-200">NFKC 规范化</span>：自动修复康熙部首异形汉字编码脱靶。</li>
                <li><span className="text-slate-200">空格自愈</span>：智能消除排版导致的汉字字距断字（如“赵 杰”）。</li>
                <li><span className="text-slate-200">Jieba 中文搜索引擎分词</span>：精确捕获专有名词。</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── 7. GOVERNANCE & AUDIT ────────────────── */}
      {activeTab === 'governance' && (
        <div className="max-w-4xl space-y-6">
          <div className="pb-4 border-b border-slate-800/80">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <span>企业用量监控与合规审计 (Governance & Audit)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Token 消耗与成本计量、空间硬配额监控及符合等保三级规范的操作审计轨迹。
            </p>
          </div>

          {/* 汇总卡片 */}
          {usageSummary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs text-slate-400">今日消耗 Token</div>
                <div className="text-2xl font-bold font-mono text-white mt-1">
                  {usageSummary.today.tokens.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1">调用 {usageSummary.today.calls} 次</div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs text-slate-400">本月累计预估费用</div>
                <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  ¥{usageSummary.this_month.cost.toFixed(4)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {usageSummary.this_month.tokens.toLocaleString()} Tokens
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs text-slate-400">月度硬配额消耗</div>
                <div className="text-2xl font-bold font-mono text-indigo-400 mt-1">
                  {usageSummary.quota_percentage.toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  上限: {usageSummary.quota_monthly === 0 ? '无上限' : usageSummary.quota_monthly.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* 审计日志 */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              操作审计日志 (Audit Trail)
            </h3>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {auditLogs.length === 0 ? (
                <div className="text-xs text-slate-500">暂无审计日志</div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950 text-xs font-mono text-slate-300"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-400 font-bold">{log.action}</span>
                      <span className="text-slate-500">{log.resource_type}</span>
                    </div>
                    <span className="text-slate-500">{log.created_at || '刚刚'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
