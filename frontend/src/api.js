// frontend/src/api.js
// Thin wrapper around the backend REST API

const BASE =
  import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : "/api"; // dev: Vite proxy → localhost:3001

const TOKEN_KEY = "accurova_admin_token";

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY) || "",
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
};

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) auth.clearToken();
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function adminReq(path, opts = {}) {
  return req(path, {
    ...opts,
    headers: { "x-admin-token": auth.getToken(), ...opts.headers },
  });
}

export const api = {
  // Public, unauthenticated dashboard
  listPublicProjects: () => req("/public/projects"),

  // Admin — requires a valid session token
  login: (password) => req("/admin/login", { method: "POST", body: JSON.stringify({ password }) }),

  listProjects: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v && v !== "All"))
    ).toString();
    return adminReq(`/projects${qs ? "?" + qs : ""}`);
  },

  getProject:    (id)       => adminReq(`/projects/${id}`),
  updateProject: (id, body) => adminReq(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};
