import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  Plus,
  Bot,
  Clock,
  ArrowLeft,
  Trash2,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { getSession, clearSession, isLoggedIn } from "../utils/auth";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login");
      return;
    }
    const session = getSession();
    if (session?.user) {
      setUser(session.user);
    }
    fetchProject(session?.token);
  }, [navigate]);

  const getToken = () => {
    const session = getSession();
    return session?.token || "";
  };

  const fetchProject = async (token) => {
    try {
      const res = await fetch("/api/v1/projects", {
        headers: { Authorization: `Bearer ${token || getToken()}` },
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid server response");
      }
      if (res.ok) {
        setProject(data.project || null);
      }
    } catch (err) {
      console.error("Failed to fetch project:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Project name is required.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(form),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid server response");
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }

      setProject(data.project);
      setShowCreateForm(false);
      setForm({ name: "", description: "" });
      toast.success("Project created!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this project? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/v1/projects", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid server response");
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete project");
      }

      setProject(null);
      toast.success("Project deleted.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    toast.success("Logged out.");
    navigate("/");
  };

  const firstName = user?.name?.split(" ")[0] || "there";

  if (loading) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <Loader2 size={32} className="text-crimson animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-white">
      {/* Top Bar */}
      <header className="border-b border-light-rose bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-muted hover:text-charcoal transition-colors text-sm font-medium cursor-pointer"
          >
            <ArrowLeft size={18} />
            Home
          </button>

          <h1 className="text-xl font-extrabold text-charcoal">
            Chat<span className="text-crimson">Craft</span>
          </h1>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 border-2 border-charcoal text-charcoal px-5 py-2 rounded-full font-semibold text-sm
                       hover:bg-charcoal hover:text-white transition-all duration-200 cursor-pointer"
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Greeting */}
        <div className="mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold text-charcoal mb-2">
            Hi {firstName}!
          </h2>
          <p className="text-muted text-base">
            Welcome to your dashboard. You can create and manage one chatbot project here.
          </p>
        </div>

        {/* Project Section */}
        {project ? (
          /* Existing Project Card */
          <div className="bg-white border border-light-rose rounded-2xl p-8 shadow-sm">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-light-rose text-crimson">
                  <Bot size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-charcoal">{project.name}</h3>
                  <p className="text-sm text-muted mt-0.5">{project.description || "No description"}</p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                  project.status === "active"
                    ? "bg-green-100 text-green-700"
                    : project.status === "paused"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-light-rose text-crimson"
                }`}
              >
                {project.status}
              </span>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-6 text-sm text-muted mb-8">
              <div className="flex items-center gap-1.5">
                <Clock size={14} />
                Created {new Date(project.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                className="group flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-full font-semibold text-sm
                           hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-lg shadow-crimson/25"
                onClick={() => toast.info("Bot builder coming soon!")}
              >
                <Bot size={16} />
                Open Builder
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 border-2 border-red-200 text-red-500 px-5 py-2.5 rounded-full font-semibold text-sm
                           hover:bg-red-50 transition-all duration-200 cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={16} />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : showCreateForm ? (
          /* Create Project Form */
          <div className="bg-white border border-light-rose rounded-2xl p-8 shadow-sm">
            <h3 className="text-xl font-bold text-charcoal mb-6">Create Your Chatbot Project</h3>
            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Customer Support Bot"
                  className="w-full px-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Description <span className="text-muted font-normal">(optional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="What will this chatbot do?"
                  className="w-full px-4 py-2.5 rounded-lg border border-light-rose bg-soft-white text-charcoal text-sm
                             placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-crimson/30 focus:border-crimson transition resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-full font-semibold text-sm
                             hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-lg shadow-crimson/25 disabled:opacity-50"
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {creating ? "Creating..." : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex items-center gap-2 border-2 border-charcoal text-charcoal px-6 py-2.5 rounded-full font-semibold text-sm
                             hover:bg-charcoal hover:text-white transition-all duration-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white border border-light-rose rounded-2xl p-12 shadow-sm text-center">
            <div className="w-20 h-20 mx-auto flex items-center justify-center rounded-full bg-light-rose text-crimson mb-6">
              <FolderOpen size={36} />
            </div>
            <h3 className="text-xl font-bold text-charcoal mb-2">No project yet</h3>
            <p className="text-muted text-sm mb-8 max-w-md mx-auto">
              You haven't created a chatbot project yet. Each account gets one project —
              make it count!
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="group inline-flex items-center gap-2 bg-crimson text-white px-8 py-3.5 rounded-full font-semibold text-base
                         hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-lg shadow-crimson/25"
            >
              <Plus size={18} />
              Create Your Chatbot
            </button>
          </div>
        )}

        {/* Info Banner */}
        <div className="mt-8 bg-light-rose/40 border border-light-rose rounded-xl px-6 py-4 text-center">
          <p className="text-sm text-charcoal/70">
            <span className="font-semibold text-crimson">Free Plan:</span> Each account can create one chatbot project.
            The visual builder, LLM integration, and RAG pipeline features are coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}
