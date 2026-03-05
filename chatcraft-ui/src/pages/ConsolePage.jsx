import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Database,
  MessageSquare,
  FileText,
  Search,
  Send,
  Loader2,
  Bot,
  User,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  Layers,
  Globe,
  Hash,
  Sparkles,
  X,
  Settings,
  ArrowLeft,
  Key,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Edit3,
  Eye,
  Zap,
  Save,
  RotateCcw,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";
import { getSession, isLoggedIn } from "../utils/auth";

const API = "/api/v1";

const NAV_ITEMS = [
  { id: "knowledge", label: "Knowledge Base", icon: Database },
  { id: "chat", label: "Test Chat", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

// ─── Main Console Page ───────────────────────────────────────────────────────

export default function ConsolePage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [activeSection, setActiveSection] = useState("knowledge");

  // Knowledge Base state
  const [documents, setDocuments] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docSearch, setDocSearch] = useState("");
  const [chunkSearch, setChunkSearch] = useState("");
  const [viewMode, setViewMode] = useState("documents");
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Settings state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Model state
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [savingModel, setSavingModel] = useState(false);

  const getToken = useCallback(() => {
    const session = getSession();
    return session?.token || "";
  }, []);

  // Fetch project info + status
  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login");
      return;
    }
    const fetchData = async () => {
      try {
        const [projRes, statusRes] = await Promise.all([
          fetch(`${API}/projects`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
          fetch(`${API}/console/status/${projectId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          }),
        ]);
        const projData = await projRes.json();
        if (projData.project) setProjectName(projData.project.name);
        if (statusRes.ok) setStatusData(await statusRes.json());
      } catch (err) {
        console.error("Failed to fetch project data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [navigate, projectId, getToken]);

  // Sync model from status data
  useEffect(() => {
    if (statusData?.llm_model) setSelectedModel(statusData.llm_model);
  }, [statusData]);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API}/console/documents/${projectId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setDocuments((await res.json()).documents || []);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  }, [projectId, getToken]);

  // Fetch chunks
  const fetchChunks = useCallback(
    async (documentId) => {
      setLoadingChunks(true);
      try {
        let url = `${API}/console/chunks/${projectId}`;
        if (documentId) url += `?document_id=${documentId}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) setChunks((await res.json()).chunks || []);
      } catch (err) {
        console.error("Failed to fetch chunks:", err);
      } finally {
        setLoadingChunks(false);
      }
    },
    [projectId, getToken]
  );

  // Refresh status
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/console/status/${projectId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setStatusData(await res.json());
    } catch {}
  }, [projectId, getToken]);

  useEffect(() => {
    if (!loading) fetchDocuments();
  }, [loading, fetchDocuments]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Chat ────────────────────────────────────

  const handleSendMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || sending) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: msg, timestamp: new Date() },
    ]);
    setChatInput("");
    setSending(true);
    try {
      const res = await fetch(`${API}/console/test-chat/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ session_id: sessionId, message: msg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: data.answer,
          sources: data.sources || [],
          confidence: data.confidence,
          fallback: data.fallback,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: "Sorry, something went wrong. Please try again.",
          error: true,
          timestamp: new Date(),
        },
      ]);
      toast.error(err.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // ─── Settings Handlers ───────────────────────

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch(`${API}/console/settings/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setProjectName(newName.trim());
      setEditingName(false);
      toast.success("Project name updated");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      const res = await fetch(`${API}/console/api-key/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ api_key: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save API key");
      setApiKeyInput("");
      toast.success("API key validated and saved");
      refreshStatus();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingKey(false);
    }
  };

  const handleReCrawl = async () => {
    if (!statusData?.website_url) {
      toast.error("No website URL configured");
      return;
    }
    try {
      const res = await fetch(`${API}/console/crawl/${projectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ url: statusData.website_url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Crawl job started! Go to Setup to monitor progress.");
      navigate(`/console/integrate/${projectId}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReChunk = async () => {
    try {
      const res = await fetch(`${API}/console/chunk/${projectId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.message || "Chunks regenerated");
      refreshStatus();
      fetchDocuments();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReEmbed = async () => {
    try {
      const res = await fetch(`${API}/console/embed/${projectId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Embedding job started! Go to Setup to monitor.");
      navigate(`/console/integrate/${projectId}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteData = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/console/data/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("All project data deleted");
      setConfirmAction(null);
      refreshStatus();
      setDocuments([]);
      setChunks([]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/projects`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Project deleted");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveModel = async (model) => {
    const models = {
      "gemini-2.5-flash": { rpm: 5, tpm: 250000, rpd: 20 },
      "gemma-3-12b-it":   { rpm: 30, tpm: 15000, rpd: 14400 },
      "gemma-3-27b-it":   { rpm: 30, tpm: 15000, rpd: 14400 },
      "gemini-2.0-flash":  { rpm: 5, tpm: 250000, rpd: 20 },
    };
    const limits = models[model];
    if (!limits) return;
    const maxInput = Math.floor(limits.tpm / limits.rpm);

    setSavingModel(true);
    try {
      const res = await fetch(`${API}/console/model/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          model,
          rpm: limits.rpm,
          tpm: limits.tpm,
          rpd: limits.rpd,
          max_input_tokens: maxInput,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setSelectedModel(model);
      toast.success(`Model switched to ${model}`);
      refreshStatus();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingModel(false);
    }
  };

  // Filtered lists
  const filteredDocs = documents.filter(
    (d) =>
      d.title?.toLowerCase().includes(docSearch.toLowerCase()) ||
      d.source_url?.toLowerCase().includes(docSearch.toLowerCase())
  );
  const filteredChunks = chunks.filter((c) =>
    c.content?.toLowerCase().includes(chunkSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 size={32} className="text-crimson animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex animate-slide-in-right">
      {/* ─── Sidebar ─── */}
      <aside className="w-[220px] bg-charcoal text-white flex flex-col shrink-0 sticky top-0 h-screen z-40">
        <div className="px-5 py-5 border-b border-white/10">
          <h1 className="text-lg font-bold tracking-tight">
            Chat<span className="text-crimson">Craft</span>
          </h1>
          <p
            className="text-xs text-gray-400 mt-1 truncate"
            title={projectName}
          >
            {projectName}
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeSection === item.id
                  ? "bg-crimson text-white shadow-lg shadow-crimson/25"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 pb-4 space-y-1">
          <button
            onClick={() => navigate(`/console/integrate/${projectId}`)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition cursor-pointer"
          >
            <Zap size={14} />
            Setup Wizard
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition cursor-pointer"
          >
            <ArrowLeft size={14} />
            Dashboard
          </button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {activeSection === "knowledge" && (
          <KnowledgeBaseSection
            documents={filteredDocs}
            chunks={filteredChunks}
            selectedDoc={selectedDoc}
            setSelectedDoc={(doc) => {
              setSelectedDoc(doc);
              if (doc) {
                fetchChunks(doc.id);
                setViewMode("chunks");
              }
            }}
            docSearch={docSearch}
            setDocSearch={setDocSearch}
            chunkSearch={chunkSearch}
            setChunkSearch={setChunkSearch}
            viewMode={viewMode}
            setViewMode={(mode) => {
              setViewMode(mode);
              if (mode === "chunks" && chunks.length === 0) fetchChunks();
            }}
            loadingDocs={loadingDocs}
            loadingChunks={loadingChunks}
            copiedId={copiedId}
            handleCopy={handleCopy}
            statusData={statusData}
            fetchChunks={fetchChunks}
            setDetailDoc={setDetailDoc}
          />
        )}
        {activeSection === "chat" && (
          <ChatSection
            messages={messages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sending={sending}
            handleSendMessage={handleSendMessage}
            chatEndRef={chatEndRef}
            inputRef={inputRef}
            statusData={statusData}
          />
        )}
        {activeSection === "settings" && (
          <SettingsSection
            projectName={projectName}
            statusData={statusData}
            editingName={editingName}
            setEditingName={(v) => {
              setEditingName(v);
              if (v) setNewName(projectName);
            }}
            newName={newName}
            setNewName={setNewName}
            savingName={savingName}
            handleSaveName={handleSaveName}
            apiKeyInput={apiKeyInput}
            setApiKeyInput={setApiKeyInput}
            savingKey={savingKey}
            handleSaveApiKey={handleSaveApiKey}
            handleReCrawl={handleReCrawl}
            handleReChunk={handleReChunk}
            handleReEmbed={handleReEmbed}
            setConfirmAction={setConfirmAction}
            selectedModel={selectedModel}
            savingModel={savingModel}
            handleSaveModel={handleSaveModel}
          />
        )}
      </main>

      {/* ─── Document Detail Modal ─── */}
      {detailDoc && (
        <DocumentDetailModal
          doc={detailDoc}
          onClose={() => setDetailDoc(null)}
          copiedId={copiedId}
          handleCopy={handleCopy}
        />
      )}

      {/* ─── Confirm Dialog ─── */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          loading={actionLoading}
          onConfirm={
            confirmAction === "delete-data"
              ? handleDeleteData
              : handleDeleteProject
          }
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

// ─── Knowledge Base Section ──────────────────────────────────────────────────

function KnowledgeBaseSection({
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
            statusData?.website_url
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

  // Reset visible count when documents change
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
      {/* Table Header */}
      <div className="grid grid-cols-[1fr_100px_90px_90px_120px] gap-4 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <span>Title / URL</span>
        <span>Type</span>
        <span>Words</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      {/* Rows */}
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
            {/* View full document detail */}
            <button
              onClick={() => setDetailDoc(doc)}
              className="p-1.5 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition cursor-pointer"
              title="View document content"
            >
              <Eye size={14} />
            </button>
            {/* View chunks */}
            <button
              onClick={() => setSelectedDoc(doc)}
              className="p-1.5 rounded-md hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition cursor-pointer"
              title="View chunks"
            >
              <Layers size={14} />
            </button>
            {/* Copy */}
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
            {/* External link */}
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

      {/* Load More */}
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

// ─── Document Detail Modal ───────────────────────────────────────────────────

function DocumentDetailModal({ doc, onClose, copiedId, handleCopy }) {
  // Close on Escape
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
        {/* Header */}
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
            {/* Meta badges */}
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

        {/* Content */}
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

// ─── Chunks View ─────────────────────────────────────────────────────────────

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

  // Reset visible count when chunks data changes
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

          {/* Load More */}
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

// ─── Chat Section ────────────────────────────────────────────────────────────

function ChatSection({
  messages,
  chatInput,
  setChatInput,
  sending,
  handleSendMessage,
  chatEndRef,
  inputRef,
  statusData,
}) {
  const canChat = statusData?.embedded_count > 0 && statusData?.has_api_key;

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
        style={{ maxHeight: "calc(100vh - 140px)" }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-crimson/10 flex items-center justify-center mb-4">
              <Bot size={28} className="text-crimson" />
            </div>
            <h3 className="text-lg font-bold text-charcoal mb-1">
              Test Your Chatbot
            </h3>
            <p className="text-sm text-gray-500 max-w-md">
              Ask questions to test how your chatbot responds using the
              knowledge base. This uses the same RAG pipeline as your embedded
              widget.
            </p>

            {!canChat && (
              <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 max-w-sm">
                {!statusData?.has_api_key
                  ? "Add your Gemini API key first to test the chatbot."
                  : "Embed your chunks first to enable chat testing."}
              </div>
            )}

            {canChat && (
              <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-md">
                {[
                  "What does this website offer?",
                  "Tell me about pricing",
                  "How can I get started?",
                  "What are the main features?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setChatInput(q)}
                    className="text-left text-sm px-4 py-3 border border-gray-200 rounded-lg hover:border-crimson/30 hover:bg-crimson/5 transition-colors text-gray-600 cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}

        {sending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-crimson/10 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-crimson" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1">
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                canChat
                  ? "Ask a question to test your chatbot..."
                  : "Complete setup to test chat"
              }
              disabled={!canChat || sending}
              className="w-full px-4 py-3 pr-12 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!canChat || sending || !chatInput.trim()}
            className="w-11 h-11 rounded-xl bg-crimson text-white flex items-center justify-center hover:bg-rose-pink transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Simple Markdown Renderer ────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return null;

  // Split into lines and process
  const lines = text.split("\n");
  const elements = [];
  let listItems = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-0.5 my-1">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  const processInline = (line) => {
    // Process bold (**text**) and italic (*text*) inline
    const parts = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Italic: *text* (but not **)
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

      let firstMatch = null;
      let matchType = null;

      if (boldMatch && italicMatch) {
        if (boldMatch.index <= italicMatch.index) {
          firstMatch = boldMatch;
          matchType = "bold";
        } else {
          firstMatch = italicMatch;
          matchType = "italic";
        }
      } else if (boldMatch) {
        firstMatch = boldMatch;
        matchType = "bold";
      } else if (italicMatch) {
        firstMatch = italicMatch;
        matchType = "italic";
      }

      if (!firstMatch) {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }

      // Add text before match
      if (firstMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.substring(0, firstMatch.index)}</span>);
      }

      // Add formatted text
      if (matchType === "bold") {
        parts.push(<strong key={key++} className="font-semibold">{firstMatch[1]}</strong>);
      } else {
        parts.push(<em key={key++}>{firstMatch[1]}</em>);
      }

      remaining = remaining.substring(firstMatch.index + firstMatch[0].length);
    }

    return parts;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Bullet list items: - item, * item, • item
    if (/^[-*•]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      listItems.push(<li key={`li-${idx}`} className="text-sm">{processInline(content)}</li>);
      return;
    }

    // Numbered list items: 1. item, 2. item
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^\d+[.)]\s+/, "");
      elements.push(
        <div key={idx} className="flex gap-2 my-0.5">
          <span className="text-gray-400 shrink-0">{trimmed.match(/^\d+[.)]/)[0]}</span>
          <span>{processInline(content)}</span>
        </div>
      );
      return;
    }

    flushList();

    // Empty line = paragraph break
    if (trimmed === "") {
      elements.push(<div key={idx} className="h-2" />);
      return;
    }

    // Regular text
    elements.push(<p key={idx} className="my-0.5">{processInline(trimmed)}</p>);
  });

  flushList();
  return elements;
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isUser ? "bg-charcoal" : "bg-crimson/10"
        }`}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-crimson" />
        )}
      </div>

      <div
        className={`max-w-[75%] ${
          isUser
            ? "bg-charcoal text-white rounded-2xl rounded-tr-sm px-4 py-3"
            : `bg-white border ${
                message.error ? "border-red-200" : "border-gray-200"
              } rounded-2xl rounded-tl-sm px-4 py-3`
        }`}
      >
        <div
          className={`text-sm leading-relaxed ${
            isUser
              ? "text-white"
              : message.error
              ? "text-red-600"
              : "text-gray-800"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            renderMarkdown(message.content)
          )}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium mb-1.5">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition"
                >
                  <ExternalLink size={9} />
                  {new URL(src).pathname.substring(0, 30) || "/"}
                </a>
              ))}
            </div>
          </div>
        )}

        {!isUser && message.confidence !== undefined && message.confidence > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Confidence: {(message.confidence * 100).toFixed(0)}%
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Settings Section ────────────────────────────────────────────────────────

function SettingsSection({
  projectName,
  statusData,
  editingName,
  setEditingName,
  newName,
  setNewName,
  savingName,
  handleSaveName,
  apiKeyInput,
  setApiKeyInput,
  savingKey,
  handleSaveApiKey,
  handleReCrawl,
  handleReChunk,
  handleReEmbed,
  setConfirmAction,
  selectedModel,
  savingModel,
  handleSaveModel,
}) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Project Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage your project configuration, API keys, and data operations.
          </p>
        </div>

        {/* ─── General Settings ─── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Edit3 size={15} />
              General
            </h3>
          </div>
          <div className="p-6 space-y-4">
            {/* Project Name */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Project Name
              </label>
              {editingName ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !newName.trim()}
                    className="px-3 py-2 text-sm font-medium bg-crimson text-white rounded-lg hover:bg-rose-pink transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {savingName ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    Save
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-charcoal border border-gray-200 rounded-lg hover:bg-gray-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-medium text-charcoal">
                    {projectName}
                  </p>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-xs text-gray-500 hover:text-crimson flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={12} />
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Website URL (display only) */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Website URL
              </label>
              <p className="text-sm text-gray-600 mt-2">
                {statusData?.website_url || (
                  <span className="text-gray-400 italic">Not configured</span>
                )}
              </p>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Setup Progress
              </label>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm text-gray-600">
                  Step {statusData?.setup_step || 0} / 4
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-crimson rounded-full transition-all"
                    style={{
                      width: `${
                        ((statusData?.setup_step || 0) / 4) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── API Key ─── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Key size={15} />
              Gemini API Key
            </h3>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  statusData?.has_api_key ? "bg-emerald-500" : "bg-gray-300"
                }`}
              />
              <span className="text-sm text-gray-600">
                {statusData?.has_api_key
                  ? "API key is configured"
                  : "No API key configured"}
              </span>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              {statusData?.has_api_key
                ? "Enter a new key below to replace the existing one. The key will be validated before saving."
                : "Enter your Gemini API key. It will be validated and encrypted before storing."}
            </p>

            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIza..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveApiKey();
                }}
              />
              <button
                onClick={handleSaveApiKey}
                disabled={savingKey || !apiKeyInput.trim()}
                className="px-4 py-2 text-sm font-medium bg-crimson text-white rounded-lg hover:bg-rose-pink transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {savingKey ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Key size={14} />
                )}
                {statusData?.has_api_key ? "Update Key" : "Save Key"}
              </button>
            </div>
          </div>
        </div>

        {/* ─── LLM Models ─── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Cpu size={15} />
              LLM Model
            </h3>
          </div>
          <div className="p-6">
            <p className="text-xs text-gray-500 mb-4">
              Select the AI model for your chatbot responses. Each model has different rate limits.
              Max input tokens per request is calculated as TPM ÷ RPM.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  id: "gemini-2.5-flash",
                  name: "Gemini 2.5 Flash",
                  desc: "Best overall — fast, smart, high limits",
                  rpm: 5, tpm: 250000, rpd: 20,
                },
                {
                  id: "gemini-2.0-flash",
                  name: "Gemini 2.0 Flash",
                  desc: "Previous gen — same limits, slightly faster",
                  rpm: 5, tpm: 250000, rpd: 20,
                },
                {
                  id: "gemma-3-12b-it",
                  name: "Gemma 3 12B",
                  desc: "Open model — high RPM, lower token budget",
                  rpm: 30, tpm: 15000, rpd: 14400,
                },
                {
                  id: "gemma-3-27b-it",
                  name: "Gemma 3 27B",
                  desc: "Larger open model — higher quality, same limits",
                  rpm: 30, tpm: 15000, rpd: 14400,
                },
              ].map((m) => {
                const isSelected = selectedModel === m.id;
                const maxInput = Math.floor(m.tpm / m.rpm);
                return (
                  <button
                    key={m.id}
                    onClick={() => !isSelected && handleSaveModel(m.id)}
                    disabled={savingModel}
                    className={`text-left p-4 border rounded-xl transition-all cursor-pointer disabled:opacity-60 ${
                      isSelected
                        ? "border-crimson bg-crimson/5 ring-1 ring-crimson/20"
                        : "border-gray-200 hover:border-crimson/30 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-charcoal">{m.name}</span>
                      {isSelected && (
                        <span className="text-xs font-medium text-crimson bg-crimson/10 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{m.desc}</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">{m.rpm}</p>
                        <p className="text-[10px] text-gray-400">RPM</p>
                      </div>
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">{(m.tpm / 1000).toFixed(0)}K</p>
                        <p className="text-[10px] text-gray-400">TPM</p>
                      </div>
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">{m.rpd >= 1000 ? `${(m.rpd / 1000).toFixed(1)}K` : m.rpd}</p>
                        <p className="text-[10px] text-gray-400">RPD</p>
                      </div>
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">{(maxInput / 1000).toFixed(0)}K</p>
                        <p className="text-[10px] text-gray-400">Max In</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Rate limits are managed by Google.{" "}
                <a
                  href="https://aistudio.google.com/app/rate-limit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  View your limits →
                </a>
              </p>
              {savingModel && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 size={12} className="animate-spin" />
                  Saving...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Data Operations ─── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <RefreshCw size={15} />
              Data Operations
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs text-gray-500">
              Re-run pipeline stages. Each stage depends on the previous one:
              Crawl → Chunk → Embed.
            </p>

            <div className="grid grid-cols-3 gap-4">
              {/* Re-crawl */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={16} className="text-blue-600" />
                  <h4 className="text-sm font-medium text-charcoal">
                    Re-Crawl
                  </h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Re-crawl the website to pick up new or changed pages.
                </p>
                <button
                  onClick={handleReCrawl}
                  disabled={!statusData?.website_url}
                  className="w-full px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={12} />
                  Re-Crawl Website
                </button>
              </div>

              {/* Re-chunk */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Layers size={16} className="text-purple-600" />
                  <h4 className="text-sm font-medium text-charcoal">
                    Re-Chunk
                  </h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Regenerate chunks from existing documents.
                </p>
                <button
                  onClick={handleReChunk}
                  disabled={!statusData?.document_count}
                  className="w-full px-3 py-2 text-xs font-medium text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={12} />
                  Re-Generate Chunks
                </button>
              </div>

              {/* Re-embed */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-emerald-600" />
                  <h4 className="text-sm font-medium text-charcoal">
                    Re-Embed
                  </h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Re-generate embeddings for all chunks.
                </p>
                <button
                  onClick={handleReEmbed}
                  disabled={!statusData?.chunk_count || !statusData?.has_api_key}
                  className="w-full px-3 py-2 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={12} />
                  Re-Embed Data
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Danger Zone ─── */}
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 bg-red-50/50">
            <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle size={15} />
              Danger Zone
            </h3>
          </div>
          <div className="p-6 space-y-4">
            {/* Delete All Data */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-charcoal">
                  Delete All Data
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Remove all documents, chunks, embeddings, and conversations.
                  The project will be reset to step 0.
                </p>
              </div>
              <button
                onClick={() => setConfirmAction("delete-data")}
                className="px-4 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                <Trash2 size={12} />
                Delete Data
              </button>
            </div>

            {/* Delete Project */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-charcoal">
                  Delete Project
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Permanently delete this project and all associated data. This
                  action cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setConfirmAction("delete-project")}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                <Trash2 size={12} />
                Delete Project
              </button>
            </div>
          </div>
        </div>

        {/* spacer at bottom */}
        <div className="h-8" />
      </div>
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({ action, loading, onConfirm, onCancel }) {
  const isProjectDelete = action === "delete-project";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-charcoal">
              {isProjectDelete ? "Delete Project" : "Delete All Data"}
            </h3>
            <p className="text-xs text-gray-500">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          {isProjectDelete
            ? "This will permanently delete the project and all associated data including documents, chunks, embeddings, and chat history. You will be redirected to the dashboard."
            : "This will delete all documents, chunks, embeddings, crawl jobs, and chat history. The project itself will be kept but reset to initial state."}
        </p>

        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            {isProjectDelete ? "Delete Project" : "Delete All Data"}
          </button>
        </div>
      </div>
    </div>
  );
}
