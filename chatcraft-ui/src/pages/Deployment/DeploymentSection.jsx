import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Rocket, Loader2, Copy, Check, Code2, Hash } from "lucide-react";
import { toast } from "sonner";
import { getSession } from "../../utils/auth";
import { API_BASE, apiUrl } from "../../utils/api";

const API = apiUrl("/api/v1");

export default function DeploymentSection() {
  const { projectId } = useParams();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deployState, setDeployState] = useState("draft");
  const [copied, setCopied] = useState(false);

  const token = getSession()?.token || "";

  useEffect(() => {
    const fetchDeploymentStatus = async () => {
      if (!projectId || !token) {
        setLoadingStatus(false);
        return;
      }

      try {
        const res = await fetch(`${API}/console/deploy/${projectId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to fetch deployment status");
        }
        setDeployState(data?.deployed ? "deployed" : "draft");
      } catch (err) {
        toast.error(err.message || "Failed to fetch deployment status");
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchDeploymentStatus();
  }, [projectId, token]);

  const scriptTag = projectId
    ? `<script src="${apiUrl(`/api/v1/embed/script.js?project_id=${projectId}`)}" data-project-id="${projectId}" defer></script>`
    : "";

  const copyScriptTag = async () => {
    if (!scriptTag) return;
    try {
      await navigator.clipboard.writeText(scriptTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Script tag copied");
    } catch {
      toast.error("Failed to copy script tag");
    }
  };

  const updateDeployState = async (deployed) => {
    if (!projectId) {
      toast.error("Project ID not found");
      return;
    }
    if (!token) {
      toast.error("Session expired. Please log in again.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/console/deploy/${projectId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deployed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update deployment state");
      }

      setDeployState(data?.deployed ? "deployed" : "draft");
      toast.success(data?.deployed ? "Bot marked as deployed" : "Bot moved to draft");
    } catch (err) {
      toast.error(err.message || "Failed to update deployment state");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Deployment</h2>
          <p className="text-sm text-gray-500 mt-1">
            Deploy your bot and integrate it with a single script tag. The widget automatically renders a circular launcher at the bottom-right, shows your chatbot name in black, and opens a compact chat window on click.
          </p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Rocket size={15} />
              Bot Deployment State
            </h3>
          </div>

          <div className="p-6 space-y-4">
            {loadingStatus ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin text-crimson" />
                Loading deployment status...
              </div>
            ) : (
              <p className="text-sm text-charcoal">
                Current state: <strong>{deployState}</strong>
              </p>
            )}

            <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Hash size={14} className="text-gray-500" />
              <span className="font-medium">Project ID:</span>
              <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-700">
                {projectId || "-"}
              </code>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateDeployState(true)}
                disabled={submitting}
                className="inline-flex items-center gap-2 bg-charcoal text-white px-4 py-2 rounded-lg hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                Mark Deployed
              </button>

              <button
                type="button"
                onClick={() => updateDeployState(false)}
                disabled={submitting}
                className="inline-flex items-center gap-2 bg-white text-charcoal border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                Move To Draft
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <Code2 size={15} />
              Option 1: Script Tag Embed
            </h3>
          </div>

          <div className="p-6 space-y-5">
            <p className="text-sm text-gray-600">
              Paste this script tag in your website HTML (before <code>&lt;/body&gt;</code>). It auto-initializes the chatbot widget with your deployed settings.
            </p>
            {/* <p className="text-xs text-gray-500">
              Backend host: <span className="font-mono">{API_BASE}</span>
            </p> */}

            <div className="rounded-xl border border-gray-200 bg-[#0B1020] p-4">
              <pre className="text-xs leading-relaxed text-[#F8FAFC] whitespace-pre-wrap break-all">
                {scriptTag || "Project ID required to generate script tag"}
              </pre>
            </div>

            <button
              type="button"
              onClick={copyScriptTag}
              disabled={!scriptTag || deployState !== "deployed"}
              className="inline-flex items-center gap-2 bg-charcoal text-white px-4 py-2 rounded-lg hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy Script Tag"}
            </button>

            {deployState !== "deployed" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Mark the bot as deployed before embedding on external websites.
              </p>
            )}

            <div className="text-xs text-gray-500 border border-gray-200 rounded-lg p-3 bg-gray-50">
              Behavior included automatically:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Bottom-right circular launcher button</li>
                <li>Chatbot name label below launcher in black</li>
                <li>Compact chat panel with message input and send button</li>
                <li>Responsive layout for desktop and mobile</li>
                <li>Uses your project ID to query your chatbot knowledge base</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
