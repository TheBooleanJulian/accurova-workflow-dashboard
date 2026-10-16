// frontend/src/PublicApp.jsx
// Read-only, token-gated progress dashboard — no edit controls, no
// remarks/tags/priority/raw-processed-count detail (see PUBLIC_FIELDS on the
// backend). Each client gets a private link (?token=...) that scopes the
// view to only their own shoots; without one, nothing is shown — this is
// deliberately not a blanket "everyone's shoots" listing. Linked to from the
// admin dashboard; links back to it via #admin.

import { useState, useEffect, useCallback } from "react";
import { api } from "./api.js";
import {
  TYPE_ICON, statusColor, StatusChip, RatioBar, Spinner, GLOBAL_STYLES,
  displayName, formatDate, displayRatio,
} from "./shared.jsx";

function ProjectCard({ project: p }) {
  const color = statusColor(p.status);
  const ratio = displayRatio(p.ratio);
  return (
    <div className="project-card" style={{
      background: "#111820", border: "1px solid #ffffff0f",
      borderRadius: 8, padding: "14px 16px", transition: "all 0.18s ease",
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
            {formatDate(p.date)}
          </div>
        </div>
        {p.status && <StatusChip status={p.status} />}
      </div>
      <RatioBar value={p.ratio} color={color} />
      <div style={{ marginTop: 8, textAlign: "right" }}>
        <span style={{ color: "#2a3a4a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
          {ratio === null ? "—" : `${ratio}%`} processed
        </span>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      background: "#050d15", minHeight: "100vh",
      color: "#e8eaf0", fontFamily: "JetBrains Mono, monospace",
      display: "flex", flexDirection: "column",
    }}>
      <style>{GLOBAL_STYLES}</style>
      {children}
    </div>
  );
}

function NoAccessGate() {
  return (
    <Shell>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#00d4c8", textTransform: "uppercase", marginBottom: 10 }}>Accurova</div>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Private link required</div>
          <div style={{ color: "#5a6a7e", fontSize: 12, lineHeight: 1.6 }}>
            This page only shows shoots to clients with their own private link.
            If you're expecting to see your shoot progress here, ask your
            photographer for your personal link.
          </div>
        </div>
      </div>
    </Shell>
  );
}

export default function PublicApp() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") || "");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [apiError, setApiError] = useState("");
  const [search, setSearch]     = useState("");

  const fetchProjects = useCallback(async () => {
    setLoading(true); setApiError("");
    try {
      setProjects(await api.listPublicProjects(token));
    } catch (e) {
      setApiError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) fetchProjects(); }, [token, fetchProjects]);

  if (!token) return <NoAccessGate />;

  const clientName = projects[0]?.client || "";

  const filtered = projects
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <Shell>
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #ffffff0a", display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#00d4c8", textTransform: "uppercase", marginBottom: 2 }}>Accurova</div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.05em" }}>{clientName ? `${clientName} — Shoot Progress` : "Shoot Progress"}</div>
        </div>

        {!loading && projects.length > 0 && (
          <div style={{ color: "#3a4a5e", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
            {projects.length} shoot{projects.length === 1 ? "" : "s"}
          </div>
        )}

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shoots…"
          style={{
            marginLeft: "auto", background: "#111820", border: "1px solid #ffffff12",
            borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
            fontSize: 12, padding: "7px 12px", width: 200, outline: "none",
          }} />

        <button onClick={fetchProjects} title="Refresh" style={{
          background: "transparent", border: "1px solid #ffffff12", borderRadius: 6,
          color: "#4a5a6e", padding: "6px 10px", cursor: "pointer", fontSize: 14,
        }}>↻</button>
      </div>

      {apiError && (
        <div style={{ background: "#ff475718", borderBottom: "1px solid #ff475744", padding: "10px 24px", color: "#ff4757", fontSize: 12, fontFamily: "JetBrains Mono, monospace", display: "flex", justifyContent: "space-between" }}>
          <span>⚠ API error: {apiError}</span>
          <button onClick={fetchProjects} style={{ background: "none", border: "none", color: "#ff4757", cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>Retry ↻</button>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
        {loading ? <Spinner /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
            {filtered.length === 0 && (
              <div style={{ color: "#2a3a4e", fontSize: 13, padding: 40, gridColumn: "1/-1", textAlign: "center" }}>
                {projects.length === 0 ? "No shoots found for this link." : "No shoots match your search."}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 24px", borderTop: "1px solid #ffffff0a", textAlign: "center" }}>
        <a href="#admin" style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.1em", textDecoration: "none" }}>Admin login →</a>
      </div>
    </Shell>
  );
}
