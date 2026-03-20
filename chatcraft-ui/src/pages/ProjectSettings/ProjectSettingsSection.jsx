import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Edit3,
  Loader2,
  Save,
  AlertTriangle,
  Trash2,
  Cpu,
  Key,
  RefreshCw,
  Globe,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getSession } from "../../utils/auth";

const API = "/api/v1";

// ─── Project Settings: General ───────────────────────────────────────────────

export function PSGeneral({
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

export function PSLlmModels({ selectedModel, savingModel, handleSaveModel }) {
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

export function PSReIntegration({
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

export function PSBehavior({ statusData, refreshStatus }) {
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
