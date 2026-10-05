import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

const DRAFT_NEW_ID = 'draft-new';

export function estimateTokenCount(text: string): number {
  if (!text.trim()) return 0;
  const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherPart = text.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
  const wordCount = otherPart ? otherPart.split(/\s+/).filter(Boolean).length : 0;
  return Math.max(1, Math.round(chineseCount * 1.3 + wordCount * 1.3));
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 统一路由导航方法
  const navigateToTab = (tab: MainNavTab, subId?: string) => {
    setActiveMainTab(tab);
    if (tab === 'chat') {
      const convId = subId || activeConversationId;
      navigate(convId ? `/chat/${convId}` : '/chat');
    } else if (tab === 'plaza') {
      const cat = subId || plazaCategory;
      navigate(cat && cat !== 'all' ? `/plaza/${cat}` : '/plaza');
    } else if (tab === 'knowledge') {
      const kbId = subId || selectedKbId;
      navigate(kbId ? `/knowledge/${kbId}` : '/knowledge');
    } else if (tab === 'settings') {
      const sTab = subId || activeSettingsTab || 'model';
      navigate(`/settings/${sTab}`);
    } else if (tab === 'memory') {
      navigate('/memory');
    }
  };

  // 监听浏览器路由变化 (支持前进/后退、多标签深度链接与直接访问)
  useEffect(() => {
    const path = location.pathname;
    const parts = path.split('/').filter(Boolean);
    const firstPart = parts[0] as MainNavTab | undefined;
    const secondPart = parts[1];

    if (!firstPart || firstPart === 'chat') {
      setActiveMainTab('chat');
      if (secondPart && secondPart !== activeConversationIdRef.current) {
        setActiveConversationId(secondPart);
      } else if (!secondPart && activeConversationIdRef.current !== DRAFT_NEW_ID) {
        setActiveConversationId(DRAFT_NEW_ID);
      }
    } else if (firstPart === 'plaza') {
      setActiveMainTab('plaza');
      if (secondPart) {
        setPlazaCategory(secondPart as PlazaCategory);
      }
    } else if (firstPart === 'knowledge') {
      setActiveMainTab('knowledge');
      if (secondPart) {
        setSelectedKbId(secondPart);
      }
    } else if (firstPart === 'settings') {
      setActiveMainTab('settings');
      if (secondPart) {
        setActiveSettingsTab(secondPart as SettingsSubTab);
      }
    } else if (firstPart === 'memory') {
      setActiveMainTab('memory');
    }
  }, [location.pathname]);

  const handleForkAtMessage = async (messageId: string) => {
    const convId = activeConversationIdRef.current;
    if (!convId || convId.startsWith('draft-')) return;
    try {
      const origConv = conversations.find((c) => c.id === convId);
      const newConv = await api.forkConversation(
        convId,
        messageId,
        `${origConv?.title || '新对话'} (分支)`
      );

      // 拉取新分支完整克隆的历史消息
      const forkedMsgs = await api.getMessages(newConv.id);

      setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
      setActiveConversationId(newConv.id);
      setMessagesByConv((prev) => ({
        ...prev,
        [newConv.id]: forkedMsgs,
      }));
      setActiveMainTab('chat');
      navigate(`/chat/${newConv.id}`);
    } catch (err) {
      console.error('开启分支对话失败:', err);
      alert('开启分支对话失败，请重试');
    }
  };

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
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        const urlConvId = pathParts[0] === 'chat' ? pathParts[1] : null;
        const targetId = urlConvId && convList.some((c) => c.id === urlConvId) ? urlConvId : convList[0].id;
        setActiveConversationId(targetId);
        if (window.location.pathname === '/' || window.location.pathname === '/chat') {
          navigate(`/chat/${targetId}`, { replace: true });
        }
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
    // 幂等：若当前已经处于空白新会话状态，直接返回或确保在 /chat
    if (activeConversationId === DRAFT_NEW_ID || (!activeConversationId && location.pathname === '/chat')) {
      setActiveMainTab('chat');
      navigate('/chat');
      return;
    }
    setActiveConversationId(DRAFT_NEW_ID);
    setMessagesByConv((prev) => ({
      ...prev,
      [DRAFT_NEW_ID]: [],
    }));
    setActiveMainTab('chat');
    navigate('/chat');
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
    );
    if (!id.startsWith('draft-')) {
      try {
        await api.updateConversation(id, { title: trimmed });
      } catch (err) {
        console.error('Failed to rename conversation:', err);
      }
    }
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
        const nextId = remaining.length > 0 ? remaining[0].id : null;
        setActiveConversationId(nextId);
        navigate(nextId ? `/chat/${nextId}` : '/chat');
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
        const nextId = remaining.length > 0 ? remaining[0].id : null;
        setActiveConversationId(nextId);
        navigate(nextId ? `/chat/${nextId}` : '/chat');
      }
    } catch (err) {
      alert('删除失败');
    }
  };

  // 5. Send message
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    let convId = activeConversationId || DRAFT_NEW_ID;
    let actualConvId = convId;

    if (!convId || convId.startsWith('draft-')) {
      try {
        // 自动提取标题：如果是分支草稿，保留已有分支标题；否则根据用户第一句话提炼前 24 个字符
        let autoTitle = '新对话';
        const existingConv = conversations.find((c) => c.id === convId);
        if (existingConv && existingConv.title && existingConv.title !== '新对话') {
          autoTitle = existingConv.title;
        } else {
          // 清洗开头的技能代码 (/xxx) 和多余换行，取第一句话的核心文本
          const cleanText = content.trim().replace(/^\/[a-zA-Z0-9_-]+\s*/, '').replace(/[\r\n]+/g, ' ').trim();
          autoTitle = cleanText.slice(0, 24) || content.trim().slice(0, 24) || '新对话';
        }

        const created = await api.createConversation(
          autoTitle,
          selectedModelId || undefined
        );
        actualConvId = created.id;

        // 若原列表中已有该会话则替换，否则作为新会话插入在最前面（此时左侧正式展示该会话，且名字已改好）
        setConversations((prev) => {
          const hasExisting = prev.some((c) => c.id === convId);
          if (hasExisting) {
            return prev.map((c) => (c.id === convId ? created : c));
          }
          return [created, ...prev];
        });

        setActiveConversationId(actualConvId);
        navigate(`/chat/${actualConvId}`, { replace: true });
        setMessagesByConv((prev) => {
          const draftMsgs = convId ? (prev[convId] || []) : [];
          const next = { ...prev };
          if (convId) delete next[convId];
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
      token_count: estimateTokenCount(content),
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

  // 5.1 Edit and resend message (原地编辑重发)
  const handleEditAndResendMessage = async (messageId: string, newContent: string) => {
    if (!activeConversationId) return;
    const convId = activeConversationId;

    // 1. 若当前会话正在流式，先中止
    const session = streamingSessions[convId];
    if (session?.controller) {
      session.controller.abort();
    }
    setStreamingSessions((prev) => {
      const next = { ...prev };
      delete next[convId];
      return next;
    });

    // 2. 从后端截断该消息及后续问答
    try {
      await api.truncateMessages(convId, messageId);
    } catch (err) {
      console.error('Failed to truncate on backend:', err);
    }

    // 3. 从前端移除该消息及后续问答
    setMessagesByConv((prev) => {
      const msgs = prev[convId] || [];
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx >= 0) {
        return {
          ...prev,
          [convId]: msgs.slice(0, idx),
        };
      }
      return prev;
    });

    // 4. 以新内容重新发送
    handleSendMessage(newContent);
  };

  // 5.2 Regenerate message (重新回答)
  const handleRegenerateMessage = async (messageId: string, modelId?: string) => {
    if (!activeConversationId) return;
    const convId = activeConversationId;
    const msgs = messagesByConv[convId] || [];
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx < 0) return;

    let prevUserMsg: Message | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        prevUserMsg = msgs[i];
        break;
      }
    }
    if (!prevUserMsg) return;

    if (modelId) {
      setSelectedModelId(modelId);
    }

    handleEditAndResendMessage(prevUserMsg.id, prevUserMsg.content);
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
        onSelectTab={(tab) => navigateToTab(tab)}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onLogout={handleLogout}
        streamingCount={
          Object.keys(streamingSessions).filter((id) => streamingSessions[id]?.isStreaming).length
        }
      />

      {/* 2. 二级侧边栏 Pane (宽 250px) */}
      {!sidebarCollapsed && (
        <SubSidebar
          activeMainTab={activeMainTab}
          currentWorkspace={currentWorkspace}
          // Chat 相关
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            navigateToTab('chat', id);
          }}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          streamingConversationIds={Object.keys(streamingSessions).filter(
            (id) => streamingSessions[id]?.isStreaming
          )}
          // Plaza 相关
          plazaCategory={plazaCategory}
          onSelectPlazaCategory={(cat) => {
            setPlazaCategory(cat);
            navigate(`/plaza/${cat}`);
          }}
          plazaTagFilter={plazaTagFilter}
          onSelectPlazaTagFilter={setPlazaTagFilter}
          // Knowledge 相关
          knowledgeBases={knowledgeBases}
          selectedKbId={selectedKbId}
          onSelectKb={(id) => {
            setSelectedKbId(id);
            navigateToTab('knowledge', id);
          }}
          onCreateKb={() => navigateToTab('knowledge')}
          // Settings 相关
          activeSettingsTab={activeSettingsTab}
          onSelectSettingsTab={(tab) => {
            setActiveSettingsTab(tab);
            navigateToTab('settings', tab);
          }}
        />
      )}

      {/* 3. 主工作区 View (自适应 flex-1) */}
      <main className="flex-1 h-full min-w-0 overflow-hidden bg-slate-950">
        {activeMainTab === 'chat' && (
          <ChatArea
            user={user}
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
            knowledgeBases={knowledgeBases}
            onSelectModel={(id) => setSelectedModelId(id)}
            onSendMessage={handleSendMessage}
            onStopStreaming={handleStopStreaming}
            onNavigateToPlaza={() => navigateToTab('plaza')}
            onNavigateToSettings={() => navigateToTab('settings')}
            onApproveAction={handleApproveAction}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onForkAtMessage={handleForkAtMessage}
            onEditAndResendMessage={handleEditAndResendMessage}
            onRegenerateMessage={handleRegenerateMessage}
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
            onNavigateToSettings={(tab) => {
              setActiveSettingsTab(tab);
              navigateToTab('settings', tab);
            }}
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
              navigateToTab('plaza', cat);
            }}
            onNavigateToKnowledge={() => navigateToTab('knowledge')}
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
