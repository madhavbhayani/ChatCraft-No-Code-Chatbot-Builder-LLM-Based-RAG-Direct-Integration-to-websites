import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  Plus,
  Clock,
  Trash2,
  Loader2,
  FolderOpen,
  Settings,
  User,
  ChevronDown,
  AlertCircle,
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
  const [showUserMenu, setShowUserMenu] = useState(false);

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

  // Close user menu when clicking outside
  useEffect(() => {
    const close = (e) => {
      if (!e.target.closest(".user-menu-container")) setShowUserMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

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
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  if (loading) {
    return (
      <div className="min-h-screen bg-soft-white flex items-center justify-center">
        <Loader2 size={32} className="text-crimson animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-soft-white">
      {/* Navigation Bar */}
      <header className="bg-transparent sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-full px-5 h-14 flex items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-charcoal">
              Chat<span className="text-crimson">Craft</span>
            </h1>
          </div>

          {/* Right: User Avatar + Dropdown */}
          <div className="relative user-menu-container">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowUserMenu(!showUserMenu);
              }}
              className="flex items-center gap-2 hover:bg-charcoal/5 rounded-full px-3 py-1.5 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-crimson flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
              <ChevronDown size={14} className="text-charcoal/50" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-in fade-in-0 zoom-in-95">
                <div className="p-4 border-b border-gray-100">
                  <p className="text-sm font-semibold text-charcoal">{user?.name}</p>
                  <p className="text-xs text-muted truncate">{user?.email}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate("/account");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-charcoal hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Settings size={15} className="text-muted" />
                    Account Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sub-header — Greeting area */}
      <div className="border-b border-light-rose">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-charcoal mb-1">
            Welcome back, {firstName}
          </h2>
          <p className="text-muted text-sm">
            Manage your chatbot project and build intelligent conversations.
          </p>
        </div>
      </div>

      {/* Email verification banner */}
      {user && user.email_verified === false && (
        <div className="bg-warning/10 border-b border-warning/30">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3">
            <AlertCircle size={16} className="text-warning shrink-0" />
            <p className="text-sm text-charcoal/80">
              Your email is not verified.{" "}
              <button
                onClick={() => navigate("/verify-email", { state: { email: user.email } })}
                className="text-crimson font-semibold hover:underline cursor-pointer"
              >
                Verify now
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Section Header */}
        <div className="mb-6">
          <h3 className="text-lg font-bold text-charcoal">Your Projects</h3>
        </div>

        {project ? (
          /* Project Card — Firebase-style */
          <div className="group bg-white rounded-xl border border-light-rose shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            {/* Color bar at top */}
            <div className="h-1 bg-gradient-to-r from-crimson via-rose-pink to-dusty-rose" />

            <div className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h4 className="text-lg font-bold text-charcoal">{project.name}</h4>
                  <p className="text-sm text-muted mt-0.5">{project.description || "No description"}</p>
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

              {/* Meta row */}
              <div className="flex items-center gap-6 text-xs text-muted mb-6">
                <div className="flex items-center gap-1.5">
                  <Clock size={12} />
                  Created{" "}
                  {new Date(project.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div className="flex items-center gap-1.5">
                  <User size={12} />
                  {user?.name}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  className="flex items-center gap-2 bg-crimson text-white px-5 py-2 rounded-lg font-semibold text-sm
                             hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm"
                  onClick={() => navigate(`/console/${project.id}`)}
                >
                  Open Console
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 text-muted hover:text-red-500 px-3 py-2 rounded-lg text-sm font-medium
                             hover:bg-red-50 transition-all duration-200 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={15} />
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ) : showCreateForm ? (
          /* Create Project Form */
          <div className="bg-white rounded-xl border border-light-rose shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-crimson via-rose-pink to-dusty-rose" />
            <div className="p-6">
              <h4 className="text-lg font-bold text-charcoal mb-5">Create a new project</h4>
              <form onSubmit={handleCreate} className="space-y-4">
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
                    className="flex items-center gap-2 bg-crimson text-white px-5 py-2.5 rounded-lg font-semibold text-sm
                               hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {creating ? "Creating..." : "Create Project"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="text-sm text-muted font-medium hover:text-charcoal cursor-pointer px-4 py-2.5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-xl border border-light-rose border-dashed p-12 text-center">
            <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-light-rose text-crimson mb-5">
              <FolderOpen size={28} />
            </div>
            <h4 className="text-lg font-bold text-charcoal mb-2">No projects yet</h4>
            <p className="text-muted text-sm mb-6 max-w-sm mx-auto">
              Create your first chatbot project to get started with AI-powered conversations.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 bg-crimson text-white px-6 py-2.5 rounded-lg font-semibold text-sm
                         hover:bg-rose-pink transition-all duration-200 cursor-pointer shadow-sm"
            >
              <Plus size={16} />
              Create Your First Project
            </button>
          </div>
        )}

        {/* Info Banner */}
        <div className="mt-6 bg-light-rose/40 border border-light-rose rounded-lg px-5 py-3.5 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-crimson flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white text-xs font-bold">i</span>
          </div>
          <div className="text-sm text-charcoal/70">
            <p>
              <span className="font-semibold text-crimson">Note:</span> This is a learning project by{" "}
              <a
                href="https://linkedin.com/in/madhavbhayani"
                target="_blank"
                rel="noopener noreferrer"
                className="text-crimson font-semibold hover:underline"
              >
                Madhav Bhayani
              </a>
              . You can create only 1 chatbot under the free plan.
            </p>
            <p className="mt-1.5">
              Want to discuss something?{" "}
              <a
                href="mailto:madhavbhayani21@gmail.com"
                className="text-crimson font-medium hover:underline"
              >
                Email
              </a>{" "}
              or{" "}
              <a
                href="https://linkedin.com/in/madhavbhayani"
                target="_blank"
                rel="noopener noreferrer"
                className="text-crimson font-medium hover:underline"
              >
                Connect on LinkedIn
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
