import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { KnowledgeBase, Document, Citation } from '../types';
import {
  X,
  Plus,
  Trash2,
  BookOpen,
  Upload,
  FileText,
  Search,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KnowledgeBaseModal: React.FC<KnowledgeBaseModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeKb, setActiveKb] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isCreatingKb, setIsCreatingKb] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDesc, setNewKbDesc] = useState('');
  const [uploading, setUploading] = useState(false);

  // Search sandbox state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Citation[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadKbs();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeKb) {
      loadDocuments(activeKb.id);
    } else {
      setDocuments([]);
    }
  }, [activeKb]);

  const loadKbs = async () => {
    try {
      const list = await api.listKnowledgeBases();
      setKnowledgeBases(list);
      if (list.length > 0 && !activeKb) {
        setActiveKb(list[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadDocuments = async (kbId: string) => {
    try {
      const docs = await api.listDocuments(kbId);
      setDocuments(docs);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateKb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKbName.trim()) return;
    try {
      const created = await api.createKnowledgeBase({
        name: newKbName.trim(),
        description: newKbDesc.trim() || undefined,
      });
      setNewKbName('');
      setNewKbDesc('');
      setIsCreatingKb(false);
      await loadKbs();
      setActiveKb(created);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteKb = async (id: string) => {
    if (!confirm('确定删除该知识库及所有向量分块吗？')) return;
    try {
      await api.deleteKnowledgeBase(id);
      setActiveKb(null);
      await loadKbs();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeKb || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      await api.uploadDocument(activeKb.id, file);
      await loadDocuments(activeKb.id);
      await loadKbs();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '上传并分块失败');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!activeKb || !confirm('确定删除该文档及对应向量切片吗？')) return;
    try {
      await api.deleteDocument(activeKb.id, docId);
      await loadDocuments(activeKb.id);
      await loadKbs();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleTestSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !activeKb) return;
    setIsSearching(true);
    try {
      const results = await api.searchKnowledge({
        query: searchQuery.trim(),
        kb_ids: [activeKb.id],
        top_k: 3,
      });
      setSearchResults(results);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '检索失败');
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-semibold text-white">企业知识库与 RAG 引擎</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: KB List Sidebar */}
          <div className="w-64 border-r border-slate-800 p-4 flex flex-col gap-3 bg-slate-950/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                知识库列表 ({knowledgeBases.length})
              </span>
              <button
                onClick={() => setIsCreatingKb(true)}
                className="p-1 rounded-md text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                title="新建知识库"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {isCreatingKb && (
              <form onSubmit={handleCreateKb} className="p-3 bg-slate-800/80 border border-indigo-500/30 rounded-xl space-y-2">
                <input
                  type="text"
                  required
                  placeholder="知识库名称"
                  value={newKbName}
                  onChange={(e) => setNewKbName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <textarea
                  placeholder="简介描述 (可选)"
                  value={newKbDesc}
                  rows={2}
                  onChange={(e) => setNewKbDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium cursor-pointer"
                  >
                    创建
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingKb(false)}
                    className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}

            <div className="flex-1 overflow-y-auto space-y-1.5">
              {knowledgeBases.map((kb) => (
                <div
                  key={kb.id}
                  onClick={() => setActiveKb(kb)}
                  className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${
                    activeKb?.id === kb.id
                      ? 'bg-slate-800 border border-indigo-500/40 text-white shadow-sm'
                      : 'hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-semibold truncate">{kb.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {kb.document_count} 篇文档 · Qdrant 向量已索引
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteKb(kb.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition-opacity"
                    title="删除知识库"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Documents & Hybrid Search Playground */}
          <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
            {activeKb ? (
              <>
                {/* KB Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      {activeKb.name}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        混合检索就绪
                      </span>
                    </h4>
                    {activeKb.description && (
                      <p className="text-xs text-slate-400 mt-1">{activeKb.description}</p>
                    )}
                  </div>

                  {/* Upload button */}
                  <label className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/20">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading ? '解析并切块中...' : '上传文档'}</span>
                    <input
                      type="file"
                      disabled={uploading}
                      accept=".txt,.md,.pdf,.docx,.doc"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Documents Table */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    知识文档列表 ({documents.length})
                  </div>

                  {documents.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                      暂无文档，支持上传 .txt / .md / .pdf / .docx 文件自动分块并嵌入 Qdrant 向量库
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-white">{doc.filename}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                                <span className="font-mono text-slate-500">{doc.file_type.toUpperCase()}</span>
                                <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                                <span className="text-indigo-400">{doc.chunk_count} 个语义切片</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 已向量化
                            </span>
                            <button
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                              title="删除文档"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hybrid Search Test Playground */}
                <div className="p-5 rounded-2xl bg-slate-800/30 border border-slate-700/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-slate-200">
                        混合检索沙箱 (Dense 向量 + BM25 稀疏 + RRF 融合打分)
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleTestSearch} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="输入问题或关键词测试混合检索效果..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-semibold rounded-xl disabled:opacity-40 transition-all cursor-pointer"
                    >
                      {isSearching ? '检索中...' : '测试检索'}
                    </button>
                  </form>

                  {searchResults.length > 0 && (
                    <div className="space-y-2.5 pt-2">
                      <div className="text-[11px] font-semibold text-slate-400">
                        检索命中 Top-{searchResults.length} 结果：
                      </div>
                      {searchResults.map((res) => (
                        <div
                          key={res.point_id}
                          className="p-3 rounded-xl bg-slate-900 border border-slate-700/80 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-indigo-400 font-semibold text-[11px]">
                            <span className="truncate max-w-[240px]">
                              [{res.source_index}] {res.filename} (分块 #{res.chunk_index})
                            </span>
                            <div className="flex items-center gap-2">
                              {res.match_type && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    res.match_type === '混合命中'
                                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                                      : res.match_type === '关键词命中'
                                      ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
                                      : 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                                  }`}
                                >
                                  {res.match_type}
                                </span>
                              )}
                              <span className="font-mono text-emerald-400 font-bold">
                                相关度: {(res.score * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-slate-300 whitespace-pre-wrap leading-relaxed text-[11px] bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                            {res.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                请从左侧选择或创建一个知识库
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
