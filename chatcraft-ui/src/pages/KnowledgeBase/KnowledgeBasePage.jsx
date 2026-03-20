import { useState, useEffect } from "react";
import {
  FileText,
  Layers,
  Sparkles,
  Globe,
  Search,
  Eye,
  Copy,
  Check,
  ExternalLink,
  Loader2,
} from "lucide-react";
import "./KnowledgeBasePage.css";

export default function KnowledgeBasePage({
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
  setDetailDoc,
}) {
  return (
    <div className="kb-page-container">
      {/* Stats */}
      <div className="kb-stats-grid">
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
              ? statusData.website_urls.length + " URL" + (statusData.website_urls.length > 1 ? "s" : "")
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
      <div className="kb-toolbar">
        <div className="kb-view-toggle">
          <button
            onClick={() => {
              setViewMode("documents");
              setSelectedDoc(null);
            }}
            className={`kb-toggle-btn ${viewMode === "documents" ? "active" : ""}`}
          >
            Documents
          </button>
          <button
            onClick={() => setViewMode("chunks")}
            className={`kb-toggle-btn ${viewMode === "chunks" ? "active" : ""}`}
          >
            Chunks
          </button>
        </div>

        <div className="kb-search-wrapper">
          <Search size={15} className="kb-search-icon" />
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
            className="kb-search-input"
          />
        </div>
      </div>

      {/* Content */}
      <div className="kb-content">
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
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, bg, isText }) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon ${bg} ${color}`}>{icon}</div>
      <div>
        <p className="stat-card-label">{label}</p>
        <p className={`stat-card-value ${isText ? "stat-card-value-text" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Documents View ──────────────────────────────────────────────────────────

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
      <div className="kb-loading">
        <Loader2 size={24} className="text-crimson animate-spin" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="kb-empty">
        <FileText size={40} />
        <p className="kb-empty-title">No documents found</p>
        <p className="kb-empty-subtitle">
          Crawl a website or upload files to populate the knowledge base
        </p>
      </div>
    );
  }

  const visibleDocs = documents.slice(0, visibleCount);
  const hasMore = visibleCount < documents.length;

  return (
    <div className="documents-table">
      {/* Header */}
      <div className="documents-table-header">
        <span>Title / URL</span>
        <span>Type</span>
        <span>Words</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      {/* Rows */}
      {visibleDocs.map((doc) => (
        <div key={doc.id} className="documents-table-row">
          <div className="doc-title-col">
            <p className="doc-title">{doc.title || "Untitled"}</p>
            <p className="doc-url">{doc.source_url}</p>
          </div>

          <span
            className={`doc-type-badge ${
              doc.source_type === "web" ? "doc-type-web" : "doc-type-file"
            }`}
          >
            {doc.source_type === "web" ? (
              <Globe size={10} />
            ) : (
              <FileText size={10} />
            )}
            {doc.source_type}
          </span>

          <p className="doc-word-count">{doc.word_count?.toLocaleString()}</p>

          <span
            className={`doc-status-badge ${
              doc.status === "embedded"
                ? "doc-status-embedded"
                : doc.status === "chunked"
                ? "doc-status-chunked"
                : "doc-status-pending"
            }`}
          >
            {doc.status}
          </span>

          <div className="doc-actions">
            <button
              onClick={() => setDetailDoc(doc)}
              className="doc-action-btn doc-action-view"
              title="View document content"
            >
              <Eye size={14} />
            </button>
            <button
              onClick={() => setSelectedDoc(doc)}
              className="doc-action-btn doc-action-chunks"
              title="View chunks"
            >
              <Layers size={14} />
            </button>
            <button
              onClick={() => handleCopy(doc.raw_content, doc.id)}
              className="doc-action-btn doc-action-copy"
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
                className="doc-action-btn doc-action-link"
                title="Open URL"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      ))}

      {/* Load More */}
      {hasMore && (
        <div className="documents-load-more">
          <button
            onClick={() => setVisibleCount((prev) => prev + 10)}
            className="documents-load-more-btn"
          >
            Load More ({documents.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Chunks View ──────────────────────────────────────────────────────────────

function ChunksView({
  chunks,
  loading,
  selectedDoc,
  setSelectedDoc,
  copiedId,
  handleCopy,
  fetchChunks,
}) {
  if (loading) {
    return (
      <div className="kb-loading">
        <Loader2 size={24} className="text-crimson animate-spin" />
      </div>
    );
  }

  if (!selectedDoc) {
    return (
      <div className="kb-empty">
        <Layers size={40} />
        <p className="kb-empty-title">Select a document</p>
        <p className="kb-empty-subtitle">
          Choose a document from the Documents tab to view its chunks
        </p>
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="kb-empty">
        <Layers size={40} />
        <p className="kb-empty-title">No chunks found</p>
        <p className="kb-empty-subtitle">
          This document hasn't been chunked yet
        </p>
      </div>
    );
  }

  return (
    <div className="chunks-container">
      <div className="chunks-header">
        <button
          onClick={() => setSelectedDoc(null)}
          className="chunks-back-btn"
        >
          ← Back to Documents
        </button>
        <p className="chunks-title">
          {selectedDoc.title || "Chunks"} ({chunks.length})
        </p>
      </div>

      <div className="chunks-list">
        {chunks.map((chunk, idx) => (
          <ChunkRow
            key={idx}
            chunk={chunk}
            copiedId={copiedId}
            handleCopy={handleCopy}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Chunk Row ───────────────────────────────────────────────────────────────

function ChunkRow({ chunk, copiedId, handleCopy }) {
  return (
    <div className="chunk-row">
      <div className="chunk-content">
        <p className="chunk-text">{chunk.content}</p>
        {chunk.source_url && (
          <p className="chunk-source">
            <span className="chunk-source-label">Source:</span>
            <a
              href={chunk.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="chunk-source-link"
            >
              {chunk.source_url}
            </a>
          </p>
        )}
      </div>

      <div className="chunk-actions">
        <button
          onClick={() => handleCopy(chunk.content, `chunk-${chunk.id}`)}
          className="chunk-copy-btn"
        >
          {copiedId === `chunk-${chunk.id}` ? (
            <Check size={13} className="text-emerald-500" />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>
    </div>
  );
}
