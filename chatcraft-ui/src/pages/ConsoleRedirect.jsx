import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getSession, isLoggedIn } from "../utils/auth";

/**
 * ConsoleRedirect - When user visits /console, fetch their project
 * and redirect to /console/integrate/{projectId}.
 * If no project exists, redirect to /dashboard.
 */
export default function ConsoleRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate("/login");
      return;
    }

    const session = getSession();
    fetch("/api/v1/projects", {
      headers: { Authorization: `Bearer ${session?.token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.project) {
          navigate(`/console/integrate/${data.project.id}`, { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => {
        navigate("/dashboard", { replace: true });
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-soft-white flex items-center justify-center">
      <Loader2 size={32} className="text-crimson animate-spin" />
    </div>
  );
}
