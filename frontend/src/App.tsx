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
import type {
  User,
  Workspace,
  ModelConfig,
  Conversation,
  Message,
  Citation,
  PendingApproval,
  Skill,
  ToolConfig,
  Memory,
  ToolCallEvent,
  KnowledgeBase,
} from './types';
import { AuthModal } from './components/AuthModal';
import { LeftRail, type MainNavTab } from './components/layout/LeftRail';
import { SubSidebar, type SettingsSubTab, type PlazaCategory } from './components/layout/SubSidebar';
import { ChatArea } from './components/ChatArea';
import { PlazaView } from './components/plaza/PlazaView';
import { KnowledgeBaseView } from './components/knowledge/KnowledgeBaseView';
import { MemoryView } from './components/memory/MemoryView';
import { SettingsView } from './components/settings/SettingsView';

interface StreamingSession {
  conversationId: string;
  isStreaming: boolean;
  content: string;
  thinking: string;
  toolCalls: ToolCallEvent[];
  citations: Citation[];
  pendingApproval: PendingApproval | null;
  controller: AbortController;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  // 主导航与子侧边栏模式 (Cherry Studio 经典架构)
  const [activeMainTab, setActiveMainTab] = useState<MainNavTab>('chat');
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsSubTab>('model');
  const [plazaCategory, setPlazaCategory] = useState<PlazaCategory>('all');
  const [plazaTagFilter, setPlazaTagFilter] = useState<string | null>(null);

  // 知识库状态
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);

  // 会话隔离：按 conversationId 维护消息缓存与流式 Session
  const [messagesByConv, setMessagesByConv] = useState<Record<string, Message[]>>({});
  const [streamingSessions, setStreamingSessions] = useState<Record<string, StreamingSession>>({});

  // Skills, MCP Tools & Memories
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);

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
      const [modelList, convList, skillList, toolList, memList, kbList] = await Promise.all([
        api.listModels(),
        api.listConversations(),
        api.listSkills().catch(() => [] as Skill[]),
        api.listTools().catch(() => [] as ToolConfig[]),
        api.listMemories().catch(() => [] as Memory[]),
        api.listKnowledgeBases().catch(() => [] as KnowledgeBase[]),
      ]);
      setModels(modelList);
      setConversations(convList);
      setSkills(skillList);
      setTools(toolList);
      setMemories(memList);
      setKnowledgeBases(kbList);

      if (kbList.length > 0 && !selectedKbId) {
        setSelectedKbId(kbList[0].id);
      }

      const defaultModel = modelList.find((m) => m.is_default) || modelList[0];
      if (defaultModel) {
        setSelectedModelId(defaultModel.id);
      }

      if (convList.length > 0) {
        setActiveConversationId(convList[0].id);
      } else {
        setActiveConversationId(null);
        setMessagesByConv({});
      }
    } catch (err) {
      console.error('Failed to load workspace resources:', err);
    }
  };

  // 4. Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId || activeConversationId.startsWith('draft-')) {
      return;
    }
    let isCancelled = false;
    api.getMessages(activeConversationId)
      .then((msgs) => {
        if (!isCancelled) {
          setMessagesByConv((prev) => {
            const currentList = prev[activeConversationId] || [];
            const tempMsgs = currentList.filter((m) => m.id.startsWith('temp-'));
            if (
              tempMsgs.length > 0 &&
              !msgs.some((m) => tempMsgs.some((t) => t.content === m.content && t.role === m.role))
            ) {
              return {
                ...prev,
                [activeConversationId]: [...msgs, ...tempMsgs],
              };
            }
            return {
              ...prev,
              [activeConversationId]: msgs,
            };
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load messages for conversation:', activeConversationId, err);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeConversationId]);

  const handleSelectWorkspace = (ws: Workspace) => {
    Object.values(streamingSessions).forEach((s) => s.controller?.abort());
    setStreamingSessions({});
    setMessagesByConv({});
    setCurrentWorkspace(ws);
    setStoredWorkspaceId(ws.id);
  };

  const handleCreateWorkspace = async (name: string) => {
    try {
      const created = await api.createWorkspace({ name, type: 'enterprise' });
      await loadWorkspaces();
      handleSelectWorkspace(created);
    } catch (err) {
      alert('创建工作空间失败');
    }
  };

  const handleNewConversation = () => {
    const draftId = `draft-${Date.now()}`;
    const newDraft: Conversation = {
      id: draftId,
      workspace_id: currentWorkspace?.id || '',
      user_id: user?.id || '',
      model_config_id: selectedModelId || undefined,
      title: '新对话',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setConversations((prev) => [newDraft, ...prev]);
    setActiveConversationId(draftId);
    setMessagesByConv((prev) => ({
      ...prev,
      [draftId]: [],
    }));
    setActiveMainTab('chat');
  };

  const handleDeleteConversation = async (id: string) => {
    if (streamingSessions[id]?.controller) {
      streamingSessions[id].controller.abort();
      setStreamingSessions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    if (id.startsWith('draft-')) {
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      setMessagesByConv((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeConversationId === id) {
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
      return;
    }

    if (!confirm('确定删除该会话记录吗？')) return;
    try {
      await api.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      setMessagesByConv((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeConversationId === id) {
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      alert('删除失败');
    }
  };

  // 5. Send message
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !activeConversationId) return;

    const convId = activeConversationId;
    let actualConvId = convId;

    if (convId.startsWith('draft-')) {
      try {
        const created = await api.createConversation(
          content.slice(0, 30),
          selectedModelId || undefined
        );
        actualConvId = created.id;
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? created : c))
        );
        setActiveConversationId(actualConvId);
        setMessagesByConv((prev) => {
          const draftMsgs = prev[convId] || [];
          const next = { ...prev };
          delete next[convId];
          next[actualConvId] = draftMsgs;
          return next;
        });
      } catch (err) {
        alert('创建持久化会话失败');
        return;
      }
    }

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: actualConvId,
      role: 'user',
      content,
      token_count: 0,
      created_at: new Date().toISOString(),
    };

    setMessagesByConv((prev) => ({
      ...prev,
      [actualConvId]: [...(prev[actualConvId] || []), tempUserMsg],
    }));

    const abortController = new AbortController();
    setStreamingSessions((prev) => ({
      ...prev,
      [actualConvId]: {
        conversationId: actualConvId,
        isStreaming: true,
        content: '',
        thinking: '',
        toolCalls: [],
        citations: [],
        pendingApproval: null,
        controller: abortController,
      },
    }));

    streamChat({
      conversationId: actualConvId,
      content,
      modelConfigId: selectedModelId || undefined,
      signal: abortController.signal,
      onThinkingChunk: (chunk: string) => {
        setStreamingSessions((prev) => {
          const session = prev[actualConvId];
          if (!session) return prev;
          return {
            ...prev,
            [actualConvId]: {
              ...session,
              thinking: session.thinking + chunk,
            },
          };
        });
      },
      onChunk: (chunk: string) => {
        setStreamingSessions((prev) => {
          const session = prev[actualConvId];
          if (!session) return prev;
          return {
            ...prev,
            [actualConvId]: {
              ...session,
              content: session.content + chunk,
            },
          };
        });
      },
      onToolCall: (event) => {
        setStreamingSessions((prev) => {
          const session = prev[actualConvId];
          if (!session) return prev;
          const existing = session.toolCalls.find((t) => t.tool_id === event.tool_id);
          let nextToolCalls = session.toolCalls;
          if (existing) {
            nextToolCalls = session.toolCalls.map((t) =>
              t.tool_id === event.tool_id ? { ...t, ...event } : t
            );
          } else {
            nextToolCalls = [...session.toolCalls, event];
          }
          return {
            ...prev,
            [actualConvId]: {
              ...session,
              toolCalls: nextToolCalls,
            },
          };
        });
      },
      onCitation: (newCitation: Citation) => {
        setStreamingSessions((prev) => {
          const session = prev[actualConvId];
          if (!session) return prev;
          return {
            ...prev,
            [actualConvId]: {
              ...session,
              citations: [...session.citations, newCitation],
            },
          };
        });
      },
      onApprovalRequired: (approval: PendingApproval) => {
        setStreamingSessions((prev) => {
          const session = prev[actualConvId];
          if (!session) return prev;
          return {
            ...prev,
            [actualConvId]: {
              ...session,
              pendingApproval: approval,
            },
          };
        });
      },
      onDone: async () => {
        try {
          const updatedMsgs = await api.getMessages(actualConvId);
          setMessagesByConv((prev) => ({
            ...prev,
            [actualConvId]: updatedMsgs,
          }));
        } catch (e) {
          console.error('Failed to reload messages onDone:', e);
        }

        setStreamingSessions((prev) => {
          const next = { ...prev };
          delete next[actualConvId];
          return next;
        });

        // 重新拉取会话列表以刷新最后消息
        api.listConversations().then(setConversations).catch(console.error);
        api.listMemories().then(setMemories).catch(console.error);
      },
      onError: (err) => {
        alert(err);
        setStreamingSessions((prev) => {
          const next = { ...prev };
          delete next[actualConvId];
          return next;
        });
      },
    });
  };

  // 6. Approve action
  const handleApproveAction = (approved: boolean) => {
    if (!activeConversationId) return;
    const convId = activeConversationId;
    const session = streamingSessions[convId];
    if (!session || !session.pendingApproval) return;

    const abortController = new AbortController();

    setStreamingSessions((prev) => ({
      ...prev,
      [convId]: {
        ...session,
        isStreaming: true,
        pendingApproval: null,
        controller: abortController,
      },
    }));

    streamResumeApproval({
      conversationId: convId,
      approved,
      onThinkingChunk: (chunk: string) => {
        setStreamingSessions((prev) => {
          const s = prev[convId];
          if (!s) return prev;
          return { ...prev, [convId]: { ...s, thinking: s.thinking + chunk } };
        });
      },
      onChunk: (chunk: string) => {
        setStreamingSessions((prev) => {
          const s = prev[convId];
          if (!s) return prev;
          return { ...prev, [convId]: { ...s, content: s.content + chunk } };
        });
      },
      onToolCall: (event) => {
        setStreamingSessions((prev) => {
          const s = prev[convId];
          if (!s) return prev;
          const existing = s.toolCalls.find((t) => t.tool_id === event.tool_id);
          let nextToolCalls = s.toolCalls;
          if (existing) {
            nextToolCalls = s.toolCalls.map((t) =>
              t.tool_id === event.tool_id ? { ...t, ...event } : t
            );
          } else {
            nextToolCalls = [...s.toolCalls, event];
          }
          return { ...prev, [convId]: { ...s, toolCalls: nextToolCalls } };
        });
      },
      onDone: async () => {
        try {
          const updatedMsgs = await api.getMessages(convId);
          setMessagesByConv((prev) => ({
            ...prev,
            [convId]: updatedMsgs,
          }));
        } catch (e) {
          console.error('Failed to reload messages on approval done:', e);
        }

        setStreamingSessions((prev) => {
          const next = { ...prev };
          delete next[convId];
          return next;
        });
      },
      onError: (err) => {
        alert(err);
        setStreamingSessions((prev) => {
          const next = { ...prev };
          delete next[convId];
          return next;
        });
      },
    });
  };

  const handleStopStreaming = () => {
    if (!activeConversationId) return;
    const session = streamingSessions[activeConversationId];
    if (session?.controller) {
      session.controller.abort();
    }
    setStreamingSessions((prev) => {
      const next = { ...prev };
      delete next[activeConversationId];
      return next;
    });
  };

  const handleLogout = () => {
    Object.values(streamingSessions).forEach((s) => s.controller?.abort());
    setStreamingSessions({});
    setMessagesByConv({});
    removeAuthToken();
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
  };

  if (!user) {
    return <AuthModal onSuccess={(u) => setUser(u)} />;
  }

  const currentMessages = activeConversationId ? (messagesByConv[activeConversationId] || []) : [];
  const currentSession = activeConversationId ? streamingSessions[activeConversationId] : null;
  const currentIsStreaming = !!currentSession?.isStreaming;
  const currentStreamingContent = currentSession?.content || '';
  const currentStreamingCitations = currentSession?.citations || [];
  const currentPendingApproval = currentSession?.pendingApproval || null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans antialiased text-slate-100 select-none">
      {/* 1. 最左侧主导航 Rail (宽 60px) */}
      <LeftRail
        user={user}
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        activeTab={activeMainTab}
        onSelectTab={(tab) => setActiveMainTab(tab)}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onLogout={handleLogout}
        streamingCount={
          Object.keys(streamingSessions).filter((id) => streamingSessions[id]?.isStreaming).length
        }
      />

      {/* 2. 二级侧边栏 Pane (宽 250px) */}
      <SubSidebar
        activeMainTab={activeMainTab}
        currentWorkspace={currentWorkspace}
        // Chat 相关
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          setActiveMainTab('chat');
        }}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        streamingConversationIds={Object.keys(streamingSessions).filter(
          (id) => streamingSessions[id]?.isStreaming
        )}
        // Plaza 相关
        plazaCategory={plazaCategory}
        onSelectPlazaCategory={setPlazaCategory}
        plazaTagFilter={plazaTagFilter}
        onSelectPlazaTagFilter={setPlazaTagFilter}
        // Knowledge 相关
        knowledgeBases={knowledgeBases}
        selectedKbId={selectedKbId}
        onSelectKb={(id) => {
          setSelectedKbId(id);
          setActiveMainTab('knowledge');
        }}
        onCreateKb={() => setActiveMainTab('knowledge')}
        // Settings 相关
        activeSettingsTab={activeSettingsTab}
        onSelectSettingsTab={(tab) => {
          setActiveSettingsTab(tab);
          setActiveMainTab('settings');
        }}
      />

      {/* 3. 主工作区 View (自适应 flex-1) */}
      <main className="flex-1 h-full min-w-0 overflow-hidden bg-slate-950">
        {activeMainTab === 'chat' && (
          <ChatArea
            currentConversation={conversations.find((c) => c.id === activeConversationId) || null}
            messages={currentMessages}
            streamingContent={currentStreamingContent}
            streamingThinking={currentSession?.thinking || ''}
            streamingToolCalls={currentSession?.toolCalls || []}
            streamingCitations={currentStreamingCitations}
            pendingApproval={currentPendingApproval}
            isStreaming={currentIsStreaming}
            models={models}
            selectedModelId={selectedModelId}
            skills={skills}
            onSelectModel={(id) => setSelectedModelId(id)}
            onSendMessage={handleSendMessage}
            onStopStreaming={handleStopStreaming}
            onNavigateToPlaza={() => setActiveMainTab('plaza')}
            onNavigateToSettings={() => setActiveMainTab('settings')}
            onApproveAction={handleApproveAction}
          />
        )}

        {activeMainTab === 'plaza' && (
          <PlazaView
            currentCategory={plazaCategory}
            tagFilter={plazaTagFilter}
            installedTools={tools}
            installedSkills={skills}
            onRefreshTools={() => api.listTools().then(setTools)}
            onRefreshSkills={() => api.listSkills().then(setSkills)}
          />
        )}

        {activeMainTab === 'knowledge' && (
          <KnowledgeBaseView
            knowledgeBases={knowledgeBases}
            selectedKbId={selectedKbId}
            onRefreshKbs={() => api.listKnowledgeBases().then(setKnowledgeBases)}
          />
        )}

        {activeMainTab === 'memory' && (
          <MemoryView
            memories={memories}
            onRefresh={() => api.listMemories().then(setMemories)}
          />
        )}

        {activeMainTab === 'settings' && (
          <SettingsView
            activeTab={activeSettingsTab}
            onNavigateToPlaza={(cat) => {
              setPlazaCategory(cat);
              setActiveMainTab('plaza');
            }}
            onNavigateToKnowledge={() => setActiveMainTab('knowledge')}
            models={models}
            onRefreshModels={() => api.listModels().then(setModels)}
            skills={skills}
            onRefreshSkills={() => api.listSkills().then(setSkills)}
            tools={tools}
            onRefreshTools={() => api.listTools().then(setTools)}
          />
        )}
      </main>
    </div>
  );
}
