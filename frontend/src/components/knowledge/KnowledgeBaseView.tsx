import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { KnowledgeBase, Document, Citation } from '../../types';
import {
  Plus,
  Trash2,
  BookOpen,
  FileText,
  Sparkles,
  FileUp,
} from 'lucide-react';

interface KnowledgeBaseViewProps {
  knowledgeBases: KnowledgeBase[];
  selectedKbId: string | null;
  onRefreshKbs: () => void;
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  knowledgeBases,
  selectedKbId,
  onRefreshKbs,
}) => {
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
    if (selectedKbId) {
      const matched = knowledgeBases.find((k) => k.id === selectedKbId);
      if (matched) {
        setActiveKb(matched);
        return;
      }
    }
    if (knowledgeBases.length > 0 && !activeKb) {
      setActiveKb(knowledgeBases[0]);
    }
  }, [knowledgeBases, selectedKbId]);

  useEffect(() => {
    if (activeKb) {
      loadDocuments(activeKb.id);
    } else {
      setDocuments([]);
    }
  }, [activeKb]);

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
      onRefreshKbs();
      setActiveKb(created);
    } catch (err: any) {
      alert(err.message || '创建失败');
    }
  };

  const handleDeleteKb = async (id: string) => {
    if (!confirm('确定删除该知识库及所有向量分块吗？')) return;
    try {
      await api.deleteKnowledgeBase(id);
      setActiveKb(null);
      onRefreshKbs();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeKb) return;

    try {
      setUploading(true);
      await api.uploadDocument(activeKb.id, file);
      await loadDocuments(activeKb.id);
      onRefreshKbs();
      e.target.value = '';
    } catch (err: any) {
      alert(err.message || '文件解析入库失败');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!activeKb || !confirm('确定删除此文档及对应的向量切片吗？')) return;
    try {
      await api.deleteDocument(activeKb.id, docId);
      await loadDocuments(activeKb.id);
      onRefreshKbs();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleSearchSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !activeKb) return;
    try {
      setIsSearching(true);
      const results = await api.searchKnowledge({
        query: searchQuery.trim(),
        kb_ids: [activeKb.id],
        top_k: 5,
      });
      setSearchResults(results);
    } catch (err: any) {
      alert(err.message || '检索失败');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-slate-950 flex flex-col overflow-hidden text-slate-100">
      {/* 顶部 Header */}
      <header className="px-8 py-5 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <span>知识库资产与混合检索 (Knowledge RAG)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            企业私有文档切片向量化入库（Qdrant 1024 维）、NFKC 异形字清洗、BM25 中文关键词召回与 RRF 融合重排
          </p>
        </div>

        <button
          onClick={() => setIsCreatingKb(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>新建知识库</span>
        </button>
      </header>

      {/* 新建知识库表单 */}
      {isCreatingKb && (
        <form onSubmit={handleCreateKb} className="mx-8 mt-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">创建新知识库</h3>
            <button
              type="button"
              onClick={() => setIsCreatingKb(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              取消
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">知识库名称</label>
              <input
                type="text"
                required
                placeholder="如：技术规范与架构文档库"
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">描述 (可选)</label>
              <input
                type="text"
                placeholder="简短描述该知识库包含的资料范围"
                value={newKbDesc}
                onChange={(e) => setNewKbDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer"
            >
              确认创建
            </button>
          </div>
        </form>
      )}

      {/* 主工作区：左侧文档管理 + 右侧混合检索沙箱 */}
      <div className="flex-1 overflow-hidden grid grid-cols-12 gap-6 p-8">
        {/* 左侧：文档管理 */}
        <div className="col-span-7 flex flex-col bg-slate-900/60 rounded-2xl border border-slate-800/80 overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                {activeKb?.name || '选择知识库'}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                ({documents.length} 篇文档)
              </span>
            </div>

            {activeKb && (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-sm">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{uploading ? '切片索引中...' : '上传文档 (.pdf/.docx/.md/.txt)'}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".txt,.md,.pdf,.docx"
                    disabled={uploading}
                    onChange={handleFileUpload}
                  />
                </label>

                <button
                  onClick={() => handleDeleteKb(activeKb.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 cursor-pointer"
                  title="删除知识库"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 文档列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!activeKb ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                请先在左侧选择或创建一个知识库
              </div>
            ) : documents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-12">
                <FileText className="w-8 h-8 mb-2 opacity-30" />
                <span>知识库暂无文档，点击右上角上传</span>
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{doc.filename}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {doc.chunk_count} 个切片 · {(doc.file_size / 1024).toFixed(1)} KB · {doc.status}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：混合检索沙箱 */}
        <div className="col-span-5 flex flex-col bg-slate-900/60 rounded-2xl border border-slate-800/80 overflow-hidden">
          <div className="p-4 border-b border-slate-800/80">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>混合检索测试沙箱 (Dense + BM25 + RRF)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              测试当前知识库对于特定 Query 的命中率、语义与关键词得分
            </p>
          </div>

          {/* 检索输入框 */}
          <form onSubmit={handleSearchSandbox} className="p-4 border-b border-slate-800/80">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="输入检索测试语句（如：系统架构与并发优化）..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
              />
              <button
                type="submit"
                disabled={isSearching || !activeKb}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {isSearching ? '检索中...' : '测试检索'}
              </button>
            </div>
          </form>

          {/* 检索结果展示 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {searchResults.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-500 text-xs">
                输入 Query 并点击“测试检索”查看分块召回打分
              </div>
            ) : (
              searchResults.map((res, idx) => (
                <div
                  key={res.point_id || idx}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-indigo-300">
                      [{res.source_index}] {res.filename}
                    </span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      综合匹配: {(res.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed">
                    {res.content}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-2 font-mono">
                    {res.dense_score !== undefined && (
                      <span>Dense: {res.dense_score.toFixed(3)}</span>
                    )}
                    {res.sparse_score !== undefined && (
                      <span>BM25: {res.sparse_score.toFixed(3)}</span>
                    )}
                    {res.match_type && (
                      <span className="px-1 rounded bg-purple-950 text-purple-300">
                        {res.match_type}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
