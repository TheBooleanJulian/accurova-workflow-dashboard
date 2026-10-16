// frontend/src/AdminApp.jsx
// Password-gated admin dashboard — full edit capabilities. Gate is a single
// shared password (ADMIN_PASSWORD on the backend); on success the backend
// hands back a signed, self-expiring session token stored in localStorage.

import { useState, useEffect, useCallback } from "react";
import { api, auth } from "./api.js";
import {
  TYPE_ICON, PRIORITY_RANK, statusColor, StatusChip, RatioBar, Spinner, formatScanned, GLOBAL_STYLES,
  displayName, formatDate, displayRatio,
} from "./shared.jsx";

// ── LOGIN ────────────────────────────────────────────────────────────────────

function LoginForm({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { token } = await api.login(password);
      auth.setToken(token);
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: "#050d15", minHeight: "100vh", color: "#e8eaf0",
      fontFamily: "JetBrains Mono, monospace",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <form onSubmit={submit} style={{
        background: "#111820", border: "1px solid #ffffff0f", borderRadius: 8,
        padding: "28px 28px", width: 280,
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#00d4c8", textTransform: "uppercase", marginBottom: 4 }}>Accurova</div>
        <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.05em", marginBottom: 18 }}>Admin Login</div>
        <input
          type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{
            width: "100%", background: "#0d1117", border: "1px solid #ffffff14",
            borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
            fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box", marginBottom: 12,
          }} />
        {error && <div style={{ color: "#ff4757", fontSize: 11, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={busy || !password} style={{
          width: "100%", background: "linear-gradient(135deg, #00d4c8, #00a89e)",
          border: "none", borderRadius: 6, color: "#050d15",
          padding: "10px 0", fontWeight: 900, fontSize: 12, letterSpacing: "0.12em",
          cursor: busy ? "default" : "pointer", textTransform: "uppercase",
          opacity: busy || !password ? 0.6 : 1,
        }}>{busy ? "Checking…" : "Log In"}</button>
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <a href="#" style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.1em", textDecoration: "none" }}>← Back to public dashboard</a>
        </div>
      </form>
    </div>
  );
}

// ── PROJECT CARD ─────────────────────────────────────────────────────────────

function ProjectCard({ project: p, onClick, selected }) {
  const color = statusColor(p.status);
  const ratio = displayRatio(p.ratio);
  return (
    <div onClick={() => onClick(p)} className="project-card" style={{
      background:   selected ? "#1a2535" : "#111820",
      border:       `1px solid ${selected ? "#00d4c8" : "#ffffff0f"}`,
      borderRadius: 8, padding: "14px 16px",
      cursor: "pointer", transition: "all 0.18s ease",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }} title={p.name}>
            {p.type && <span style={{ fontSize: 13 }}>{TYPE_ICON[p.type] || ""}</span>}
            <span style={{
              color: "#e8eaf0", fontWeight: 700, fontSize: 13,
              fontFamily: "JetBrains Mono, monospace",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{displayName(p.name)}</span>
          </div>
          <div style={{ color: "#5a6a7e", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
            {formatDate(p.date)}{p.client ? ` · ${p.client}` : ""}
          </div>
        </div>
        <StatusChip status={p.status} />
      </div>
      <RatioBar value={p.ratio} color={color} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ color: "#2a3a4a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
          {ratio === null ? "—" : `${ratio}%`} processed
        </span>
        <div style={{ display: "flex", gap: 8, color: "#4a5568", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
          <span>📷{p.raw_count}</span>
          <span>✓{p.processed_count}</span>
        </div>
      </div>
      {p.priority === "High" && (
        <div style={{ marginTop: 6, textAlign: "right" }}>
          <span style={{ fontSize: 9, color: "#ff6b35", fontWeight: 700, letterSpacing: "0.1em", fontFamily: "JetBrains Mono, monospace" }}>● HIGH</span>
        </div>
      )}
    </div>
  );
}

// ── DETAIL PANEL ─────────────────────────────────────────────────────────────

const WRITABLE_FIELDS = ["status", "remarks", "client", "type", "priority", "tags"];

function field(label, value) {
  return (
    <div style={{ background: "#111820", borderRadius: 6, padding: "10px 12px", border: "1px solid #ffffff08" }}>
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, wordBreak: "break-word" }}>{value ?? "—"}</div>
    </div>
  );
}

function inputStyle() {
  return {
    width: "100%", background: "#0d1117", border: "1px solid #ffffff14",
    borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
    fontSize: 12, padding: "8px 10px", outline: "none", boxSizing: "border-box",
  };
}

function editField(label, key, form, set, opts = {}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <input value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} style={inputStyle()} {...opts} />
    </div>
  );
}

function editSelect(label, key, options, form, set) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <select value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} style={inputStyle()}>
        <option value="">—</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function DetailPanel({ project: initial, onClose, onUpdate }) {
  const [form, setForm]       = useState(initial);
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [linkStatus, setLinkStatus] = useState("");

  useEffect(() => { setForm(initial); setDirty(false); setError(""); setLinkStatus(""); }, [initial]);

  const copyClientLink = async () => {
    setLinkStatus("Generating…");
    try {
      const { token, shootCount } = await api.getClientLink(form.client);
      const url = `${window.location.origin}/?token=${token}`;
      await navigator.clipboard.writeText(url);
      setLinkStatus(`Copied — covers ${shootCount} shoot${shootCount === 1 ? "" : "s"}`);
    } catch (e) {
      setLinkStatus(e.message);
    }
  };

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const payload = Object.fromEntries(WRITABLE_FIELDS.map((k) => [k, form[k]]));
      const updated = await api.updateProject(form.id, payload);
      onUpdate(updated);
      setDirty(false);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: "#0d1117", borderLeft: "1px solid #ffffff12", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #ffffff0a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#00d4c8", fontFamily: "JetBrains Mono, monospace", marginBottom: 6, textTransform: "uppercase" }}>Shoot Detail</div>
            <div style={{ color: "#e8eaf0", fontWeight: 700, fontSize: 15, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.3 }}>{form.name}</div>
            <div style={{ color: "#4a5a6e", fontSize: 11, fontFamily: "JetBrains Mono, monospace", marginTop: 4, wordBreak: "break-all" }}>{form.full_path}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5a6e", cursor: "pointer", fontSize: 20, flexShrink: 0 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

        {/* Scan stats (read-only, script-owned) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {field("Date", form.date)}
          {field("Root Folder", form.root_folder)}
          {field("RAW Count", form.raw_count?.toLocaleString())}
          {field("Processed Count", form.processed_count?.toLocaleString())}
          {field("Ratio", Number.isFinite(form.ratio) ? `${form.ratio}%` : "—")}
          {field("Last Scanned", formatScanned(form.last_scanned))}
        </div>
        <div style={{ marginBottom: 20 }}>
          <RatioBar value={form.ratio} color={statusColor(form.status)} />
        </div>

        {/* Editable fields */}
        {editField("Status", "status", form, set)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {editSelect("Type", "type", ["Photo", "Video", "Mixed"], form, set)}
          {editSelect("Priority", "priority", ["High", "Medium", "Low"], form, set)}
        </div>
        {editField("Client", "client", form, set)}
        <div style={{ marginTop: -8, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={copyClientLink}
            disabled={!form.client || dirty}
            title={dirty ? "Save changes first" : "Generates (or reuses) this client's private link and copies it"}
            style={{
              background: "transparent", border: "1px solid #ffffff14", borderRadius: 5,
              color: !form.client || dirty ? "#2a3a4e" : "#00d4c8",
              fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.08em",
              padding: "5px 10px", cursor: !form.client || dirty ? "default" : "pointer",
              textTransform: "uppercase",
            }}
          >Copy client link</button>
          {linkStatus && <span style={{ color: "#4a5a6e", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>{linkStatus}</span>}
        </div>
        {editField("Tags (comma separated)", "tags_input", { ...form, tags_input: Array.isArray(form.tags) ? form.tags.join(", ") : form.tags },
          (k, v) => set("tags", v))}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 5 }}>Remarks</div>
          <textarea value={form.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} rows={4}
            style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.6 }} />
        </div>

        {error && <div style={{ color: "#ff4757", fontSize: 11, fontFamily: "JetBrains Mono, monospace", marginBottom: 12 }}>{error}</div>}
      </div>

      <div style={{ padding: "14px 24px", borderTop: "1px solid #ffffff0a" }}>
        <button onClick={save} disabled={!dirty || saving} style={{
          width: "100%",
          background: dirty ? "linear-gradient(135deg, #00d4c8, #00a89e)" : "#1a2535",
          border: "none", borderRadius: 6,
          color: dirty ? "#050d15" : "#2a3a4e",
          padding: "10px 0", fontFamily: "JetBrains Mono, monospace",
          fontWeight: 900, fontSize: 12, letterSpacing: "0.12em",
          cursor: dirty && !saving ? "pointer" : "default",
          textTransform: "uppercase", transition: "all 0.2s",
        }}>{saving ? "Saving…" : dirty ? "Save Changes" : "No Changes"}</button>
      </div>
    </div>
  );
}

// ── DASHBOARD (post-login) ──────────────────────────────────────────────────

function Dashboard({ onLogout }) {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [apiError, setApiError]   = useState("");
  const [selected, setSelected]   = useState(null);
  const [filterStatus, setFilterStatus]     = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [sortBy, setSortBy]       = useState("date");
  const [search, setSearch]       = useState("");
  const [view, setView]           = useState("board");

  const fetchProjects = useCallback(async () => {
    setLoading(true); setApiError("");
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (e) {
      setApiError(e.message);
      if (/unauthorized/i.test(e.message)) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const statuses = [...new Set(projects.map((p) => p.status).filter(Boolean))];

  const filtered = projects
    .filter((p) => filterStatus === "All"   || p.status   === filterStatus)
    .filter((p) => filterPriority === "All" || p.priority === filterPriority)
    .filter((p) => !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.client || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "date")     return new Date(b.date) - new Date(a.date);
      if (sortBy === "priority") return (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
      if (sortBy === "ratio")    return (b.ratio || 0) - (a.ratio || 0);
      if (sortBy === "status")   return (a.status || "").localeCompare(b.status || "");
      return a.name.localeCompare(b.name);
    });

  const totalRaw       = projects.reduce((s, p) => s + (p.raw_count || 0), 0);
  const totalProcessed = projects.reduce((s, p) => s + (p.processed_count || 0), 0);
  const avgRatio        = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.ratio || 0), 0) / projects.length)
    : 0;

  const handleUpdate = (updated) => {
    setProjects((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
    setSelected(updated);
  };

  return (
    <div style={{
      background: "#050d15", minHeight: "100vh",
      color: "#e8eaf0", fontFamily: "JetBrains Mono, monospace",
      display: "flex", flexDirection: "column",
    }}>
      <style>{GLOBAL_STYLES}</style>

      {/* TOP BAR */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #ffffff0a", display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#00d4c8", textTransform: "uppercase", marginBottom: 2 }}>Accurova</div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.05em" }}>Workflow (Admin)</div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 10, marginLeft: 16 }}>
          {[
            { label: "Shoots",    val: projects.length,                 color: "#00d4c8" },
            { label: "Avg Ratio", val: `${avgRatio}%`,                   color: "#6c7a8d" },
            { label: "RAW",       val: totalRaw.toLocaleString(),        color: "#9f7aeb" },
            { label: "Processed", val: totalProcessed.toLocaleString(),  color: "#2ed573" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#111820", border: "1px solid #ffffff08", borderRadius: 6, padding: "6px 12px", textAlign: "center" }}>
              <div style={{ color, fontWeight: 900, fontSize: 15 }}>{val}</div>
              <div style={{ color: "#3a4a5e", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shoots…"
          style={{
            marginLeft: "auto", background: "#111820", border: "1px solid #ffffff12",
            borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
            fontSize: 12, padding: "7px 12px", width: 200, outline: "none",
          }} />

        {/* View toggle */}
        <div style={{ display: "flex", gap: 2, background: "#111820", borderRadius: 6, padding: 2, border: "1px solid #ffffff08" }}>
          {["board", "table"].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view === v ? "#1e3a4a" : "transparent",
              border: "none", color: view === v ? "#00d4c8" : "#3a4a5e",
              fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.1em",
              padding: "5px 12px", borderRadius: 4, cursor: "pointer", textTransform: "uppercase", transition: "all 0.15s",
            }}>{v}</button>
          ))}
        </div>

        {/* Refresh */}
        <button onClick={fetchProjects} title="Refresh" style={{
          background: "transparent", border: "1px solid #ffffff12", borderRadius: 6,
          color: "#4a5a6e", padding: "6px 10px", cursor: "pointer", fontSize: 14,
        }}>↻</button>

        {/* Logout */}
        <button onClick={onLogout} title="Log out" style={{
          background: "transparent", border: "1px solid #ffffff12", borderRadius: 6,
          color: "#4a5a6e", padding: "6px 10px", cursor: "pointer", fontSize: 11,
          fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase",
        }}>Log Out</button>
      </div>

      {/* FILTER BAR */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid #ffffff06", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0, background: "#080f1a" }}>
        <span style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>Status:</span>
        {["All", ...statuses].map((s) => (
          <button key={s} className={`filter-btn ${filterStatus === s ? "active" : ""}`} onClick={() => setFilterStatus(s)}>{s}</button>
        ))}
        <div style={{ width: 1, height: 16, background: "#ffffff0a", margin: "0 4px" }} />
        <span style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>Priority:</span>
        {["All", "High", "Medium", "Low"].map((p) => (
          <button key={p} className={`filter-btn ${filterPriority === p ? "active" : ""}`} onClick={() => setFilterPriority(p)}>{p}</button>
        ))}
        <div style={{ width: 1, height: 16, background: "#ffffff0a", margin: "0 4px" }} />
        <span style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>Sort:</span>
        {[["date", "Date"], ["ratio", "Ratio"], ["priority", "Priority"], ["status", "Status"], ["name", "Name"]].map(([val, label]) => (
          <button key={val} className={`filter-btn ${sortBy === val ? "active" : ""}`} onClick={() => setSortBy(val)}>{label}</button>
        ))}
      </div>

      {/* API ERROR BANNER */}
      {apiError && (
        <div style={{ background: "#ff475718", borderBottom: "1px solid #ff475744", padding: "10px 24px", color: "#ff4757", fontSize: 12, fontFamily: "JetBrains Mono, monospace", display: "flex", justifyContent: "space-between" }}>
          <span>⚠ API error: {apiError}</span>
          <button onClick={fetchProjects} style={{ background: "none", border: "none", color: "#ff4757", cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>Retry ↻</button>
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {loading ? <Spinner /> : (
            <>
              {view === "board" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                  {filtered.map((p) => (
                    <ProjectCard key={p.id} project={p} onClick={setSelected} selected={selected?.id === p.id} />
                  ))}
                  {filtered.length === 0 && (
                    <div style={{ color: "#2a3a4e", fontSize: 13, padding: 40, gridColumn: "1/-1", textAlign: "center" }}>
                      No shoots match the current filters.
                    </div>
                  )}
                </div>
              )}

              {view === "table" && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#3a4a5e", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      <th style={{ padding: "8px 10px" }}>Name</th>
                      <th style={{ padding: "8px 10px" }}>Date</th>
                      <th style={{ padding: "8px 10px" }}>Status</th>
                      <th style={{ padding: "8px 10px" }}>Ratio</th>
                      <th style={{ padding: "8px 10px" }}>RAW</th>
                      <th style={{ padding: "8px 10px" }}>Processed</th>
                      <th style={{ padding: "8px 10px" }}>Client</th>
                      <th style={{ padding: "8px 10px" }}>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="table-row" onClick={() => setSelected(p)}
                        style={{ borderTop: "1px solid #ffffff08", background: selected?.id === p.id ? "#1a2535" : "transparent" }}>
                        <td style={{ padding: "8px 10px", color: "#e8eaf0", fontWeight: 700 }} title={p.name}>{displayName(p.name)}</td>
                        <td style={{ padding: "8px 10px", color: "#8a9ab0" }}>{formatDate(p.date)}</td>
                        <td style={{ padding: "8px 10px" }}><StatusChip status={p.status} /></td>
                        <td style={{ padding: "8px 10px", color: "#8a9ab0" }}>{Number.isFinite(p.ratio) ? `${p.ratio}%` : "—"}</td>
                        <td style={{ padding: "8px 10px", color: "#8a9ab0" }}>{p.raw_count}</td>
                        <td style={{ padding: "8px 10px", color: "#8a9ab0" }}>{p.processed_count}</td>
                        <td style={{ padding: "8px 10px", color: "#8a9ab0" }}>{p.client || "—"}</td>
                        <td style={{ padding: "8px 10px", color: "#8a9ab0" }}>{p.priority || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width: 360, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <DetailPanel project={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── ROOT ─────────────────────────────────────────────────────────────────────

export default function AdminApp() {
  const [loggedIn, setLoggedIn] = useState(!!auth.getToken());

  const logout = () => { auth.clearToken(); setLoggedIn(false); };

  return loggedIn
    ? <Dashboard onLogout={logout} />
    : <LoginForm onSuccess={() => setLoggedIn(true)} />;
}
