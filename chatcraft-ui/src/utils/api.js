const API_BASE = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8080").trim().replace(/\/$/, "");

function apiUrl(path = "") {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${suffix}`;
}

export { API_BASE, apiUrl };
