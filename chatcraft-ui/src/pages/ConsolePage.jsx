import { useState, useEffect, useRef, useCallback } from "react";
import {
  useNavigate,
  useParams,
  useLocation,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
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
  FolderCog,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { getSession, isLoggedIn } from "../utils/auth";

const API = "/api/v1";

// ─── Main Console Page ───────────────────────────────────────────────────────

export default function ConsolePage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");

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

  // Project Settings dropdown
  const [psOpen, setPsOpen] = useState(false);

  const getIntegrateStepSlug = useCallback((status) => {
    if (!status) return "api_key";
    const pendingCount =
      status.pending_chunks ?? (status.chunk_count - status.embedded_count);
    if (status.setup_step >= 2 && pendingCount > 0) return "embed";
    if (status.setup_step < 1) return "api_key";
    if (status.setup_step < 2) return "crawl_upload";
    return "embed";
  }, []);

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
        if (statusRes.ok) {
          const status = await statusRes.json();
          setStatusData(status);
          // Redirect incomplete setups only once per project for better UX.
          if (status.setup_step < 3) {
            const redirectKey = `chatcraft.setup.redirected.${projectId}`;
            if (!localStorage.getItem(redirectKey)) {
              localStorage.setItem(redirectKey, "1");
              navigate(
                `/console/integrate/${projectId}/${getIntegrateStepSlug(status)}`,
                { replace: true }
              );
              return;
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch project data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [navigate, projectId, getToken, getIntegrateStepSlug]);

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

  // Determine active section from URL path
  const pathAfterProject = location.pathname.replace(
    `/console/${projectId}`,
    ""
  );
  const activeSection = pathAfterProject.startsWith("/project-settings")
    ? "project-settings"
    : pathAfterProject === "/test-chat"
    ? "chat"
    : "knowledge";

  // Project settings sub-tab from path
  const psSubTab = pathAfterProject.startsWith("/project-settings/")
    ? pathAfterProject.replace("/project-settings/", "")
    : "general";

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
    const urls = statusData?.website_urls;
    const legacyUrl = statusData?.website_url;
    if ((!urls || urls.length === 0) && !legacyUrl) {
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
        body: JSON.stringify(urls && urls.length > 0 ? { urls } : { url: legacyUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Crawl job started! Go to Setup to monitor progress.");
      navigate(`/console/integrate/${projectId}/crawl_upload`);
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
      navigate(`/console/integrate/${projectId}/embed`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReEmbedAll = async () => {
    try {
      const res = await fetch(`${API}/console/re-embed/${projectId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Re-embedding all chunks! Go to Setup to monitor.");
      navigate(`/console/integrate/${projectId}/embed`);
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
          {/* Knowledge Base */}
          <button
            onClick={() =>
              navigate(`/console/${projectId}/knowledge-base`)
            }
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeSection === "knowledge"
                ? "bg-crimson text-white shadow-lg shadow-crimson/25"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Database size={17} />
            Knowledge Base
          </button>

          {/* Test Chat */}
          <button
            onClick={() => navigate(`/console/${projectId}/test-chat`)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeSection === "chat"
                ? "bg-crimson text-white shadow-lg shadow-crimson/25"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <MessageSquare size={17} />
            Test Chat
          </button>

          {/* Project Settings with dropdown */}
          <div>
            <button
              onClick={() => {
                setPsOpen(!psOpen);
                if (!pathAfterProject.startsWith("/project-settings")) {
                  navigate(
                    `/console/${projectId}/project-settings/general`
                  );
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeSection === "project-settings"
                  ? "bg-crimson text-white shadow-lg shadow-crimson/25"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="flex items-center gap-3">
                <FolderCog size={17} />
                Project Settings
              </span>
              <ChevronDown
                size={14}
                className={`transition-transform ${
                  psOpen || activeSection === "project-settings"
                    ? "rotate-180"
                    : ""
                }`}
              />
            </button>

            {(psOpen || activeSection === "project-settings") && (
              <div className="ml-8 mt-1 space-y-0.5">
                {[
                  { id: "general", label: "General", icon: Edit3 },
                  { id: "llm-models", label: "LLM Models", icon: Cpu },
                  {
                    id: "re-integration",
                    label: "Re-Integration",
                    icon: RefreshCw,
                  },
                  {
                    id: "behavior",
                    label: "Chatbot Behavior",
                    icon: Sparkles,
                  },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() =>
                      navigate(
                        `/console/${projectId}/project-settings/${sub.id}`
                      )
                    }
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                      psSubTab === sub.id
                        ? "text-white bg-white/10"
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    }`}
                  >
                    <sub.icon size={13} />
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="px-3 pb-4 space-y-1">
          <button
            onClick={() =>
              navigate(
                `/console/integrate/${projectId}/${getIntegrateStepSlug(statusData)}`
              )
            }
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition cursor-pointer"
          >
            <Zap size={14} />
            Setup Wizard
          </button>
          <button
            onClick={() => navigate("/account")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition cursor-pointer"
          >
            <Settings size={14} />
            Settings
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
        <Routes>
          <Route
            path="knowledge-base"
            element={
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
            }
          />
          <Route
            path="test-chat"
            element={
              <ChatSection
                messages={messages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                sending={sending}
                handleSendMessage={handleSendMessage}
                chatEndRef={chatEndRef}
                inputRef={inputRef}
                statusData={statusData}
                projectName={projectName}
              />
            }
          />
          <Route
            path="project-settings/general"
            element={
              <PSGeneral
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
                setConfirmAction={setConfirmAction}
              />
            }
          />
          <Route
            path="project-settings/llm-models"
            element={
              <PSLlmModels
                selectedModel={selectedModel}
                savingModel={savingModel}
                handleSaveModel={handleSaveModel}
              />
            }
          />
          <Route
            path="project-settings/re-integration"
            element={
              <PSReIntegration
                statusData={statusData}
                apiKeyInput={apiKeyInput}
                setApiKeyInput={setApiKeyInput}
                savingKey={savingKey}
                handleSaveApiKey={handleSaveApiKey}
                handleReCrawl={handleReCrawl}
                handleReEmbed={handleReEmbed}
                handleReEmbedAll={handleReEmbedAll}
              />
            }
          />
          <Route
            path="project-settings/behavior"
            element={
              <PSBehavior
                statusData={statusData}
                refreshStatus={refreshStatus}
              />
            }
          />
          <Route
            path="project-settings"
            element={
              <Navigate
                to={`/console/${projectId}/project-settings/general`}
                replace
              />
            }
          />
          <Route
            path="*"
            element={
              <Navigate
                to={`/console/${projectId}/knowledge-base`}
                replace
              />
            }
          />
        </Routes>
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
  projectName,
}) {
  const canChat = statusData?.embedded_count > 0 && statusData?.has_api_key;

  return (
    <div className="flex-1 flex flex-col bg-[#F9FAFB]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-lg font-bold text-charcoal">Test Chat</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Preview how your chatbot responds using the{" "}
            <span className="font-medium text-charcoal">{projectName}</span>{" "}
            knowledge base
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-crimson/10 flex items-center justify-center mb-5">
                <Bot size={26} className="text-crimson" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">
                Ready to chat
              </h3>
              <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
                {canChat
                  ? "Type a message below to test your chatbot. Responses are generated using your embedded knowledge base."
                  : !statusData?.has_api_key
                  ? "Add your Gemini API key in Project Settings to enable chat."
                  : "Embed your chunks first to enable chat. Go to Setup Wizard to complete the pipeline."}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble key={idx} message={msg} />
          ))}

          {sending && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-crimson/10 flex items-center justify-center shrink-0">
                <Bot size={15} className="text-crimson" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-8 py-5">
          <div className="flex items-center gap-3">
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
                    ? "Type your message..."
                    : "Complete setup to enable chat"
                }
                disabled={!canChat || sending}
                className="w-full px-5 py-3.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40 transition placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!canChat || sending || !chatInput.trim()}
              className="w-12 h-12 rounded-xl bg-crimson text-white flex items-center justify-center hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Responses are generated using your knowledge base via RAG pipeline
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Simple Markdown Renderer ────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let listItems = [];
  let listKey = 0;
  let tableKey = 0;

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

  const renderInline = (line) => {
    const parts = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      const linkMatch = remaining.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Italic: *text* (but not **)
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

      let firstMatch = null;
      let matchType = null;
      let firstIndex = Infinity;

      if (linkMatch && linkMatch.index < firstIndex) {
        firstMatch = linkMatch;
        matchType = "link";
        firstIndex = linkMatch.index;
      }
      if (boldMatch && boldMatch.index < firstIndex) {
        firstMatch = boldMatch;
        matchType = "bold";
        firstIndex = boldMatch.index;
      }
      if (italicMatch && italicMatch.index < firstIndex) {
        firstMatch = italicMatch;
        matchType = "italic";
        firstIndex = italicMatch.index;
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
      if (matchType === "link") {
        const label = firstMatch[1];
        const href = firstMatch[2];
        parts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
          >
            {label}
            <ExternalLink size={10} />
          </a>
        );
      } else if (matchType === "bold") {
        parts.push(<strong key={key++} className="font-semibold">{firstMatch[1]}</strong>);
      } else {
        parts.push(<em key={key++}>{firstMatch[1]}</em>);
      }

      remaining = remaining.substring(firstMatch.index + firstMatch[0].length);
    }

    return parts;
  };

  const splitTableCells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const isTableDivider = (line) =>
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const trimmed = line.trim();

    // Markdown table block
    if (
      idx + 1 < lines.length &&
      line.includes("|") &&
      isTableDivider(lines[idx + 1])
    ) {
      flushList();

      const headers = splitTableCells(line).slice(0, 5);
      const rows = [];
      idx += 2; // skip header + separator

      while (idx < lines.length) {
        const rowLine = lines[idx];
        if (!rowLine.includes("|") || rowLine.trim() === "") {
          break;
        }
        const cells = splitTableCells(rowLine).slice(0, 5);
        if (cells.length >= 2 && rows.length < 5) {
          rows.push(cells);
        }
        idx += 1;
      }
      idx -= 1;

      if (headers.length >= 2 && rows.length >= 1) {
        elements.push(
          <div key={`table-wrap-${tableKey}`} className="my-3 overflow-x-auto">
            <table className="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  {headers.map((h, hIdx) => (
                    <th
                      key={`th-${tableKey}-${hIdx}`}
                      className="px-3 py-2 border-b border-gray-200 text-left font-semibold text-gray-700"
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={`tr-${tableKey}-${rIdx}`} className="bg-white even:bg-gray-50/40">
                    {headers.map((_, cIdx) => (
                      <td
                        key={`td-${tableKey}-${rIdx}-${cIdx}`}
                        className="px-3 py-2 border-b border-gray-100 align-top"
                      >
                        {renderInline(row[cIdx] || "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableKey += 1;
      }

      continue;
    }

    // Bullet list items: - item, * item, • item
    if (/^[-*•]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      listItems.push(<li key={`li-${idx}`} className="text-sm">{renderInline(content)}</li>);
      continue;
    }

    // Numbered list items: 1. item, 2. item
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^\d+[.)]\s+/, "");
      elements.push(
        <div key={idx} className="flex gap-2 my-0.5">
          <span className="text-gray-400 shrink-0">{trimmed.match(/^\d+[.)]/)[0]}</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      continue;
    }

    flushList();

    // Empty line = paragraph break
    if (trimmed === "") {
      elements.push(<div key={idx} className="h-2" />);
      continue;
    }

    // Regular text
    elements.push(<p key={idx} className="my-0.5">{renderInline(trimmed)}</p>);
  }

  flushList();
  return elements;
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-charcoal" : "bg-crimson/10"
        }`}
      >
        {isUser ? (
          <User size={15} className="text-white" />
        ) : (
          <Bot size={15} className="text-crimson" />
        )}
      </div>

      <div
        className={`max-w-[75%] ${
          isUser
            ? "bg-charcoal text-white rounded-2xl rounded-tr-sm px-4 py-3"
            : `bg-white border ${
                message.error ? "border-red-200" : "border-gray-200"
              } rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm`
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
        {!isUser && message.confidence !== undefined && message.confidence > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Confidence: {(message.confidence * 100).toFixed(0)}%
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Project Settings: General ───────────────────────────────────────────────

function PSGeneral({
  projectName,
  statusData,
  editingName,
  setEditingName,
  newName,
  setNewName,
  savingName,
  handleSaveName,
  setConfirmAction,
}) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">General</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage your project name, website URL, and data.
          </p>
        </div>

        {/* Project Name */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Edit3 size={15} />
              Project Details
            </h3>
          </div>
          <div className="p-6 space-y-4">
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

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Website URLs
              </label>
              <div className="mt-2">
                {statusData?.website_urls && statusData.website_urls.length > 0 ? (
                  <div className="space-y-1">
                    {statusData.website_urls.map((url, i) => (
                      <p key={i} className="text-sm text-gray-600">{url}</p>
                    ))}
                  </div>
                ) : statusData?.website_url ? (
                  <p className="text-sm text-gray-600">{statusData.website_url}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">Not configured</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 bg-red-50/50">
            <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle size={15} />
              Danger Zone
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-charcoal">
                  Delete All Data
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Remove all documents, chunks, embeddings, and conversations.
                  The project will be reset.
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

        <div className="h-8" />
      </div>
    </div>
  );
}

// ─── Project Settings: LLM Models ────────────────────────────────────────────

function PSLlmModels({ selectedModel, savingModel, handleSaveModel }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">LLM Models</h2>
          <p className="text-sm text-gray-500 mt-1">
            Select the AI model powering your chatbot responses. Each model has
            different rate limits managed by Google.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Cpu size={15} />
              Choose Model
            </h3>
          </div>
          <div className="p-6">
            <p className="text-xs text-gray-500 mb-5">
              Max input tokens per request is automatically calculated as TPM
              ÷ RPM. This determines how much context your chatbot can
              process per question.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  id: "gemini-2.5-flash",
                  name: "Gemini 2.5 Flash",
                  desc: "Best overall — fast, smart, high limits",
                  rpm: 5,
                  tpm: 250000,
                  rpd: 20,
                },
                {
                  id: "gemini-2.0-flash",
                  name: "Gemini 2.0 Flash",
                  desc: "Previous gen — same limits, slightly faster",
                  rpm: 5,
                  tpm: 250000,
                  rpd: 20,
                },
                {
                  id: "gemma-3-12b-it",
                  name: "Gemma 3 12B",
                  desc: "Open model — high RPM, lower token budget",
                  rpm: 30,
                  tpm: 15000,
                  rpd: 14400,
                },
                {
                  id: "gemma-3-27b-it",
                  name: "Gemma 3 27B",
                  desc: "Larger open model — higher quality, same limits",
                  rpm: 30,
                  tpm: 15000,
                  rpd: 14400,
                },
              ].map((m) => {
                const isSelected = selectedModel === m.id;
                const maxInput = Math.floor(m.tpm / m.rpm);
                return (
                  <button
                    key={m.id}
                    onClick={() => !isSelected && handleSaveModel(m.id)}
                    disabled={savingModel}
                    className={`text-left p-5 border rounded-xl transition-all cursor-pointer disabled:opacity-60 ${
                      isSelected
                        ? "border-crimson bg-crimson/5 ring-1 ring-crimson/20"
                        : "border-gray-200 hover:border-crimson/30 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-charcoal">
                        {m.name}
                      </span>
                      {isSelected && (
                        <span className="text-xs font-medium text-crimson bg-crimson/10 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{m.desc}</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">
                          {m.rpm}
                        </p>
                        <p className="text-[10px] text-gray-400">RPM</p>
                      </div>
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">
                          {(m.tpm / 1000).toFixed(0)}K
                        </p>
                        <p className="text-[10px] text-gray-400">TPM</p>
                      </div>
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">
                          {m.rpd >= 1000
                            ? `${(m.rpd / 1000).toFixed(1)}K`
                            : m.rpd}
                        </p>
                        <p className="text-[10px] text-gray-400">RPD</p>
                      </div>
                      <div className="bg-gray-50 rounded-md px-2 py-1.5">
                        <p className="text-xs font-bold text-charcoal">
                          {(maxInput / 1000).toFixed(0)}K
                        </p>
                        <p className="text-[10px] text-gray-400">Max In</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Rate limits are managed by Google.{" "}
                <a
                  href="https://aistudio.google.com/app/rate-limit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  View your limits
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

        <div className="h-8" />
      </div>
    </div>
  );
}

// ─── Project Settings: Re-Integration ────────────────────────────────────────

function PSReIntegration({
  statusData,
  apiKeyInput,
  setApiKeyInput,
  savingKey,
  handleSaveApiKey,
  handleReCrawl,
  handleReEmbed,
  handleReEmbedAll,
}) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Re-Integration</h2>
          <p className="text-sm text-gray-500 mt-1">
            Update your API key or re-run pipeline stages to refresh your
            chatbot's knowledge.
          </p>
        </div>

        {/* API Key */}
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

        {/* Data Operations */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <RefreshCw size={15} />
              Data Pipeline
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs text-gray-500">
              Re-run pipeline stages to refresh your chatbot's knowledge: Crawl
              → Embed.
            </p>

            <div className="grid grid-cols-3 gap-4">
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
                  disabled={!statusData?.website_urls?.length && !statusData?.website_url}
                  className="w-full px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={12} />
                  Re-Crawl Website
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-emerald-600" />
                  <h4 className="text-sm font-medium text-charcoal">
                    Embed Pending
                  </h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Embed only chunks that don't have embeddings yet.
                  {statusData?.pending_chunks > 0 && (
                    <span className="text-emerald-600 font-medium">
                      {" "}
                      {statusData.pending_chunks} pending.
                    </span>
                  )}
                </p>
                <button
                  onClick={handleReEmbed}
                  disabled={
                    !(statusData?.pending_chunks > 0) ||
                    !statusData?.has_api_key
                  }
                  className="w-full px-3 py-2 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={12} />
                  Embed Pending Data
                </button>
              </div>

              <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/30">
                <div className="flex items-center gap-2 mb-2">
                  <RotateCcw size={16} className="text-amber-600" />
                  <h4 className="text-sm font-medium text-charcoal">
                    Re-Embed All
                  </h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Clear all embeddings and re-generate from scratch.
                </p>
                <button
                  onClick={handleReEmbedAll}
                  disabled={
                    !statusData?.chunk_count || !statusData?.has_api_key
                  }
                  className="w-full px-3 py-2 text-xs font-medium text-amber-600 border border-amber-300 rounded-lg hover:bg-amber-100 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={12} />
                  Re-Embed All Data
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}

// ─── Project Settings: Chatbot Behavior ─────────────────────────────────────

function PSBehavior({ statusData, refreshStatus }) {
  const { projectId } = useParams();
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [fallbackText, setFallbackText] = useState(
    "I don't have that information in my knowledge base. Please contact support."
  );
  const [customFields, setCustomFields] = useState([]);
  const [newField, setNewField] = useState("");
  const [savingBehavior, setSavingBehavior] = useState(false);

  useEffect(() => {
    setFallbackEnabled(statusData?.fallback_response_enabled ?? true);
    setFallbackText(
      statusData?.fallback_response_text ||
        "I don't have that information in my knowledge base. Please contact support."
    );
    setCustomFields(
      Array.isArray(statusData?.custom_fallback_fields)
        ? statusData.custom_fallback_fields.filter(
            (f) => typeof f === "string" && f.trim()
          )
        : []
    );
  }, [statusData]);

  const getToken = () => getSession()?.token || "";

  const addCustomField = () => {
    const field = newField.trim();
    if (!field) return;
    if (customFields.includes(field)) {
      setNewField("");
      return;
    }
    setCustomFields((prev) => [...prev, field]);
    setNewField("");
  };

  const removeCustomField = (field) => {
    setCustomFields((prev) => prev.filter((f) => f !== field));
  };

  const handleSaveBehavior = async () => {
    setSavingBehavior(true);
    try {
      const res = await fetch(`${API}/console/settings/behavior/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          fallback_response_enabled: fallbackEnabled,
          fallback_response_text: fallbackText.trim(),
          custom_fallback_fields: customFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save behavior settings");
      toast.success("Chatbot behavior updated");
      refreshStatus?.();
    } catch (err) {
      toast.error(err.message || "Failed to save behavior settings");
    } finally {
      setSavingBehavior(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Chatbot Behavior</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure the fallback response and what contact details should be shown
            when the chatbot cannot answer from the knowledge base.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Sparkles size={15} />
              Fallback Configuration
            </h3>
          </div>

          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-charcoal">Enable fallback response</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When disabled, Gemini will generate a generic fallback message.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFallbackEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  fallbackEnabled ? "bg-crimson" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    fallbackEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fallback Message
              </label>
              <textarea
                value={fallbackText}
                onChange={(e) => setFallbackText(e.target.value)}
                rows={4}
                className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40 resize-none"
                placeholder="I don't have that information in my knowledge base. Please contact support."
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Custom Contact Fields
              </label>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                Add values like Email, Contact Number, WhatsApp, or Support URL.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newField}
                  onChange={(e) => setNewField(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomField();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40"
                  placeholder="support@example.com"
                />
                <button
                  type="button"
                  onClick={addCustomField}
                  className="px-3 py-2 text-sm font-medium text-white bg-crimson rounded-lg hover:bg-rose-pink transition cursor-pointer"
                >
                  Add
                </button>
              </div>

              {customFields.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
                    >
                      {field}
                      <button
                        type="button"
                        onClick={() => removeCustomField(field)}
                        className="text-blue-700 hover:text-blue-900"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveBehavior}
              disabled={savingBehavior}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-crimson rounded-lg hover:bg-rose-pink transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {savingBehavior ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Behavior Settings
            </button>
          </div>
        </div>
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
