import { useEffect, useState } from "react";
import {
  FileText,
  Layers,
  Sparkles,
  Globe,
  Search,
  Loader2,
  Eye,
  Check,
  Copy,
  ExternalLink,
  ArrowLeft,
  X,
  Hash,
} from "lucide-react";

export default function KnowledgeBaseSection({
  documents,
  chunks,
  selectedDoc,
  setSelectedDoc,
  docSearch,
  setDocSearch,
  chunkSearch,
  setChunkSearch,
  viewMode,
  setViewMode,
  loadingDocs,
  loadingChunks,
  copiedId,
  handleCopy,
  statusData,
  fetchChunks,
}) {
  const [detailDoc, setDetailDoc] = useState(null);

  return (
    <>
      <div className="flex-1 flex flex-col p-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<FileText size={18} />}
            label="Documents"
            value={statusData?.document_count || 0}
            color="text-blue-600"
            bg="bg-blue-50"
          />
          <StatCard
            icon={<Layers size={18} />}
            label="Chunks"
            value={statusData?.chunk_count || 0}
            color="text-purple-600"
            bg="bg-purple-50"
          />
          <StatCard
            icon={<Sparkles size={18} />}
            label="Embedded"
            value={statusData?.embedded_count || 0}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <StatCard
            icon={<Globe size={18} />}
            label="Website"
            value={
              statusData?.website_urls && statusData.website_urls.length > 0
                ?
                    statusData.website_urls.length +
                    " URL" +
                    (statusData.website_urls.length > 1 ? "s" : "")
                : statusData?.website_url
                  ? new URL(statusData.website_url).hostname
                  : "—"
            }
            color="text-gray-600"
            bg="bg-gray-50"
            isText
          />
        </div>

        {/* Toggle + Search */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => {
                setViewMode("documents");
                setSelectedDoc(null);
              }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                viewMode === "documents"
                  ? "bg-crimson text-white shadow-sm"
                  : "text-gray-500 hover:text-charcoal"
              }`}
            >
              Documents
            </button>
            <button
              onClick={() => setViewMode("chunks")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                viewMode === "chunks"
                  ? "bg-crimson text-white shadow-sm"
                  : "text-gray-500 hover:text-charcoal"
              }`}
            >
              Chunks
            </button>
          </div>

          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder={
                viewMode === "documents"
                  ? "Search documents..."
                  : "Search chunks..."
              }
              value={viewMode === "documents" ? docSearch : chunkSearch}
              onChange={(e) =>
                viewMode === "documents"
                  ? setDocSearch(e.target.value)
                  : setChunkSearch(e.target.value)
              }
              className="pl-9 pr-4 py-2 w-72 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40 transition"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {viewMode === "documents" ? (
            <DocumentsView
              documents={documents}
              loading={loadingDocs}
              copiedId={copiedId}
              handleCopy={handleCopy}
              setSelectedDoc={setSelectedDoc}
              setDetailDoc={setDetailDoc}
            />
          ) : (
            <ChunksView
              chunks={chunks}
              loading={loadingChunks}
              selectedDoc={selectedDoc}
              setSelectedDoc={setSelectedDoc}
              copiedId={copiedId}
              handleCopy={handleCopy}
              fetchChunks={fetchChunks}
            />
          )}
        </div>
      </div>

      {detailDoc && (
        <DocumentDetailModal
          doc={detailDoc}
          onClose={() => setDetailDoc(null)}
          copiedId={copiedId}
          handleCopy={handleCopy}
        />
      )}
    </>
  );
}

function StatCard({ icon, label, value, color, bg, isText }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-lg ${bg} ${color} flex items-center justify-center`}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p
          className={`font-bold ${
            isText
              ? "text-sm text-gray-700 truncate max-w-[140px]"
              : "text-xl text-charcoal"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function DocumentsView({
  documents,
  loading,
  copiedId,
  handleCopy,
  setSelectedDoc,
  setDetailDoc,
}) {
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    setVisibleCount(10);
  }, [documents.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-crimson animate-spin" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <FileText size={40} className="mb-3" />
        <p className="text-sm font-medium">No documents found</p>
        <p className="text-xs mt-1">
          Crawl a website or upload files to populate the knowledge base
        </p>
      </div>
    );
  }

  const visibleDocs = documents.slice(0, visibleCount);
  const hasMore = visibleCount < documents.length;

  return (
    <div className="divide-y divide-gray-100">
      <div className="grid grid-cols-[1fr_100px_90px_90px_120px] gap-4 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <span>Title / URL</span>
        <span>Type</span>
        <span>Words</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      {visibleDocs.map((doc) => (
        <div
          key={doc.id}
          className="grid grid-cols-[1fr_100px_90px_90px_120px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/60 transition-colors"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-charcoal truncate">
              {doc.title || "Untitled"}
            </p>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {doc.source_url}
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
              doc.source_type === "web"
                ? "bg-blue-50 text-blue-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {doc.source_type === "web" ? (
              <Globe size={10} />
            ) : (
              <FileText size={10} />
            )}
            {doc.source_type}
          </span>

          <p className="text-sm text-gray-600 tabular-nums">
            {doc.word_count?.toLocaleString()}
          </p>

          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
              doc.status === "embedded"
                ? "bg-emerald-50 text-emerald-700"
                : doc.status === "chunked"
                  ? "bg-purple-50 text-purple-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {doc.status}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setDetailDoc(doc)}
              className="p-1.5 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition cursor-pointer"
              title="View document content"
            >
              <Eye size={14} />
            </button>
            <button
              onClick={() => setSelectedDoc(doc)}
              className="p-1.5 rounded-md hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition cursor-pointer"
              title="View chunks"
            >
              <Layers size={14} />
            </button>
            <button
              onClick={() => handleCopy(doc.raw_content, doc.id)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-charcoal transition cursor-pointer"
              title="Copy content"
            >
              {copiedId === doc.id ? (
                <Check size={13} className="text-emerald-500" />
              ) : (
                <Copy size={13} />
              )}
            </button>
            {doc.source_url && doc.source_type === "web" && (
              <a
                href={doc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition"
                title="Open URL"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="flex items-center justify-center py-4 border-t border-gray-100">
          <button
            onClick={() => setVisibleCount((prev) => prev + 10)}
            className="px-4 py-2 text-sm font-medium text-crimson border border-crimson/30 rounded-lg hover:bg-crimson/5 transition cursor-pointer"
          >
            Load More ({documents.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

function DocumentDetailModal({ doc, onClose, copiedId, handleCopy }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/50 animate-fade-in">
      <div className="flex-1 bg-[#F9FAFB] flex flex-col overflow-hidden m-4 rounded-2xl shadow-2xl">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-charcoal transition cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-charcoal truncate">
                {doc.title || "Untitled"}
              </h2>
              {doc.source_url && (
                <a
                  href={doc.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline truncate block"
                >
                  {doc.source_url}
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                doc.source_type === "web"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {doc.source_type === "web" ? (
                <Globe size={11} />
              ) : (
                <FileText size={11} />
              )}
              {doc.source_type}
            </span>
            <span className="text-xs text-gray-500">
              {doc.word_count?.toLocaleString()} words
            </span>
            <span
              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                doc.status === "embedded"
                  ? "bg-emerald-50 text-emerald-700"
                  : doc.status === "chunked"
                    ? "bg-purple-50 text-purple-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {doc.status}
            </span>

            <button
              onClick={() => handleCopy(doc.raw_content, `detail-${doc.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-charcoal transition cursor-pointer"
            >
              {copiedId === `detail-${doc.id}` ? (
                <>
                  <Check size={12} className="text-emerald-500" /> Copied
                </>
              ) : (
                <>
                  <Copy size={12} /> Copy All
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-charcoal transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Raw Content
              </span>
            </div>
            <pre className="p-6 text-sm text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
              {doc.raw_content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChunksView({
  chunks,
  loading,
  selectedDoc,
  setSelectedDoc,
  copiedId,
  handleCopy,
  fetchChunks,
}) {
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    setVisibleCount(10);
  }, [chunks.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-crimson animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {selectedDoc && (
        <div className="flex items-center justify-between px-5 py-2.5 bg-purple-50 border-b border-purple-100">
          <p className="text-sm text-purple-700">
            Showing chunks for:{" "}
            <span className="font-semibold">{selectedDoc.title}</span>
          </p>
          <button
            onClick={() => {
              setSelectedDoc(null);
              fetchChunks();
            }}
            className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800 cursor-pointer"
          >
            <X size={12} /> Show all
          </button>
        </div>
      )}

      {chunks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Layers size={40} className="mb-3" />
          <p className="text-sm font-medium">No chunks found</p>
          <p className="text-xs mt-1">
            {selectedDoc
              ? "This document has no chunks yet"
              : "Run the chunk step from Setup to create chunks"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-[60px_1fr_120px_80px_80px_60px] gap-4 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>#</span>
            <span>Content Preview</span>
            <span>Document</span>
            <span>Words</span>
            <span>Embedded</span>
            <span></span>
          </div>

          {chunks.slice(0, visibleCount).map((chunk) => (
            <ChunkRow
              key={chunk.id}
              chunk={chunk}
              copiedId={copiedId}
              handleCopy={handleCopy}
            />
          ))}

          {visibleCount < chunks.length && (
            <div className="flex items-center justify-center py-4 border-t border-gray-100">
              <button
                onClick={() => setVisibleCount((prev) => prev + 10)}
                className="px-4 py-2 text-sm font-medium text-crimson border border-crimson/30 rounded-lg hover:bg-crimson/5 transition cursor-pointer"
              >
                Load More ({chunks.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChunkRow({ chunk, copiedId, handleCopy }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        className="grid grid-cols-[60px_1fr_120px_80px_80px_60px] gap-4 px-5 py-3 items-center hover:bg-gray-50/60 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs font-mono text-gray-400 flex items-center gap-1">
          <Hash size={10} />
          {chunk.chunk_index}
        </span>
        <p className="text-sm text-gray-700 truncate">
          {chunk.content?.substring(0, 120)}...
        </p>
        <p className="text-xs text-gray-400 truncate" title={chunk.doc_title}>
          {chunk.doc_title}
        </p>
        <p className="text-sm text-gray-600 tabular-nums">
          {chunk.word_count}
        </p>
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            chunk.has_embedding
              ? "bg-emerald-50 text-emerald-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {chunk.has_embedding ? "Yes" : "No"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(chunk.content, chunk.id);
          }}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-charcoal transition cursor-pointer"
        >
          {copiedId === chunk.id ? (
            <Check size={13} className="text-emerald-500" />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-3">
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {chunk.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
