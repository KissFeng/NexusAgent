import React, { useState } from 'react';
import { api } from '../api/client';
import type { ToolConfig } from '../types';
import {
  X,
  Plus,
  Trash2,
  Globe,
  Code2,
  Check,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Cpu,
  RefreshCw,
  Zap,
  ShieldCheck,
  Radio,
  Settings2,
  Key,
  Layers,
} from 'lucide-react';

interface ToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  tools: ToolConfig[];
  onRefresh: () => void;
}

const MCP_PRESETS = [
  {
    name: '官方内置 MCP 示范服务 (Demo MCP)',
    toolType: 'mcp_server',
    url: 'http://127.0.0.1:8000/api/v1/tools/mcp-mock',
    desc: '内置演示服务，提供实时天气 (fetch_city_weather) 与企业库存数据查询 (query_inventory_db)。',
    protocol: 'auto',
    headers: '',
    defaultParams: '{\n  "city": "北京",\n  "category": "办公用品"\n}',
  },
  {
    name: 'SQLite 数据库 MCP 服务',
    toolType: 'mcp_server',
    url: 'http://127.0.0.1:8080/mcp/sqlite',
    desc: '标准数据库 MCP 服务端，用于执行只读 SQL 分析与数据字典探查。',
    protocol: 'auto',
    headers: '',
    defaultParams: '{\n  "read_only": true,\n  "limit": 50\n}',
  },
  {
    name: '文件系统 Filesystem MCP 服务',
    toolType: 'mcp_server',
    url: 'http://127.0.0.1:8080/mcp/fs',
    desc: '隔离沙箱文件系统，支持向指定工程目录读取日志与持久化产物。',
    protocol: 'sse',
    headers: '',
    defaultParams: '{\n  "sandbox_path": "/workspace"\n}',
  },
  {
    name: 'GitHub 官方 MCP 协议服务',
    toolType: 'mcp_server',
    url: 'https://api.github.com/mcp',
    desc: '对接 GitHub 开放平台，支持检索仓库代码、Issue 讨论与 PR 变更。',
    protocol: 'sse',
    headers: '{\n  "Authorization": "Bearer ghp_your_token_here"\n}',
    defaultParams: '{\n  "owner": "microsoft",\n  "repo": "vscode"\n}',
  },
];

export const ToolModal: React.FC<ToolModalProps> = ({
  isOpen,
  onClose,
  tools,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'mcp'>('all');
  const [formMode, setFormMode] = useState<'none' | 'add'>('none');
  const [editingToolId, setEditingToolId] = useState<string | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [toolType, setToolType] = useState('mcp_server');
  const [description, setDescription] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [protocol, setProtocol] = useState<'auto' | 'sse' | 'http'>('auto');
  const [headersStr, setHeadersStr] = useState('');
  const [defaultParamsStr, setDefaultParamsStr] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTip, setSuccessTip] = useState<string | null>(null);

  // MCP 测试状态管理
  const [testingId, setTestingId] = useState<string | null>(null);
  const [mcpTestResults, setMcpTestResults] = useState<
    Record<string, { success: boolean; tools: any[]; message: string }>
  >({});
  const [isTestingFormUrl, setIsTestingFormUrl] = useState(false);
  const [formTestResult, setFormTestResult] = useState<{
    success: boolean;
    tools: any[];
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setSuccessTip(msg);
    setTimeout(() => setSuccessTip(null), 3500);
  };

  const resetForm = () => {
    setName('');
    setToolType('mcp_server');
    setDescription('');
    setEndpointUrl('');
    setProtocol('auto');
    setHeadersStr('');
    setDefaultParamsStr('');
    setShowAdvanced(false);
    setError(null);
    setFormTestResult(null);
    setEditingToolId(null);
    setFormMode('none');
  };

  const applyPreset = (preset: (typeof MCP_PRESETS)[0]) => {
    setEditingToolId(null);
    setToolType(preset.toolType);
    setName(preset.name);
    setEndpointUrl(preset.url);
    setDescription(preset.desc);
    setProtocol(preset.protocol as any);
    setHeadersStr(preset.headers);
    setDefaultParamsStr(preset.defaultParams);
    setShowAdvanced(Boolean(preset.headers || preset.defaultParams));
    setFormMode('add');
    setFormTestResult(null);
  };

  const handleEditTool = (tool: ToolConfig) => {
    setEditingToolId(tool.id);
    setName(tool.name);
    setToolType(tool.tool_type);
    setDescription(tool.description || '');

    const cfg = tool.config || {};
    setEndpointUrl(cfg.server_url || cfg.url || '');
    setProtocol(cfg.protocol || 'auto');
    setHeadersStr(cfg.headers ? JSON.stringify(cfg.headers, null, 2) : '');
    setDefaultParamsStr(
      cfg.default_params ? JSON.stringify(cfg.default_params, null, 2) : ''
    );
    setShowAdvanced(Boolean(cfg.headers || cfg.default_params));
    setError(null);
    setFormTestResult(null);
    setFormMode('add');
  };

  const handleToggleEnable = async (tool: ToolConfig) => {
    try {
      await api.updateTool(tool.id, { is_enabled: !tool.is_enabled });
      onRefresh();
      showNotification(`工具 [${tool.name}] 已${!tool.is_enabled ? '启用' : '禁用'}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '切换工具状态失败');
    }
  };

  const handleDelete = async (toolId: string, toolName: string) => {
    if (!confirm(`确定要移除工具【${toolName}】吗？`)) return;
    try {
      await api.deleteTool(toolId);
      onRefresh();
      showNotification(`工具【${toolName}】已移除`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除工具失败');
    }
  };

  const handleTestMcp = async (tool: ToolConfig) => {
    const serverUrl = tool.config?.server_url || tool.config?.url;
    if (!serverUrl) return;

    setTestingId(tool.id);
    try {
      const res = await api.testMcpServer(
        serverUrl,
        tool.config?.headers,
        tool.config?.protocol
      );
      setMcpTestResults((prev) => ({ ...prev, [tool.id]: res }));
    } catch (err: unknown) {
      setMcpTestResults((prev) => ({
        ...prev,
        [tool.id]: {
          success: false,
          tools: [],
          message: err instanceof Error ? err.message : '连接异常',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleTestFormUrl = async () => {
    if (!endpointUrl.trim()) {
      setError('请先输入有效的端点 URL');
      return;
    }

    let parsedHeaders: Record<string, string> | undefined = undefined;
    if (headersStr.trim()) {
      try {
        parsedHeaders = JSON.parse(headersStr.trim());
      } catch {
        setError('自定义请求头 JSON 格式不合法，请检查括号与双引号');
        return;
      }
    }

    setIsTestingFormUrl(true);
    setFormTestResult(null);
    setError(null);
    try {
      const res = await api.testMcpServer(
        endpointUrl.trim(),
        parsedHeaders,
        protocol
      );
      setFormTestResult(res);
    } catch (err: unknown) {
      setFormTestResult({
        success: false,
        tools: [],
        message: err instanceof Error ? err.message : '连接端点失败',
      });
    } finally {
      setIsTestingFormUrl(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请填写工具名称');
      return;
    }
    if ((toolType === 'custom_http' || toolType === 'mcp_server') && !endpointUrl.trim()) {
      setError('请填写调用端点 URL');
      return;
    }

    let parsedHeaders: Record<string, any> | undefined = undefined;
    if (headersStr.trim()) {
      try {
        parsedHeaders = JSON.parse(headersStr.trim());
      } catch {
        setError('自定义请求头 JSON 格式错误，请检查格式');
        return;
      }
    }

    let parsedDefaultParams: Record<string, any> | undefined = undefined;
    if (defaultParamsStr.trim()) {
      try {
        parsedDefaultParams = JSON.parse(defaultParamsStr.trim());
      } catch {
        setError('默认参数配置 JSON 格式错误，请检查格式');
        return;
      }
    }

    setLoading(true);
    setError(null);

    const config: Record<string, any> =
      toolType === 'mcp_server'
        ? {
            server_url: endpointUrl.trim(),
            protocol: protocol || 'auto',
            headers: parsedHeaders || {},
            default_params: parsedDefaultParams || {},
          }
        : toolType === 'custom_http'
        ? {
            url: endpointUrl.trim(),
            method: 'POST',
            headers: parsedHeaders || {},
            default_params: parsedDefaultParams || {},
          }
        : {};

    try {
      if (editingToolId) {
        await api.updateTool(editingToolId, {
          name: name.trim(),
          description: description.trim(),
          config,
          is_enabled: true,
        });
        showNotification(`【${name.trim()}】配置已更新！`);
      } else {
        await api.createTool({
          tool_type: toolType,
          name: name.trim(),
          description: description.trim(),
          config,
          is_enabled: true,
        });
        showNotification(
          `${toolType === 'mcp_server' ? 'MCP 协议服务' : '自定义工具'}接入成功！`
        );
      }
      resetForm();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const getToolIcon = (type: string) => {
    if (type === 'web_search') return <Globe className="w-5 h-5 text-blue-400" />;
    if (type === 'code_interpreter') return <Code2 className="w-5 h-5 text-emerald-400" />;
    if (type === 'mcp_server') return <Cpu className="w-5 h-5 text-purple-400" />;
    return <ExternalLink className="w-5 h-5 text-cyan-400" />;
  };

  const mcpTools = tools.filter((t) => t.tool_type === 'mcp_server');
  const displayedTools = activeTab === 'mcp' ? mcpTools : tools;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500/20 to-cyan-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  工具箱与 MCP 协议网关
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold tracking-wider font-mono">
                  Model Context Protocol
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                支持标准 SSE / JSON-RPC 2.0 互通，并提供自定义鉴权请求头与缺省默认参数补充机制
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher & Action */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('all');
                setFormMode('none');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'all' && formMode === 'none'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              全部工具生态 ({tools.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('mcp');
                setFormMode('none');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'mcp' && formMode === 'none'
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              MCP 协议服务专区 ({mcpTools.length})
            </button>
          </div>

          <button
            onClick={() => {
              resetForm();
              setToolType(activeTab === 'mcp' ? 'mcp_server' : 'custom_http');
              setFormMode('add');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            接入外部工具 / MCP
          </button>
        </div>

        {/* Notification Tip */}
        {successTip && (
          <div className="mx-6 mt-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successTip}</span>
          </div>
        )}

        {/* Modal Main Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {formMode === 'none' ? (
            <>
              {/* MCP Protocol Architecture Banner in MCP tab */}
              {activeTab === 'mcp' && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-indigo-950/20 to-slate-900 border border-purple-500/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Model Context Protocol (MCP 协议互联标准)
                    </h3>
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                      SSE & JSON-RPC 2.0
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    MCP 是跨平台智能体标准。本平台支持以 <strong>SSE (Server-Sent Events)</strong> 或 <strong>HTTP POST</strong> 连接外部 MCP Server。系统支持初始化握手、鉴权 Header 注入，并支持为工具配置<strong>保底缺省参数</strong>，解决部分外部工具缺少必要参数无法执行的问题。
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2 text-[11px] text-slate-400 border-t border-purple-500/20">
                    <span className="flex items-center gap-1 text-purple-300">
                      <ShieldCheck className="w-3.5 h-3.5" /> 双通道握手探测
                    </span>
                    <span>•</span>
                    <span>鉴权请求头 (Headers)</span>
                    <span>•</span>
                    <span className="text-amber-300 font-medium">缺省参数智能合并</span>
                  </div>
                </div>
              )}

              {/* MCP Presets in MCP tab */}
              {activeTab === 'mcp' && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>快速测试预设 (点击一键填入配置)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {MCP_PRESETS.map((preset, idx) => (
                      <div
                        key={idx}
                        onClick={() => applyPreset(preset)}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-purple-500/50 hover:bg-purple-950/10 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-white group-hover:text-purple-300 transition-colors">
                            {preset.name}
                          </span>
                          <span className="text-[10px] text-purple-400 group-hover:translate-x-0.5 transition-transform font-mono">
                            填入 &rarr;
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {preset.desc}
                        </p>
                        <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
                          {preset.url}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tool List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    已挂载 {displayedTools.length} 个
                    {activeTab === 'mcp' ? ' MCP 协议端点' : ' 工具能力'}
                  </span>
                </div>

                {displayedTools.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-slate-800 text-xs text-slate-500 space-y-2">
                    <div>暂无此分类的工具配置</div>
                    <button
                      onClick={() => {
                        resetForm();
                        setToolType('mcp_server');
                        setFormMode('add');
                      }}
                      className="text-purple-400 hover:underline cursor-pointer"
                    >
                      立即接入第一个 MCP 服务 &rarr;
                    </button>
                  </div>
                ) : (
                  displayedTools.map((tool) => {
                    const isMcp = tool.tool_type === 'mcp_server';
                    const cfg = tool.config || {};
                    const serverUrl = cfg.server_url || cfg.url || '';
                    const hasHeaders = cfg.headers && Object.keys(cfg.headers).length > 0;
                    const defaultParamCount = cfg.default_params
                      ? Object.keys(cfg.default_params).length
                      : 0;
                    const testResult = mcpTestResults[tool.id];

                    return (
                      <div
                        key={tool.id}
                        className={`p-4 rounded-2xl border transition-all space-y-3 ${
                          tool.is_enabled
                            ? isMcp
                              ? 'bg-purple-950/10 border-purple-900/40 shadow-sm'
                              : 'bg-slate-850/70 border-slate-750'
                            : 'bg-slate-900/40 border-slate-800/80 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center shrink-0 mt-0.5">
                              {getToolIcon(tool.tool_type)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-sm text-white">
                                  {tool.name}
                                </span>
                                {isMcp ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    MCP Protocol
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700">
                                    {tool.tool_type}
                                  </span>
                                )}
                                {cfg.protocol && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                                    {cfg.protocol}
                                  </span>
                                )}
                                {hasHeaders && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                    <Key className="w-2.5 h-2.5" /> 已配鉴权
                                  </span>
                                )}
                                {defaultParamCount > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                    <Layers className="w-2.5 h-2.5" /> 默认参数: {defaultParamCount}项
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                                {tool.description || '暂无工具描述'}
                              </p>
                              {serverUrl && (
                                <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-slate-500 truncate max-w-md">
                                  <span className="text-slate-400">端点:</span>
                                  <span className="text-slate-300 truncate">{serverUrl}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* MCP Test Connection */}
                            {isMcp && serverUrl && (
                              <button
                                onClick={() => handleTestMcp(tool)}
                                disabled={testingId === tool.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                                title="向该 MCP Server 发送探测请求测试连通性"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 ${
                                    testingId === tool.id ? 'animate-spin' : ''
                                  }`}
                                />
                                {testingId === tool.id ? '探测中...' : '测试连接'}
                              </button>
                            )}

                            {/* Edit Tool Configuration */}
                            {tool.tool_type !== 'web_search' &&
                              tool.tool_type !== 'code_interpreter' && (
                                <button
                                  onClick={() => handleEditTool(tool)}
                                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="修改端点、请求头与默认参数"
                                >
                                  <Settings2 className="w-4 h-4" />
                                </button>
                              )}

                            {/* Toggle Enable */}
                            <button
                              onClick={() => handleToggleEnable(tool)}
                              className={`text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                                tool.is_enabled
                                  ? 'text-emerald-400 hover:text-emerald-300'
                                  : 'text-slate-500 hover:text-slate-400'
                              }`}
                              title={tool.is_enabled ? '点击禁用' : '点击启用'}
                            >
                              {tool.is_enabled ? (
                                <ToggleRight className="w-6 h-6" />
                              ) : (
                                <ToggleLeft className="w-6 h-6" />
                              )}
                            </button>

                            {/* Delete custom tool */}
                            {tool.tool_type !== 'web_search' &&
                              tool.tool_type !== 'code_interpreter' && (
                                <button
                                  onClick={() => handleDelete(tool.id, tool.name)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="删除工具"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                          </div>
                        </div>

                        {/* MCP Test Result Banner */}
                        {testResult && (
                          <div
                            className={`p-3 rounded-xl border text-xs space-y-2 ${
                              testResult.success
                                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                                : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                            }`}
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span className="flex items-center gap-1.5">
                                {testResult.success ? (
                                  <Check className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <AlertCircle className="w-4 h-4 text-rose-400" />
                                )}
                                {testResult.message}
                              </span>
                              <button
                                onClick={() =>
                                  setMcpTestResults((prev) => {
                                    const next = { ...prev };
                                    delete next[tool.id];
                                    return next;
                                  })
                                }
                                className="text-slate-500 hover:text-white cursor-pointer"
                              >
                                &times;
                              </button>
                            </div>
                            {testResult.tools && testResult.tools.length > 0 && (
                              <div className="pt-2 border-t border-emerald-500/20 space-y-1.5">
                                <div className="text-[11px] text-emerald-400 font-medium">
                                  成功自动发现的工具列表 ({testResult.tools.length}):
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {testResult.tools.map((t: any, tidx: number) => (
                                    <div
                                      key={tidx}
                                      className="p-2 rounded-lg bg-slate-900/80 border border-emerald-500/20 text-[11px] space-y-1"
                                    >
                                      <div className="font-mono text-emerald-300 font-semibold">
                                        {t.name}
                                      </div>
                                      <div className="text-slate-400 line-clamp-2">
                                        {t.description || '无描述'}
                                      </div>
                                      {t.inputSchema?.properties && (
                                        <div className="text-[10px] text-slate-500 font-mono">
                                          参数: {Object.keys(t.inputSchema.properties).join(', ')}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Add / Edit Tool / MCP Server Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  {editingToolId ? '修改工具与 MCP 参数配置' : '接入外部能力 (HTTP 或 MCP 协议)'}
                </h3>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
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

              {/* Tool Type Selector (Disabled in Edit Mode) */}
              {!editingToolId && (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div
                    onClick={() => setToolType('mcp_server')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      toolType === 'mcp_server'
                        ? 'bg-purple-500/15 border-purple-500/50 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-purple-400" />
                      Model Context Protocol (MCP)
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Anthropic MCP 标准协议 (支持 SSE / JSON-RPC 2.0)
                    </div>
                  </div>

                  <div
                    onClick={() => setToolType('custom_http')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      toolType === 'custom_http'
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                      自定义 HTTP Webhook
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      普通 RESTful POST / GET 接口调用
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  服务/工具名称 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    toolType === 'mcp_server'
                      ? '如：演示 MCP 服务 / GitHub MCP / SQLite 查询'
                      : '如：实时汇率查询 API'
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    {toolType === 'mcp_server' ? 'MCP Server 端点 URL' : 'REST 接口 URL'}{' '}
                    <span className="text-rose-400">*</span>
                  </label>
                  {toolType === 'mcp_server' && (
                    <button
                      type="button"
                      onClick={handleTestFormUrl}
                      disabled={isTestingFormUrl || !endpointUrl.trim()}
                      className="text-[11px] text-purple-400 hover:text-purple-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isTestingFormUrl ? 'animate-spin' : ''}`}
                      />
                      {isTestingFormUrl ? '探测中...' : '测试探测端点'}
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder={
                    toolType === 'mcp_server'
                      ? 'http://127.0.0.1:8000/api/v1/tools/mcp-mock'
                      : 'https://api.example.com/v1/tools/exchange-rate'
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              {/* Form Inline Test Result */}
              {formTestResult && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    formTestResult.success
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    {formTestResult.success ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    {formTestResult.message}
                  </div>
                  {formTestResult.tools && formTestResult.tools.length > 0 && (
                    <div className="text-[11px] text-slate-300 border-t border-emerald-500/20 pt-1">
                      探测到工具: {formTestResult.tools.map((t) => t.name).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Advanced Parameters Toggle: Headers & Default Arguments */}
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1.5 font-medium cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>
                    {showAdvanced ? '收起' : '展开'} 高级配置（协议通道、鉴权 Header 与缺省默认参数）
                  </span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3.5 animate-fade-in">
                    {/* Protocol selector */}
                    {toolType === 'mcp_server' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          通信协议类型 (Transport)
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'auto', label: '自动探测 (Auto)' },
                            { id: 'sse', label: 'SSE (Server-Sent Events)' },
                            { id: 'http', label: 'HTTP JSON-RPC (POST)' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setProtocol(p.id as any)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                                protocol === p.id
                                  ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Custom Headers */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                          <Key className="w-3.5 h-3.5 text-indigo-400" />
                          自定义请求头 (Headers & 鉴权)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setHeadersStr(
                              '{\n  "Authorization": "Bearer your_token_here"\n}'
                            )
                          }
                          className="text-[10px] text-indigo-400 hover:underline cursor-pointer"
                        >
                          填入 Bearer 示例
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={headersStr}
                        onChange={(e) => setHeadersStr(e.target.value)}
                        placeholder='{\n  "Authorization": "Bearer <TOKEN>",\n  "X-Api-Key": "<KEY>"\n}'
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>

                    {/* Default Parameters / Missing Parameters Solution */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          默认缺省参数补充 (Default Parameters)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setDefaultParamsStr(
                              '{\n  "category": "默认品类",\n  "city": "北京"\n}'
                            )
                          }
                          className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                        >
                          填入参数示例
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed mb-1.5">
                        💡 <strong>解决 MCP 缺少参数问题</strong>：当外部工具需要特定必填入参（例如固定 database、category、env 等），在此配置 JSON 字典。Agent 调用时若未指定该参数，将自动注入此处设定的默认值。
                      </p>
                      <textarea
                        rows={3}
                        value={defaultParamsStr}
                        onChange={(e) => setDefaultParamsStr(e.target.value)}
                        placeholder='{\n  "category": "办公物资",\n  "city": "北京",\n  "read_only": true\n}'
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  工具功能描述
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="描述该工具的用途及大模型应该在什么场景下调用它..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold disabled:opacity-50 shadow-md shadow-purple-600/20 cursor-pointer"
                >
                  {loading ? '保存中...' : editingToolId ? '保存配置' : '确认接入'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
