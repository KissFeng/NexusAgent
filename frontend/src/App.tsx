import { useState, useEffect, useRef } from 'react';
import {
  api,
  getAuthToken,
  removeAuthToken,
  setStoredWorkspaceId,
  getStoredWorkspaceId,
  streamChat,
  streamResumeApproval,
} from './api/client';
import type { User, Workspace, ModelConfig, Conversation, Message, Citation, PendingApproval } from './types';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ModelConfigModal } from './components/ModelConfigModal';
import { KnowledgeBaseModal } from './components/KnowledgeBaseModal';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Streaming & RAG Citations & LangGraph Interrupts
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Modals
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isKbModalOpen, setIsKbModalOpen] = useState(false);

  // 1. Initial auth check
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      api.getMe()
        .then((u) => setUser(u))
        .catch(() => {
          removeAuthToken();
          setUser(null);
        });
    }
  }, []);

  // 2. Fetch workspaces when user logs in
  useEffect(() => {
    if (!user) return;
    loadWorkspaces();
  }, [user]);

  const loadWorkspaces = async () => {
    try {
      const wsList = await api.listWorkspaces();
      setWorkspaces(wsList);
      if (wsList.length > 0) {
        const storedId = getStoredWorkspaceId();
        const matched = wsList.find((w) => w.id === storedId);
        const target = matched || wsList[0];
        setCurrentWorkspace(target);
        setStoredWorkspaceId(target.id);
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    }
  };

  // 3. Fetch workspace resources
  useEffect(() => {
    if (!currentWorkspace) return;
    loadWorkspaceResources();
  }, [currentWorkspace]);

  const loadWorkspaceResources = async () => {
    try {
      const [modelList, convList] = await Promise.all([
        api.listModels(),
        api.listConversations(),
      ]);
      setModels(modelList);
      setConversations(convList);

      const defaultModel = modelList.find((m) => m.is_default) || modelList[0];
      if (defaultModel) {
        setSelectedModelId(defaultModel.id);
      }

      if (convList.length > 0) {
        setActiveConversationId(convList[0].id);
      } else {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load workspace resources:', err);
    }
  };

  // 4. Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setPendingApproval(null);
      setStreamingCitations([]);
      return;
    }
    api.getMessages(activeConversationId)
      .then((msgs) => setMessages(msgs))
      .catch((err) => console.error('Failed to load messages:', err));
  }, [activeConversationId]);

  // Handlers
  const handleSelectWorkspace = (ws: Workspace) => {
    setCurrentWorkspace(ws);
    setStoredWorkspaceId(ws.id);
  };

  const handleCreateWorkspace = async (name: string) => {
    try {
      const newWs = await api.createWorkspace({ name, type: 'enterprise' });
      await loadWorkspaces();
      handleSelectWorkspace(newWs);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '创建工作空间失败');
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setStreamingContent('');
    setStreamingCitations([]);
    setPendingApproval(null);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeConversationId === id) {
        if (remaining.length > 0) {
          setActiveConversationId(remaining[0].id);
        } else {
          handleNewConversation();
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSendMessage = async (content: string) => {
    if (isStreaming) return;

    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversationId || '',
      role: 'user',
      content,
      token_count: 0,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    setIsStreaming(true);
    setStreamingContent('');
    setStreamingCitations([]);
    setPendingApproval(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedContent = '';

    await streamChat({
      conversationId: activeConversationId || undefined,
      content,
      modelConfigId: selectedModelId || undefined,
      signal: controller.signal,
      onStart: ({ conversation_id, title }) => {
        setActiveConversationId(conversation_id);
        setConversations((prev) => {
          if (!prev.some((c) => c.id === conversation_id)) {
            return [
              {
                id: conversation_id,
                workspace_id: currentWorkspace?.id || '',
                user_id: user?.id || '',
                title,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              ...prev,
            ];
          }
          return prev;
        });
      },
      onChunk: (chunk) => {
        accumulatedContent += chunk;
        setStreamingContent(accumulatedContent);
      },
      onCitation: (citation) => {
        setStreamingCitations((prev) => {
          if (!prev.some((c) => c.point_id === citation.point_id)) {
            return [...prev, citation];
          }
          return prev;
        });
      },
      onApprovalRequired: (approval) => {
        setPendingApproval(approval);
      },
      onError: (err) => {
        console.error('Chat error:', err);
      },
      onDone: async (finalConvId) => {
        setIsStreaming(false);
        setStreamingContent('');
        if (finalConvId) {
          const updatedMsgs = await api.getMessages(finalConvId);
          // 关联当前检索到的溯源证据至最新的 Assistant 消息
          setStreamingCitations((latestCitations) => {
            if (latestCitations.length > 0 && updatedMsgs.length > 0) {
              const lastAssistant = [...updatedMsgs].reverse().find((m) => m.role === 'assistant');
              if (lastAssistant) {
                lastAssistant.citations = [...latestCitations];
              }
            }
            return latestCitations;
          });
          setMessages(updatedMsgs);
        }
        const updatedConvs = await api.listConversations();
        setConversations(updatedConvs);
      },
    });

    setIsStreaming(false);
  };

  const handleApproveAction = async (approved: boolean) => {
    if (!activeConversationId) return;

    setPendingApproval(null);
    setIsStreaming(true);
    setStreamingContent('');

    let accumulated = '';

    await streamResumeApproval({
      conversationId: activeConversationId,
      approved,
      modelConfigId: selectedModelId || undefined,
      onChunk: (chunk) => {
        accumulated += chunk;
        setStreamingContent(accumulated);
      },
      onDone: async (finalConvId) => {
        setIsStreaming(false);
        setStreamingContent('');
        if (finalConvId) {
          const updatedMsgs = await api.getMessages(finalConvId);
          setMessages(updatedMsgs);
        }
      },
      onError: (err) => {
        alert(err);
        setIsStreaming(false);
      },
    });
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleLogout = () => {
    removeAuthToken();
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
  };

  if (!user) {
    return <AuthModal onSuccess={(u) => setUser(u)} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans antialiased text-slate-100">
      <Sidebar
        user={user}
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => setActiveConversationId(id)}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onLogout={handleLogout}
      />

      <ChatArea
        currentConversation={conversations.find((c) => c.id === activeConversationId) || null}
        messages={messages}
        streamingContent={streamingContent}
        streamingCitations={streamingCitations}
        pendingApproval={pendingApproval}
        isStreaming={isStreaming}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={(id) => setSelectedModelId(id)}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        onOpenModelConfig={() => setIsModelModalOpen(true)}
        onOpenKnowledgeBase={() => setIsKbModalOpen(true)}
        onApproveAction={handleApproveAction}
      />

      <ModelConfigModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        models={models}
        onRefresh={() => {
          api.listModels().then(setModels);
        }}
      />

      <KnowledgeBaseModal
        isOpen={isKbModalOpen}
        onClose={() => setIsKbModalOpen(false)}
      />
    </div>
  );
}
