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
import type { User, Workspace, ModelConfig, Conversation, Message, Citation, PendingApproval, Skill, ToolConfig, Memory, ToolCallEvent } from './types';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ModelConfigModal } from './components/ModelConfigModal';
import { KnowledgeBaseModal } from './components/KnowledgeBaseModal';
import { SkillModal } from './components/SkillModal';
import { ToolModal } from './components/ToolModal';
import { MemoryModal } from './components/MemoryModal';

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

  // 会话隔离：按 conversationId 维护消息缓存与流式 Session
  const [messagesByConv, setMessagesByConv] = useState<Record<string, Message[]>>({});
  const [streamingSessions, setStreamingSessions] = useState<Record<string, StreamingSession>>({});

  // Modals
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isKbModalOpen, setIsKbModalOpen] = useState(false);
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);

  // Skills, Tools & Memories
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
      const [modelList, convList, skillList, toolList, memList] = await Promise.all([
        api.listModels(),
        api.listConversations(),
        api.listSkills().catch(() => [] as Skill[]),
        api.listTools().catch(() => [] as ToolConfig[]),
        api.listMemories().catch(() => [] as Memory[]),
      ]);
      setModels(modelList);
      setConversations(convList);
      setSkills(skillList);
      setTools(toolList);
      setMemories(memList);

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
        if (!isCancelled) console.error('Failed to load messages:', err);
      });
    return () => {
      isCancelled = true;
    };
  }, [activeConversationId]);

  // Handlers
  const handleSelectWorkspace = (ws: Workspace) => {
    Object.values(streamingSessions).forEach((s) => s.controller?.abort());
    setStreamingSessions({});
    setMessagesByConv({});
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
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      if (streamingSessions[id]?.controller) {
        streamingSessions[id].controller.abort();
      }
      setStreamingSessions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setMessagesByConv((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

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
    const convId = activeConversationId || `draft-${Date.now()}`;
    if (streamingSessions[convId]?.isStreaming) return;

    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: convId,
      role: 'user',
      content,
      token_count: 0,
      created_at: new Date().toISOString(),
    };

    if (!activeConversationId) {
      setActiveConversationId(convId);
      activeConversationIdRef.current = convId;
    }

    setMessagesByConv((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] || []), tempUserMessage],
    }));

    const controller = new AbortController();

    setStreamingSessions((prev) => ({
      ...prev,
      [convId]: {
        conversationId: convId,
        isStreaming: true,
        content: '',
        thinking: '',
        toolCalls: [],
        citations: [],
        pendingApproval: null,
        controller,
      },
    }));

    let targetConvId = convId;

    await streamChat({
      conversationId: activeConversationId && !activeConversationId.startsWith('draft-') ? activeConversationId : undefined,
      content,
      modelConfigId: selectedModelId || undefined,
      signal: controller.signal,
      onStart: ({ conversation_id, title }) => {
        if (targetConvId !== conversation_id) {
          const oldDraftId = targetConvId;
          targetConvId = conversation_id;

          if (activeConversationIdRef.current === oldDraftId) {
            setActiveConversationId(conversation_id);
            activeConversationIdRef.current = conversation_id;
          }

          setMessagesByConv((prev) => {
            const msgs = prev[oldDraftId] || [];
            const next = { ...prev };
            delete next[oldDraftId];
            next[conversation_id] = msgs.map((m) =>
              m.conversation_id === oldDraftId ? { ...m, conversation_id } : m
            );
            return next;
          });

          setStreamingSessions((prev) => {
            const session = prev[oldDraftId];
            const next = { ...prev };
            delete next[oldDraftId];
            next[conversation_id] = session
              ? { ...session, conversationId: conversation_id }
              : {
                  conversationId: conversation_id,
                  isStreaming: true,
                  content: '',
                  thinking: '',
                  toolCalls: [],
                  citations: [],
                  pendingApproval: null,
                  controller,
                };
            return next;
          });
        }

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
        setStreamingSessions((prev) => {
          const current = prev[targetConvId];
          if (!current) return prev;
          return {
            ...prev,
            [targetConvId]: {
              ...current,
              content: current.content + chunk,
            },
          };
        });
      },
      onThinkingChunk: (chunk) => {
        setStreamingSessions((prev) => {
          const current = prev[targetConvId];
          if (!current) return prev;
          return {
            ...prev,
            [targetConvId]: {
              ...current,
              thinking: current.thinking + chunk,
            },
          };
        });
      },
      onToolCall: (tc) => {
        setStreamingSessions((prev) => {
          const current = prev[targetConvId];
          if (!current) return prev;
          const existingIdx = current.toolCalls.findIndex((t) => t.tool_id === tc.tool_id);
          let nextTools: ToolCallEvent[];
          if (existingIdx >= 0) {
            nextTools = [...current.toolCalls];
            nextTools[existingIdx] = { ...nextTools[existingIdx], ...tc };
          } else {
            nextTools = [...current.toolCalls, { ...tc, timestamp: Date.now() }];
          }
          return {
            ...prev,
            [targetConvId]: {
              ...current,
              toolCalls: nextTools,
            },
          };
        });
      },
      onToolResult: (tr) => {
        setStreamingSessions((prev) => {
          const current = prev[targetConvId];
          if (!current) return prev;
          const existingIdx = current.toolCalls.findIndex((t) => t.tool_id === tr.tool_id);
          let nextTools: ToolCallEvent[];
          if (existingIdx >= 0) {
            nextTools = [...current.toolCalls];
            nextTools[existingIdx] = {
              ...nextTools[existingIdx],
              status: 'completed',
              content: tr.content,
            };
          } else {
            nextTools = [
              ...current.toolCalls,
              {
                tool_id: tr.tool_id || `tool-${Date.now()}`,
                tool_name: tr.tool_name || 'Tool',
                status: 'completed',
                content: tr.content,
                timestamp: Date.now(),
              },
            ];
          }
          return {
            ...prev,
            [targetConvId]: {
              ...current,
              toolCalls: nextTools,
            },
          };
        });
      },
      onCitation: (citation) => {
        setStreamingSessions((prev) => {
          const current = prev[targetConvId];
          if (!current) return prev;
          if (current.citations.some((c) => c.point_id === citation.point_id)) {
            return prev;
          }
          return {
            ...prev,
            [targetConvId]: {
              ...current,
              citations: [...current.citations, citation],
            },
          };
        });
      },
      onApprovalRequired: (approval) => {
        setStreamingSessions((prev) => {
          const current = prev[targetConvId];
          if (!current) return prev;
          return {
            ...prev,
            [targetConvId]: {
              ...current,
              pendingApproval: approval,
            },
          };
        });
      },
      onError: (err) => {
        console.error(`Chat error in conversation [${targetConvId}]:`, err);
        setStreamingSessions((prev) => {
          const current = prev[targetConvId];
          if (!current) return prev;
          return {
            ...prev,
            [targetConvId]: {
              ...current,
              isStreaming: false,
            },
          };
        });
      },
      onDone: async (finalConvId) => {
        const actualId = finalConvId || targetConvId;

        let citationsToAttach: Citation[] = [];
        setStreamingSessions((prev) => {
          const current = prev[actualId] || prev[targetConvId];
          if (current) {
            citationsToAttach = current.citations;
          }
          if (!current) return prev;
          return {
            ...prev,
            [actualId]: {
              ...current,
              isStreaming: false,
            },
          };
        });

        if (actualId) {
          try {
            const updatedMsgs = await api.getMessages(actualId);
            if (citationsToAttach.length > 0 && updatedMsgs.length > 0) {
              const lastAssistant = [...updatedMsgs].reverse().find((m) => m.role === 'assistant');
              if (lastAssistant) {
                lastAssistant.citations = [...citationsToAttach];
              }
            }
            setMessagesByConv((prev) => ({
              ...prev,
              [actualId]: updatedMsgs,
            }));
          } catch (e) {
            console.error('Failed to reload messages onDone:', e);
          }
        }

        setStreamingSessions((prev) => {
          const next = { ...prev };
          delete next[actualId];
          if (actualId !== targetConvId) delete next[targetConvId];
          return next;
        });

        api.listConversations().then(setConversations).catch(console.error);
      },
    });
  };

  const handleApproveAction = async (approved: boolean) => {
    const convId = activeConversationId;
    if (!convId) return;

    const controller = new AbortController();

    setStreamingSessions((prev) => {
      const current = prev[convId];
      return {
        ...prev,
        [convId]: {
          conversationId: convId,
          isStreaming: true,
          content: '',
          thinking: '',
          toolCalls: current?.toolCalls || [],
          citations: current?.citations || [],
          pendingApproval: null,
          controller,
        },
      };
    });

    await streamResumeApproval({
      conversationId: convId,
      approved,
      modelConfigId: selectedModelId || undefined,
      onChunk: (chunk) => {
        setStreamingSessions((prev) => {
          const current = prev[convId];
          if (!current) return prev;
          return {
            ...prev,
            [convId]: {
              ...current,
              content: current.content + chunk,
            },
          };
        });
      },
      onThinkingChunk: (chunk) => {
        setStreamingSessions((prev) => {
          const current = prev[convId];
          if (!current) return prev;
          return {
            ...prev,
            [convId]: {
              ...current,
              thinking: current.thinking + chunk,
            },
          };
        });
      },
      onToolCall: (tc) => {
        setStreamingSessions((prev) => {
          const current = prev[convId];
          if (!current) return prev;
          return {
            ...prev,
            [convId]: {
              ...current,
              toolCalls: [...current.toolCalls, { ...tc, timestamp: Date.now() }],
            },
          };
        });
      },
      onToolResult: (tr) => {
        setStreamingSessions((prev) => {
          const current = prev[convId];
          if (!current) return prev;
          const updated = current.toolCalls.map((t) =>
            t.tool_id === tr.tool_id ? { ...t, status: 'completed' as const, content: tr.content } : t
          );
          return {
            ...prev,
            [convId]: {
              ...current,
              toolCalls: updated,
            },
          };
        });
      },
      onDone: async (finalConvId) => {
        const actualId = finalConvId || convId;
        setStreamingSessions((prev) => {
          const current = prev[actualId];
          if (!current) return prev;
          return {
            ...prev,
            [actualId]: {
              ...current,
              isStreaming: false,
            },
          };
        });

        if (actualId) {
          try {
            const updatedMsgs = await api.getMessages(actualId);
            setMessagesByConv((prev) => ({
              ...prev,
              [actualId]: updatedMsgs,
            }));
          } catch (e) {
            console.error('Failed to reload messages on approval done:', e);
          }
        }

        setStreamingSessions((prev) => {
          const next = { ...prev };
          delete next[actualId];
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
        streamingConversationIds={Object.keys(streamingSessions).filter(
          (id) => streamingSessions[id]?.isStreaming
        )}
      />

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
        memoryCount={memories.length}
        onSelectModel={(id) => setSelectedModelId(id)}
        onSendMessage={handleSendMessage}
        onStopStreaming={handleStopStreaming}
        onOpenModelConfig={() => setIsModelModalOpen(true)}
        onOpenKnowledgeBase={() => setIsKbModalOpen(true)}
        onOpenSkills={() => setIsSkillModalOpen(true)}
        onOpenTools={() => setIsToolModalOpen(true)}
        onOpenMemories={() => setIsMemoryModalOpen(true)}
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

      <SkillModal
        isOpen={isSkillModalOpen}
        onClose={() => setIsSkillModalOpen(false)}
        skills={skills}
        onRefresh={() => {
          api.listSkills().then(setSkills).catch(console.error);
        }}
      />

      <ToolModal
        isOpen={isToolModalOpen}
        onClose={() => setIsToolModalOpen(false)}
        tools={tools}
        onRefresh={() => {
          api.listTools().then(setTools).catch(console.error);
        }}
      />

      <MemoryModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        memories={memories}
        onRefresh={() => {
          api.listMemories().then(setMemories).catch(console.error);
        }}
      />
    </div>
  );
}
