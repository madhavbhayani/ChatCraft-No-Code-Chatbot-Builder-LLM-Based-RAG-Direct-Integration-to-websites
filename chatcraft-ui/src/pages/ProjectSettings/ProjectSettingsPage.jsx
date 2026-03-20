import { useState, useEffect } from "react";
import {
  Edit3,
  Cpu,
  RefreshCw,
  Key,
  AlertTriangle,
  Trash2,
  Globe,
  Loader2,
  Sparkles,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getSession } from "../../utils/auth";
import "./ProjectSettings.css";

const API = "/api/v1";

export default function ProjectSettingsPage({
  projectId,
  psSubTab,
  projectName,
  statusData,
  editingName,
  setEditingName,
  newName,
  setNewName,
  savingName,
  handleSaveName,
  setConfirmAction,
  selectedModel,
  savingModel,
  handleSaveModel,
  apiKeyInput,
  setApiKeyInput,
  savingKey,
  handleSaveApiKey,
  handleReCrawl,
  handleReEmbed,
  handleReEmbedAll,
  refreshStatus,
}) {
  return (
    <div className="ps-page-container">
      {psSubTab === "general" && (
        <PSGeneral
          projectName={projectName}
          statusData={statusData}
          editingName={editingName}
          setEditingName={setEditingName}
          newName={newName}
          setNewName={setNewName}
          savingName={savingName}
          handleSaveName={handleSaveName}
          setConfirmAction={setConfirmAction}
        />
      )}
      {psSubTab === "llm-models" && (
        <PSLlmModels
          selectedModel={selectedModel}
          savingModel={savingModel}
          handleSaveModel={handleSaveModel}
        />
      )}
      {psSubTab === "re-integration" && (
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
      )}
      {psSubTab === "behavior" && (
        <PSBehavior statusData={statusData} refreshStatus={refreshStatus} projectId={projectId} />
      )}
    </div>
  );
}

// ─── PSGeneral ───────────────────────────────────────────────────────────────

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
    <div className="ps-page-wrapper">
      <div className="ps-page-content">
        <div className="ps-header">
          <h2 className="ps-title">General</h2>
          <p className="ps-subtitle">
            Manage your project name, website URL, and data.
          </p>
        </div>

        {/* Project Name */}
        <div className="ps-card">
          <div className="ps-card-header">
            <h3 className="ps-card-title">
              <Edit3 size={15} />
              Project Details
            </h3>
          </div>
          <div className="ps-card-content">
            <div className="ps-form-group">
              <label className="ps-label">Project Name</label>
              {editingName ? (
                <div className="ps-input-row">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="ps-input"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !newName.trim()}
                    className="ps-btn ps-btn-primary"
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
                    className="ps-btn ps-btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="ps-display-row">
                  <p className="ps-display-value">{projectName}</p>
                  <button
                    onClick={() => setEditingName(true)}
                    className="ps-edit-btn"
                  >
                    <Edit3 size={12} />
                    Edit
                  </button>
                </div>
              )}
            </div>

            <div className="ps-form-group">
              <label className="ps-label">Website URLs</label>
              <div className="ps-urls">
                {statusData?.website_urls && statusData.website_urls.length > 0 ? (
                  <div className="ps-url-list">
                    {statusData.website_urls.map((url, i) => (
                      <p key={i} className="ps-url-item">
                        {url}
                      </p>
                    ))}
                  </div>
                ) : statusData?.website_url ? (
                  <p className="ps-url-item">{statusData.website_url}</p>
                ) : (
                  <p className="ps-url-empty">Not configured</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="ps-card ps-card-danger">
          <div className="ps-card-header ps-card-header-danger">
            <h3 className="ps-card-title ps-card-title-danger">
              <AlertTriangle size={15} />
              Danger Zone
            </h3>
          </div>
          <div className="ps-card-content">
            <div className="ps-danger-action">
              <div>
                <p className="ps-danger-title">Delete All Data</p>
                <p className="ps-danger-description">
                  Remove all documents, chunks, embeddings, and conversations.
                  The project will be reset.
                </p>
              </div>
              <button
                onClick={() => setConfirmAction("delete-data")}
                className="ps-btn ps-btn-danger-secondary"
              >
                <Trash2 size={12} />
                Delete Data
              </button>
            </div>

            <div className="ps-danger-action">
              <div>
                <p className="ps-danger-title">Delete Project</p>
                <p className="ps-danger-description">
                  Permanently delete this project and all associated data. This
                  action cannot be undone.
                </p>
              </div>
              <button
                onClick={() => setConfirmAction("delete-project")}
                className="ps-btn ps-btn-danger-primary"
              >
                <Trash2 size={12} />
                Delete Project
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PSLlmModels ─────────────────────────────────────────────────────────────

function PSLlmModels({ selectedModel, savingModel, handleSaveModel }) {
  return (
    <div className="ps-page-wrapper">
      <div className="ps-page-content">
        <div className="ps-header">
          <h2 className="ps-title">LLM Models</h2>
          <p className="ps-subtitle">
            Select the AI model powering your chatbot responses. Each model has
            different rate limits managed by Google.
          </p>
        </div>

        <div className="ps-card">
          <div className="ps-card-header">
            <h3 className="ps-card-title">
              <Cpu size={15} />
              Choose Model
            </h3>
          </div>
          <div className="ps-card-content">
            <p className="ps-model-info">
              Max input tokens per request is automatically calculated as TPM
              ÷ RPM. This determines how much context your chatbot can
              process per question.
            </p>

            <div className="ps-models-grid">
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
                    className={`ps-model-card ${isSelected ? "ps-model-card-active" : ""}`}
                  >
                    <div className="ps-model-header">
                      <span className="ps-model-name">{m.name}</span>
                      {isSelected && (
                        <span className="ps-model-badge">Active</span>
                      )}
                    </div>
                    <p className="ps-model-desc">{m.desc}</p>
                    <div className="ps-model-specs">
                      <div className="ps-model-spec">
                        <p className="ps-model-spec-value">{m.rpm}</p>
                        <p className="ps-model-spec-label">RPM</p>
                      </div>
                      <div className="ps-model-spec">
                        <p className="ps-model-spec-value">
                          {(m.tpm / 1000).toFixed(0)}K
                        </p>
                        <p className="ps-model-spec-label">TPM</p>
                      </div>
                      <div className="ps-model-spec">
                        <p className="ps-model-spec-value">
                          {m.rpd >= 1000
                            ? `${(m.rpd / 1000).toFixed(1)}K`
                            : m.rpd}
                        </p>
                        <p className="ps-model-spec-label">RPD</p>
                      </div>
                      <div className="ps-model-spec">
                        <p className="ps-model-spec-value">
                          {(maxInput / 1000).toFixed(0)}K
                        </p>
                        <p className="ps-model-spec-label">Max In</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="ps-model-footer">
              <p className="ps-model-footer-text">
                Rate limits are managed by Google.{" "}
                <a
                  href="https://aistudio.google.com/app/rate-limit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ps-link"
                >
                  View your limits
                </a>
              </p>
              {savingModel && (
                <div className="ps-model-loading">
                  <Loader2 size={12} className="animate-spin" />
                  Saving...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PSReIntegration ──────────────────────────────────────────────────────────

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
    <div className="ps-page-wrapper">
      <div className="ps-page-content">
        <div className="ps-header">
          <h2 className="ps-title">Re-Integration</h2>
          <p className="ps-subtitle">
            Update your API key or re-run pipeline stages to refresh your
            chatbot's knowledge.
          </p>
        </div>

        {/* API Key */}
        <div className="ps-card">
          <div className="ps-card-header">
            <h3 className="ps-card-title">
              <Key size={15} />
              Gemini API Key
            </h3>
          </div>
          <div className="ps-card-content">
            <div className="ps-api-status">
              <span
                className={`ps-api-indicator ${
                  statusData?.has_api_key ? "ps-api-active" : "ps-api-inactive"
                }`}
              />
              <span className="ps-api-text">
                {statusData?.has_api_key
                  ? "API key is configured"
                  : "No API key configured"}
              </span>
            </div>

            <p className="ps-api-helper">
              {statusData?.has_api_key
                ? "Enter a new key below to replace the existing one. The key will be validated before saving."
                : "Enter your Gemini API key. It will be validated and encrypted before storing."}
            </p>

            <div className="ps-input-row">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIza..."
                className="ps-input ps-input-monospace"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveApiKey();
                }}
              />
              <button
                onClick={handleSaveApiKey}
                disabled={savingKey || !apiKeyInput.trim()}
                className="ps-btn ps-btn-primary"
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
        <div className="ps-card">
          <div className="ps-card-header">
            <h3 className="ps-card-title">
              <RefreshCw size={15} />
              Data Pipeline
            </h3>
          </div>
          <div className="ps-card-content-large">
            <p className="ps-pipeline-info">
              Re-run pipeline stages to refresh your chatbot's knowledge: Crawl
              → Embed.
            </p>

            <div className="ps-operations-grid">
              <div className="ps-operation-card">
                <div className="ps-operation-header">
                  <Globe size={16} className="ps-operation-icon ps-operation-icon-primary" />
                  <h4 className="ps-operation-title">Re-Crawl</h4>
                </div>
                <p className="ps-operation-desc">
                  Re-crawl the website to pick up new or changed pages.
                </p>
                <button
                  onClick={handleReCrawl}
                  disabled={!statusData?.website_urls?.length && !statusData?.website_url}
                  className="ps-btn ps-operation-btn ps-operation-btn-primary"
                >
                  <RotateCcw size={12} />
                  Re-Crawl Website
                </button>
              </div>

              <div className="ps-operation-card">
                <div className="ps-operation-header">
                  <Sparkles size={16} className="ps-operation-icon ps-operation-icon-success" />
                  <h4 className="ps-operation-title">Embed Pending</h4>
                </div>
                <p className="ps-operation-desc">
                  Embed only chunks that don't have embeddings yet.
                  {statusData?.pending_chunks > 0 && (
                    <span className="ps-operation-count">
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
                  className="ps-btn ps-operation-btn ps-operation-btn-success"
                >
                  <Sparkles size={12} />
                  Embed Pending Data
                </button>
              </div>

              <div className="ps-operation-card ps-operation-card-warning">
                <div className="ps-operation-header">
                  <RotateCcw size={16} className="ps-operation-icon ps-operation-icon-warning" />
                  <h4 className="ps-operation-title">Re-Embed All</h4>
                </div>
                <p className="ps-operation-desc">
                  Clear all embeddings and re-generate from scratch.
                </p>
                <button
                  onClick={handleReEmbedAll}
                  disabled={
                    !statusData?.chunk_count || !statusData?.has_api_key
                  }
                  className="ps-btn ps-operation-btn ps-operation-btn-warning"
                >
                  <RotateCcw size={12} />
                  Re-Embed All Data
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PSBehavior ──────────────────────────────────────────────────────────────

function PSBehavior({ statusData, refreshStatus, projectId }) {
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

  const getToken = () => getSession()?.sessionToken || getSession()?.token || "";

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
    <div className="ps-page-wrapper">
      <div className="ps-page-content">
        <div className="ps-header">
          <h2 className="ps-title">Chatbot Behavior</h2>
          <p className="ps-subtitle">
            Configure the fallback response and what contact details should be shown
            when the chatbot cannot answer from the knowledge base.
          </p>
        </div>

        <div className="ps-card">
          <div className="ps-card-header">
            <h3 className="ps-card-title">
              <Sparkles size={15} />
              Fallback Configuration
            </h3>
          </div>

          <div className="ps-card-content-large">
            <div className="ps-toggle-group">
              <div>
                <p className="ps-toggle-label">Enable fallback response</p>
                <p className="ps-toggle-description">
                  When disabled, Gemini will generate a generic fallback message.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFallbackEnabled((v) => !v)}
                className={`ps-toggle ${fallbackEnabled ? "ps-toggle-active" : ""}`}
              >
                <span className={`ps-toggle-thumb ${fallbackEnabled ? "ps-toggle-thumb-active" : ""}`} />
              </button>
            </div>

            <div className="ps-form-group">
              <label className="ps-label">Fallback Message</label>
              <textarea
                value={fallbackText}
                onChange={(e) => setFallbackText(e.target.value)}
                rows={4}
                className="ps-textarea"
                placeholder="I don't have that information in my knowledge base. Please contact support."
              />
            </div>

            <div className="ps-form-group">
              <label className="ps-label">Custom Contact Fields</label>
              <p className="ps-field-helper">
                Add values like Email, Contact Number, WhatsApp, or Support URL.
              </p>

              <div className="ps-input-row">
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
                  className="ps-input"
                  placeholder="support@example.com"
                />
                <button
                  type="button"
                  onClick={addCustomField}
                  className="ps-btn ps-btn-primary"
                >
                  Add
                </button>
              </div>

              {customFields.length > 0 && (
                <div className="ps-fields-list">
                  {customFields.map((field) => (
                    <span key={field} className="ps-field-tag">
                      {field}
                      <button
                        type="button"
                        onClick={() => removeCustomField(field)}
                        className="ps-field-tag-close"
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
              className="ps-btn ps-btn-block ps-btn-primary"
            >
              {savingBehavior ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save Behavior Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
