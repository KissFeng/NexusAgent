import type { User, Workspace, ModelConfig, Conversation, Message } from '../types';

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
};

// SSE Chat Streaming Client
export async function streamChat({
  conversationId,
  content,
  modelConfigId,
  onStart,
  onChunk,
  onDone,
  onError,
  signal,
}: {
  conversationId?: string;
  content: string;
  modelConfigId?: string;
  onStart?: (info: { conversation_id: string; title: string }) => void;
  onChunk: (chunk: string) => void;
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

        if (payloadStr === '[DONE]') {
          continue;
        }

        try {
          const payload = JSON.parse(payloadStr);
          if (payload.type === 'start' && onStart) {
            onStart({ conversation_id: payload.conversation_id, title: payload.title });
          } else if (payload.type === 'chunk') {
            onChunk(payload.content);
          } else if (payload.type === 'error') {
            onError(payload.error);
          } else if (payload.type === 'done') {
            onDone(payload.conversation_id);
          }
        } catch {
          // Ignore JSON parse errors for non-json frames
        }
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) {
      return;
    }
    const message = err instanceof Error ? err.message : '未知流式异常';
    onError(message);
  }
}
