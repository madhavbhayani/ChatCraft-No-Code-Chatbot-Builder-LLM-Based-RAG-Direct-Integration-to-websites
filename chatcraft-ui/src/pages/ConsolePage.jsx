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
  Loader2,
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
import KnowledgeBaseSection from "./KnowledgeBase/KnowledgeBaseSection";
import TestChatSection from "./TestChat/TestChatSection";
import {
  PSGeneral,
  PSLlmModels,
  PSReIntegration,
  PSBehavior,
} from "./ProjectSettings/ProjectSettingsSection";

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
              />
            }
          />
          <Route
            path="test-chat"
            element={
              <TestChatSection
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
