export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: 'personal' | 'enterprise';
  owner_id: string;
  role?: string;
  created_at: string;
}

export interface ModelConfig {
  id: string;
  workspace_id: string;
  name: string;
  provider: 'openai' | 'deepseek' | 'qwen' | 'anthropic' | 'ollama' | 'custom';
  model_name: string;
  base_url?: string;
  has_api_key: boolean;
  is_default: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  user_id: string;
  model_config_id?: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message?: string;
}

export interface Citation {
  source_index: number;
  point_id: string;
  document_id?: string;
  knowledge_base_id?: string;
  filename: string;
  chunk_index: number;
  content: string;
  score: number;
  dense_score?: number;
  sparse_score?: number;
  match_type?: string;
}

export interface PendingApproval {
  action_type: string;
  target: string;
  reason: string;
  tool_call_id: string;
}

export interface ToolCallEvent {
  tool_id: string;
  tool_name: string;
  args?: Record<string, any>;
  status: 'running' | 'completed' | 'error';
  content?: string;
  timestamp?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  token_count: number;
  created_at: string;
  citations?: Citation[];
  pending_approval?: PendingApproval;
  thinking?: string;
  tool_calls?: ToolCallEvent[];
  model_name?: string;
}

export interface KnowledgeBase {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  document_count: number;
  created_at: string;
}

export interface Document {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  qdrant_point_id: string;
  created_at: string;
}

export interface Skill {
  id: string;
  workspace_id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  system_prompt: string;
  bound_tools: string[];
  is_enabled: boolean;
  is_preset: boolean;
  created_at: string;
}

export interface ToolConfig {
  id: string;
  workspace_id: string;
  tool_type: string;
  name: string;
  description: string;
  config: Record<string, any>;
  is_enabled: boolean;
  created_at: string;
}

export interface Memory {
  id: string;
  workspace_id: string;
  user_id: string;
  category: 'preference' | 'fact' | 'episodic';
  content: string;
  confidence: number;
  source_conversation_id?: string;
  recall_count: number;
  last_recalled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledTask {
  id: string;
  workspace_id: string;
  creator_id?: string;
  name: string;
  cron_expression: string;
  prompt: string;
  model_config_id?: string;
  skill_code?: string;
  channel_type: 'internal' | 'feishu' | 'wecom';
  target_id?: string;
  is_enabled: boolean;
  last_run_at?: string;
  last_status?: 'success' | 'failed' | 'running';
  last_error?: string;
  created_at: string;
}

export interface WebhookConfig {
  id: string;
  workspace_id: string;
  name: string;
  channel_type: 'feishu' | 'wecom';
  app_id?: string;
  has_app_secret?: boolean;
  verification_token?: string;
  has_encrypt_key?: boolean;
  webhook_url?: string;
  is_active: boolean;
  callback_url: string;
  created_at?: string;
}

export interface UsageSummary {
  quota_monthly: number;
  quota_used_tokens: number;
  quota_percentage: number;
  today: {
    tokens: number;
    cost: number;
    calls: number;
  };
  this_month: {
    tokens: number;
    cost: number;
    calls: number;
  };
  model_distribution: Array<{
    model_name: string;
    tokens: number;
    cost: number;
    calls: number;
  }>;
  daily_trends: Array<{
    date: string;
    tokens: number;
    cost: number;
    calls: number;
  }>;
}

export interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_id?: string;
  ip_address?: string;
  status: string;
  details?: string;
  created_at?: string;
}

