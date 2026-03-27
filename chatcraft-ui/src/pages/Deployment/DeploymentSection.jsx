import { useState } from "react";
import { useParams } from "react-router-dom";
import { Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSession } from "../../utils/auth";

const API = "/api/v1";

export default function DeploymentSection() {
  const { projectId } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const [deployState, setDeployState] = useState("unknown");

  const token = getSession()?.token || "";

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
            Deployment endpoint scaffold is ready at /console/deploy/{projectId}.
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
            <p className="text-sm text-charcoal">
              Current state: <strong>{deployState}</strong>
            </p>

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
      </div>
    </div>
  );
}
