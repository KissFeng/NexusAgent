import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { ScheduledTask, WebhookConfig, UsageSummary, AuditLog, ModelConfig, Skill } from '../types';
import {
  X,
  Activity,
  Clock,
  Send,
  Shield,
  Plus,
  Trash2,
  Play,
  Copy,
  Check,
  RefreshCw,
  Coins,
  TrendingUp,
  Settings,
  Server,
} from 'lucide-react';

interface GovernanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelConfig[];
  skills: Skill[];
}

export const GovernanceModal: React.FC<GovernanceModalProps> = ({
  isOpen,
  onClose,
  models,
  skills,
}) => {
  const [activeTab, setActiveTab] = useState<'usage' | 'schedules' | 'webhooks' | 'audit'>('usage');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 1. 用量与配额
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [newQuota, setNewQuota] = useState<number>(10000000);
  const [savingQuota, setSavingQuota] = useState(false);

  // 2. 定时任务
  const [schedules, setSchedules] = useState<ScheduledTask[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({
    name: '',
    cron_expression: '0 9 * * *',
    prompt: '',
    model_config_id: '',
    skill_code: '',
    channel_type: 'internal' as 'internal' | 'feishu' | 'wecom',
    target_id: '',
  });
  const [triggeringTaskId, setTriggeringTaskId] = useState<string | null>(null);

  // 3. Webhook 外部渠道
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    channel_type: 'feishu' as 'feishu' | 'wecom',
    app_id: '',
    app_secret: '',
    verification_token: '',
    encrypt_key: '',
    webhook_url: '',
  });
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  // 4. 审计日志
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditFilter, setAuditFilter] = useState('');

  // 复制辅助函数
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 数据加载器
  const loadUsage = async () => {
    try {
      setLoading(true);
      const data = await api.getUsageOverview();
      setUsage(data);
      setNewQuota(data.quota_monthly);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const data = await api.listSchedules();
      setSchedules(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const data = await api.listWebhooks();
      setWebhooks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const res = await api.getAuditLogs({ action_filter: auditFilter });
      setAuditLogs(res.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'usage') loadUsage();
    else if (activeTab === 'schedules') loadSchedules();
    else if (activeTab === 'webhooks') loadWebhooks();
    else if (activeTab === 'audit') loadAuditLogs();
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // 保存配额
  const handleUpdateQuota = async () => {
    try {
      setSavingQuota(true);
      await api.updateQuota(Number(newQuota));
      await loadUsage();
      alert('月度配额已更新！');
    } catch (e: any) {
      alert(e.message || '更新配额失败');
    } finally {
      setSavingQuota(false);
    }
  };

  // 创建定时任务
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.name || !taskForm.prompt || !taskForm.cron_expression) {
      alert('请完整填写任务名称、Cron 表达式和提示词');
      return;
    }
    try {
      setLoading(true);
      await api.createSchedule({
        ...taskForm,
        model_config_id: taskForm.model_config_id || undefined,
        skill_code: taskForm.skill_code || undefined,
      });
      setShowTaskForm(false);
      setTaskForm({
        name: '',
        cron_expression: '0 9 * * *',
        prompt: '',
        model_config_id: '',
        skill_code: '',
        channel_type: 'internal',
        target_id: '',
      });
      await loadSchedules();
    } catch (e: any) {
      alert(e.message || '创建任务失败');
    } finally {
      setLoading(false);
    }
  };

  // 立即触发定时任务
  const handleTriggerTask = async (taskId: string) => {
    try {
      setTriggeringTaskId(taskId);
      const res = await api.triggerSchedule(taskId);
      if (res.success) {
        alert(`执行成功！耗时: ${res.latency_ms}ms\n\n返回内容摘要:\n${(res.content || '').slice(0, 150)}...`);
      } else {
        alert(`执行异常: ${res.error}`);
      }
      await loadSchedules();
    } catch (e: any) {
      alert(e.message || '触发失败');
    } finally {
      setTriggeringTaskId(null);
    }
  };

  // 删除定时任务
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定删除该定时任务吗？')) return;
    try {
      await api.deleteSchedule(taskId);
      await loadSchedules();
    } catch (e: any) {
      alert(e.message || '删除失败');
    }
  };

  // 创建 Webhook
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookForm.name) {
      alert('请填写渠道名称');
      return;
    }
    try {
      setLoading(true);
      await api.createWebhook(webhookForm);
      setShowWebhookForm(false);
      setWebhookForm({
        name: '',
        channel_type: 'feishu',
        app_id: '',
        app_secret: '',
        verification_token: '',
        encrypt_key: '',
        webhook_url: '',
      });
      await loadWebhooks();
    } catch (e: any) {
      alert(e.message || '创建 Webhook 失败');
    } finally {
      setLoading(false);
    }
  };

  // 测试 Webhook
  const handleTestWebhook = async (webhookId: string) => {
    try {
      setTestingWebhookId(webhookId);
      const res = await api.testWebhook(webhookId);
      alert(res.message);
    } catch (e: any) {
      alert(e.message || '测试连接失败');
    } finally {
      setTestingWebhookId(null);
    }
  };

  // 删除 Webhook
  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('确定删除该 Webhook 配置吗？')) return;
    try {
      await api.deleteWebhook(webhookId);
      await loadWebhooks();
    } catch (e: any) {
      alert(e.message || '删除失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="relative flex flex-col h-[85vh] w-full max-w-5xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                系统治理与自动化调度中台
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                  Enterprise v1.2
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Token 资产计量、月度配额控制、外部渠道互通、自主定时任务与合规审计
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 border-b border-slate-800 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('usage')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'usage'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-4 h-4" />
            用量与费用看板
          </button>
          <button
            onClick={() => setActiveTab('schedules')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'schedules'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            自动化定时调度
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'webhooks'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-4 h-4" />
            外部渠道 (飞书/企微)
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === 'audit'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            安全操作审计
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: 用量与费用看板 */}
          {activeTab === 'usage' && (
            <div className="space-y-6">
              {/* 指标卡片行 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>今日消耗 Tokens</span>
                    <Coins className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100 mt-2">
                    {usage?.today.tokens.toLocaleString() || 0}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    调用次数: {usage?.today.calls || 0} 次
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>今日预估费用 (折算)</span>
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-300 mt-2">
                    ¥ {usage?.today.cost.toFixed(4) || '0.0000'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">按官方价格矩阵折算</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>本月累计消耗 Tokens</span>
                    <Activity className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-sky-300 mt-2">
                    {usage?.this_month.tokens.toLocaleString() || 0}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    本月费用: ¥ {usage?.this_month.cost.toFixed(4) || '0.0000'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>月度配额上限</span>
                    <Settings className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-purple-300 mt-2">
                    {usage?.quota_monthly ? `${(usage.quota_monthly / 10000).toFixed(0)}万` : '不限'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    已用: {usage?.quota_percentage || 0}%
                  </div>
                </div>
              </div>

              {/* 配额进度条与调整 */}
              <div className="p-5 rounded-xl bg-slate-950/40 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">月度 Token 配额使用进度</span>
                  <span className="text-xs font-mono text-slate-400">
                    {usage?.quota_used_tokens.toLocaleString()} / {usage?.quota_monthly.toLocaleString()} Tokens
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (usage?.quota_percentage || 0) > 90
                        ? 'bg-rose-500'
                        : (usage?.quota_percentage || 0) > 70
                        ? 'bg-amber-500'
                        : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(usage?.quota_percentage || 0, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                  <span className="text-slate-400">修改工作空间月度额度:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={newQuota}
                      onChange={(e) => setNewQuota(Number(e.target.value))}
                      className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 w-36 font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={handleUpdateQuota}
                      disabled={savingQuota}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition disabled:opacity-50"
                    >
                      {savingQuota ? '保存中...' : '保存配额'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 模型消耗分布表 */}
              <div className="p-5 rounded-xl bg-slate-950/40 border border-slate-800">
                <h3 className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4 text-slate-400" />
                  大模型消耗与调用明细分布
                </h3>
                {usage?.model_distribution.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    暂无大模型消耗流水记录，发起一轮对话后将在此显示。
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="pb-2 font-medium">模型标识</th>
                          <th className="pb-2 font-medium">累计 Token</th>
                          <th className="pb-2 font-medium">预估费用 (元)</th>
                          <th className="pb-2 font-medium">总调用次数</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {usage?.model_distribution.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2.5 font-sans font-medium text-slate-200">
                              {item.model_name}
                            </td>
                            <td className="py-2.5 text-indigo-400">{item.tokens.toLocaleString()}</td>
                            <td className="py-2.5 text-amber-300">¥ {item.cost.toFixed(4)}</td>
                            <td className="py-2.5 text-slate-300">{item.calls} 次</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 自动化定时调度 */}
          {activeTab === 'schedules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">定时主动任务列表</h3>
                  <p className="text-xs text-slate-400">
                    由 APScheduler 异步引擎触发，自动驱动 LangGraph 智能体完成研报、抓取与推送
                  </p>
                </div>
                <button
                  onClick={() => setShowTaskForm(!showTaskForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showTaskForm ? '取消创建' : '新建定时任务'}
                </button>
              </div>

              {/* 创建表单 */}
              {showTaskForm && (
                <form
                  onSubmit={handleCreateTask}
                  className="p-5 rounded-xl bg-slate-950/60 border border-indigo-500/30 space-y-4 animate-in fade-in"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300">任务名称</label>
                      <input
                        type="text"
                        placeholder="例如: 每日AI热点早报"
                        value={taskForm.name}
                        onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                        <span>Cron 表达式</span>
                        <span className="text-[11px] text-slate-500">示例: 0 9 * * * (每日早9点)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="0 9 * * *"
                        value={taskForm.cron_expression}
                        onChange={(e) => setTaskForm({ ...taskForm, cron_expression: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300">Agent 指令提示词 (Prompt)</label>
                    <textarea
                      rows={3}
                      placeholder="例如: 检索互联网最新的大模型技术资讯，整理成300字结构化简讯并列举关键要点..."
                      value={taskForm.prompt}
                      onChange={(e) => setTaskForm({ ...taskForm, prompt: e.target.value })}
                      className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300">指定模型</label>
                      <select
                        value={taskForm.model_config_id}
                        onChange={(e) => setTaskForm({ ...taskForm, model_config_id: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">默认空间模型</option>
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.model_name})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-300">搭载技能 (可选)</label>
                      <select
                        value={taskForm.skill_code}
                        onChange={(e) => setTaskForm({ ...taskForm, skill_code: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">不指定特定技能</option>
                        {skills.map((s) => (
                          <option key={s.id} value={s.code}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-300">结果推送渠道</label>
                      <select
                        value={taskForm.channel_type}
                        onChange={(e) => setTaskForm({ ...taskForm, channel_type: e.target.value as any })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="internal">系统内部会话历史</option>
                        <option value="feishu">飞书群 Webhook 机器人</option>
                        <option value="wecom">企业微信群 Webhook</option>
                      </select>
                    </div>
                  </div>

                  {taskForm.channel_type !== 'internal' && (
                    <div>
                      <label className="text-xs font-medium text-slate-300">
                        群机器人 Webhook URL (主动推送端点)
                      </label>
                      <input
                        type="url"
                        placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                        value={taskForm.target_id}
                        onChange={(e) => setTaskForm({ ...taskForm, target_id: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowTaskForm(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                    >
                      {loading ? '保存中...' : '确认创建任务'}
                    </button>
                  </div>
                </form>
              )}

              {/* 任务列表卡片 */}
              {schedules.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-500">
                  暂无定时任务，点击右上角【新建定时任务】开启第一个自主 Agent。
                </div>
              ) : (
                <div className="space-y-3">
                  {schedules.map((task) => (
                    <div
                      key={task.id}
                      className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 text-sm">{task.name}</span>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono text-xs border border-indigo-500/20">
                            {task.cron_expression}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs">
                            渠道: {task.channel_type.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleTriggerTask(task.id)}
                            disabled={triggeringTaskId === task.id}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs transition border border-emerald-500/30"
                          >
                            <Play className="w-3 h-3" />
                            {triggeringTaskId === task.id ? '执行中...' : '立即执行'}
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg font-sans">
                        {task.prompt}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <div>
                          上次运行: {task.last_run_at ? new Date(task.last_run_at).toLocaleString() : '尚未运行'}
                        </div>
                        <div>
                          状态:{' '}
                          {task.last_status === 'success' ? (
                            <span className="text-emerald-400 font-medium">● 成功</span>
                          ) : task.last_status === 'failed' ? (
                            <span className="text-rose-400 font-medium">● 失败 ({task.last_error})</span>
                          ) : task.last_status === 'running' ? (
                            <span className="text-indigo-400 font-medium">● 正在执行</span>
                          ) : (
                            <span className="text-slate-500">● 待调度</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 外部渠道 (飞书/企微 Webhook) */}
          {activeTab === 'webhooks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">企业级 Webhook 与机器人配置</h3>
                  <p className="text-xs text-slate-400">
                    支持飞书开放平台事件订阅 (带 Challenge 握手、验签解密与 3s 超时熔断保护)
                  </p>
                </div>
                <button
                  onClick={() => setShowWebhookForm(!showWebhookForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showWebhookForm ? '取消' : '添加外部渠道'}
                </button>
              </div>

              {/* 原生 MCP Server 协议卡片 */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-950 border border-purple-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-purple-300">
                      已注册为原生 Model Context Protocol (MCP) Server
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 font-mono">
                      JSON-RPC 2.0
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy('http://127.0.0.1:8000/api/v1/tools/mcp-webhooks', 'mcp_url')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs border border-slate-700/60"
                  >
                    {copiedId === 'mcp_url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    复制 MCP 端点
                  </button>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  本平台的外部通讯渠道已完整暴露为工业级 MCP 服务。Agent 或外部 MCP 客户端（如 Claude Desktop / Cursor）连接后可直接调用 <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">send_channel_message</code>、<code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">list_channels</code>、<code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">test_channel</code>。
                </p>
                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800">
                  <span className="text-purple-400">Endpoint:</span>
                  <span className="text-slate-300">http://127.0.0.1:8000/api/v1/tools/mcp-webhooks</span>
                </div>
              </div>

              {showWebhookForm && (
                <form
                  onSubmit={handleCreateWebhook}
                  className="p-5 rounded-xl bg-slate-950/60 border border-indigo-500/30 space-y-4 animate-in fade-in"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300">渠道标识名称</label>
                      <input
                        type="text"
                        placeholder="例如: 飞书研发部答疑助手"
                        value={webhookForm.name}
                        onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300">平台类型</label>
                      <select
                        value={webhookForm.channel_type}
                        onChange={(e) => setWebhookForm({ ...webhookForm, channel_type: e.target.value as any })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      >
                        <option value="feishu">飞书开放平台 (Feishu / Lark)</option>
                        <option value="wecom">企业微信 (WeCom)</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-xs text-indigo-300 space-y-1">
                    <p className="font-medium">💡 两种接入模式二选一：</p>
                    <p>1. <b>极速群机器人模式</b>：只需填入群机器人的 Webhook URL 即可直接支持定时任务与主动群播报。</p>
                    <p>2. <b>全双工企业应用模式</b>：填入开放平台的 App ID、App Secret、Verification Token，可在群内 @ 机器人实时交互。</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300">群机器人 Webhook URL (模式 1)</label>
                    <input
                      type="url"
                      placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                      value={webhookForm.webhook_url}
                      onChange={(e) => setWebhookForm({ ...webhookForm, webhook_url: e.target.value })}
                      className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300">App ID (模式 2)</label>
                      <input
                        type="text"
                        placeholder="cli_a..."
                        value={webhookForm.app_id}
                        onChange={(e) => setWebhookForm({ ...webhookForm, app_id: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300">App Secret (模式 2)</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={webhookForm.app_secret}
                        onChange={(e) => setWebhookForm({ ...webhookForm, app_secret: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-300">Verification Token (飞书验签)</label>
                      <input
                        type="text"
                        placeholder="可选，用于安全验签"
                        value={webhookForm.verification_token}
                        onChange={(e) => setWebhookForm({ ...webhookForm, verification_token: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300">Encrypt Key (飞书加密串)</label>
                      <input
                        type="password"
                        placeholder="可选，若启用密文模式请填写"
                        value={webhookForm.encrypt_key}
                        onChange={(e) => setWebhookForm({ ...webhookForm, encrypt_key: e.target.value })}
                        className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowWebhookForm(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                    >
                      {loading ? '保存中...' : '确认创建'}
                    </button>
                  </div>
                </form>
              )}

              {/* Webhook 列表 */}
              {webhooks.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-500">
                  暂未绑定任何外部企业通讯渠道，点击右上角【添加外部渠道】开启。
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((wh) => (
                    <div
                      key={wh.id}
                      className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 text-sm">{wh.name}</span>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-xs font-mono border border-indigo-500/20">
                            {wh.channel_type.toUpperCase()}
                          </span>
                          {wh.has_app_secret && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[11px]">
                              双向应用已绑定
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleTestWebhook(wh.id)}
                            disabled={testingWebhookId === wh.id}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 text-xs transition border border-indigo-500/30"
                          >
                            <Send className="w-3 h-3" />
                            {testingWebhookId === wh.id ? '测试中...' : '测试连通性'}
                          </button>
                          <button
                            onClick={() => handleDeleteWebhook(wh.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* 回调 URL 展示卡片 */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                        <div className="text-slate-400 truncate pr-2">
                          <span className="text-slate-500">飞书事件订阅请求网址: </span>
                          <span className="text-indigo-300">{wh.callback_url}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(wh.callback_url, wh.id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                        >
                          {copiedId === wh.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          复制
                        </button>
                      </div>

                      {wh.webhook_url && (
                        <div className="text-xs text-slate-500 truncate">
                          群机器人推送端点: {wh.webhook_url}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 安全操作审计 */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">企业合规操作审计流水</h3>
                  <p className="text-xs text-slate-400">
                    全量不可篡改的系统日志：涵盖对话发起、高危审批决策、任务启停与配置变更
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="按动作过滤 (如 schedule / chat)..."
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500 w-52"
                  />
                  <button
                    onClick={loadAuditLogs}
                    className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {auditLogs.length === 0 ? (
                <div className="text-center py-12 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-500">
                  暂无审计流水记录。
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                        <th className="py-2.5 px-3 font-medium">触发动作</th>
                        <th className="py-2.5 px-3 font-medium">资源类型</th>
                        <th className="py-2.5 px-3 font-medium">状态</th>
                        <th className="py-2.5 px-3 font-medium">详情快照</th>
                        <th className="py-2.5 px-3 font-medium text-right">记录时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-indigo-400 font-medium">{log.action}</td>
                          <td className="py-2 px-3 text-slate-300">{log.resource_type}</td>
                          <td className="py-2 px-3">
                            {log.status === 'success' ? (
                              <span className="text-emerald-400">成功</span>
                            ) : (
                              <span className="text-rose-400">失败</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400 max-w-xs truncate font-sans">
                            {log.details || '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500">
                            {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
