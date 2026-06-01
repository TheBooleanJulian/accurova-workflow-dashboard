// frontend/src/api.js
// Thin wrapper around the backend REST API

const BASE =
  import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : "/api"; // dev: Vite proxy → localhost:3001

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  listProjects: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v && v !== "All"))
    ).toString();
    return req(`/projects${qs ? "?" + qs : ""}`);
  },

  getProject:    (id)      => req(`/projects/${id}`),
  createProject: (body)    => req("/projects", { method: "POST",   body: JSON.stringify(body) }),
  updateProject: (id, body) => req(`/projects/${id}`, { method: "PATCH",  body: JSON.stringify(body) }),
  deleteProject: (id)      => req(`/projects/${id}`, { method: "DELETE" }),
};
