import type {
  User,
  Workspace,
  ModelConfig,
  Conversation,
  Message,
  KnowledgeBase,
  Document,
  Citation,
  PendingApproval,
} from '../types';

const BASE_URL = '/api/v1';

export const getAuthToken = () => localStorage.getItem('token');
export const setAuthToken = (token: string) => localStorage.setItem('token', token);
export const removeAuthToken = () => localStorage.removeItem('token');

export const getStoredWorkspaceId = () => localStorage.getItem('workspace_id');
export const setStoredWorkspaceId = (id: string) => localStorage.setItem('workspace_id', id);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const workspaceId = getStoredWorkspaceId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (workspaceId) {
    headers['X-Workspace-Id'] = workspaceId;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || '请求失败');
  }

  return res.json();
}

export const api = {
  // Auth
  register: (data: { email: string; username: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMe: () => request<User>('/auth/me'),

  // Workspaces
  listWorkspaces: () => request<Workspace[]>('/workspaces'),
  createWorkspace: (data: { name: string; type: 'personal' | 'enterprise' }) =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Model Configs
  listModels: () => request<ModelConfig[]>('/models'),
  createModel: (data: Partial<ModelConfig> & { api_key?: string }) =>
    request<ModelConfig>('/models', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateModel: (id: string, data: Partial<ModelConfig> & { api_key?: string }) =>
    request<ModelConfig>(`/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  setDefaultModel: (id: string) =>
    request<ModelConfig>(`/models/${id}/set-default`, {
      method: 'POST',
    }),
  deleteModel: (id: string) =>
    request<{ message: string }>(`/models/${id}`, {
      method: 'DELETE',
    }),

  // Conversations
  listConversations: () => request<Conversation[]>('/conversations'),
  createConversation: (title?: string, modelConfigId?: string) =>
    request<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: title || '新对话', model_config_id: modelConfigId }),
    }),
  getMessages: (conversationId: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`),
  deleteConversation: (conversationId: string) =>
    request<{ message: string }>(`/conversations/${conversationId}`, {
      method: 'DELETE',
    }),

  // Knowledge Bases
  listKnowledgeBases: () => request<KnowledgeBase[]>('/knowledge-bases'),
  createKnowledgeBase: (data: { name: string; description?: string }) =>
    request<KnowledgeBase>('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteKnowledgeBase: (id: string) =>
    request<{ message: string }>(`/knowledge-bases/${id}`, {
      method: 'DELETE',
    }),
  listDocuments: (kbId: string) =>
    request<Document[]>(`/knowledge-bases/${kbId}/documents`),
  uploadDocument: async (kbId: string, file: File): Promise<Document> => {
    const token = getAuthToken();
    const workspaceId = getStoredWorkspaceId();
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

    const res = await fetch(`${BASE_URL}/knowledge-bases/${kbId}/documents`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '上传失败' }));
      throw new Error(err.detail || '上传失败');
    }
    return res.json();
  },
  deleteDocument: (kbId: string, docId: string) =>
    request<{ message: string }>(`/knowledge-bases/${kbId}/documents/${docId}`, {
      method: 'DELETE',
    }),
  searchKnowledge: (data: { query: string; kb_ids?: string[]; top_k?: number }) =>
    request<Citation[]>('/knowledge-bases/search', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// SSE Chat Streaming Client (Supports LangGraph Interrupts & Citations)
export async function streamChat({
  conversationId,
  content,
  modelConfigId,
  onStart,
  onChunk,
  onCitation,
  onApprovalRequired,
  onDone,
  onError,
  signal,
}: {
  conversationId?: string;
  content: string;
  modelConfigId?: string;
  onStart?: (info: { conversation_id: string; title: string }) => void;
  onChunk: (chunk: string) => void;
  onCitation?: (citation: Citation) => void;
  onApprovalRequired?: (approval: PendingApproval) => void;
  onDone: (conversationId: string) => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}) {
  const token = getAuthToken();
  const workspaceId = getStoredWorkspaceId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

  try {
    const res = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversation_id: conversationId || null,
        content,
        model_config_id: modelConfigId || null,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || '流式连接建立失败');
    }

    await parseEventStream(res, { onStart, onChunk, onCitation, onApprovalRequired, onDone, onError });
  } catch (err: unknown) {
    if (signal?.aborted) return;
    const message = err instanceof Error ? err.message : '未知流式异常';
    onError(message);
  }
}

// Resume Interrupted Graph Execution
export async function streamResumeApproval({
  conversationId,
  approved,
  reason,
  modelConfigId,
  onStart,
  onChunk,
  onDone,
  onError,
}: {
  conversationId: string;
  approved: boolean;
  reason?: string;
  modelConfigId?: string;
  onStart?: (info: { conversation_id: string; title: string }) => void;
  onChunk: (chunk: string) => void;
  onDone: (conversationId: string) => void;
  onError: (err: string) => void;
}) {
  const token = getAuthToken();
  const workspaceId = getStoredWorkspaceId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

  try {
    const res = await fetch(`${BASE_URL}/chat/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversation_id: conversationId,
        approved,
        reason,
        model_config_id: modelConfigId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || '恢复执行失败');
    }

    await parseEventStream(res, { onStart, onChunk, onDone, onError });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '恢复执行异常';
    onError(message);
  }
}

async function parseEventStream(
  res: Response,
  callbacks: {
    onStart?: (info: { conversation_id: string; title: string }) => void;
    onChunk: (chunk: string) => void;
    onCitation?: (citation: Citation) => void;
    onApprovalRequired?: (approval: PendingApproval) => void;
    onDone: (conversationId: string) => void;
    onError: (err: string) => void;
  }
) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payloadStr = trimmed.replace('data: ', '').trim();

      if (payloadStr === '[DONE]') continue;

      try {
        const payload = JSON.parse(payloadStr);
        if (payload.type === 'start' && callbacks.onStart) {
          callbacks.onStart({ conversation_id: payload.conversation_id, title: payload.title });
        } else if (payload.type === 'chunk') {
          callbacks.onChunk(payload.content);
        } else if (payload.type === 'citation' && callbacks.onCitation) {
          callbacks.onCitation(payload.citation);
        } else if (payload.type === 'approval_required' && callbacks.onApprovalRequired) {
          callbacks.onApprovalRequired(payload.approval);
        } else if (payload.type === 'error') {
          callbacks.onError(payload.error);
        } else if (payload.type === 'done') {
          callbacks.onDone(payload.conversation_id);
        }
      } catch {
        // Ignore malformed chunks
      }
    }
  }
}
