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

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  token_count: number;
  created_at: string;
  citations?: Citation[];
  pending_approval?: PendingApproval;
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
