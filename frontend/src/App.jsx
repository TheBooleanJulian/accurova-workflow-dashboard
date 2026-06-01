// frontend/src/App.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api.js";

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const STAGES = ["Shoot", "Ingest", "Cull", "Edit", "Export", "Deliver"];

const STAGE_COLOR = {
  Shoot:   "#6c7a8d",
  Ingest:  "#a07d4f",
  Cull:    "#4f7da0",
  Edit:    "#00b4a8",
  Export:  "#9f7aeb",
  Deliver: "#2ed573",
};

const TYPE_ICON = { Photo: "📷", Video: "🎬", Mixed: "🎞️" };
const PRIORITY  = { High: 3, Medium: 2, Low: 1 };

// ── HELPERS ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

function urgencyClass(days, priority) {
  if (days < 0)                             return "overdue";
  if (days <= 2)                            return "critical";
  if (days <= 5 && priority === "High")     return "urgent";
  if (days <= 7)                            return "soon";
  return "normal";
}

function formatDeadline(dateStr) {
  const d = daysUntil(dateStr);
  if (d < 0)  return `${Math.abs(d)}d OVERDUE`;
  if (d === 0) return "DUE TODAY";
  if (d === 1) return "DUE TOMORROW";
  return `${d}d left`;
}

const URGENCY_COLOR = {
  overdue:  "#ff4757", critical: "#ff6b35",
  urgent:   "#ffa502", soon:     "#eccc68", normal: "#6c7a8d",
};

// ── PRIMITIVES ───────────────────────────────────────────────────────────────

function StageChip({ stage }) {
  return (
    <span style={{
      background: STAGE_COLOR[stage] + "22",
      color:      STAGE_COLOR[stage],
      border:     `1px solid ${STAGE_COLOR[stage]}55`,
      borderRadius: 4, padding: "2px 8px",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace",
    }}>{stage}</span>
  );
}

function DeadlineBadge({ deadline, priority }) {
  const urg = urgencyClass(daysUntil(deadline), priority);
  return (
    <span style={{
      color: URGENCY_COLOR[urg], fontSize: 11, fontWeight: 700,
      fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.06em",
    }}>{formatDeadline(deadline)}</span>
  );
}

function ProgressBar({ value, stage }) {
  const c = STAGE_COLOR[stage];
  return (
    <div style={{ height: 4, background: "#ffffff0d", borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        width: `${value}%`, height: "100%",
        background: `linear-gradient(90deg, ${c}99, ${c})`,
        borderRadius: 2, transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
        boxShadow: value > 0 ? `0 0 8px ${c}66` : "none",
      }} />
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{
        width: 28, height: 28, border: "2px solid #1e3a4a",
        borderTopColor: "#00d4c8", borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
    </div>
  );
}

// ── PROJECT CARD ─────────────────────────────────────────────────────────────

function ProjectCard({ project: p, onClick, selected }) {
  const days = daysUntil(p.deadline);
  const urg  = urgencyClass(days, p.priority);
  const isUrgent = ["overdue", "critical", "urgent"].includes(urg);

  return (
    <div onClick={() => onClick(p)} className="project-card" style={{
      background:   selected ? "#1a2535" : "#111820",
      border:       `1px solid ${selected ? "#00d4c8" : isUrgent ? "#ff475733" : "#ffffff0f"}`,
      borderRadius: 8, padding: "14px 16px",
      cursor: "pointer", transition: "all 0.18s ease",
      position: "relative", overflow: "hidden",
    }}>
      {isUrgent && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: urg === "overdue" ? "#ff4757" : urg === "critical" ? "#ff6b35" : "#ffa502",
        }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 13 }}>{TYPE_ICON[p.type]}</span>
            <span style={{
              color: "#e8eaf0", fontWeight: 700, fontSize: 13,
              fontFamily: "JetBrains Mono, monospace",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{p.name}</span>
          </div>
          <div style={{ color: "#5a6a7e", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>{p.client}</div>
        </div>
        <StageChip stage={p.stage} />
      </div>
      <ProgressBar value={p.progress} stage={p.stage} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <DeadlineBadge deadline={p.deadline} priority={p.priority} />
        <div style={{ display: "flex", gap: 8, color: "#4a5568", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
          {p.photo_count > 0 && <span>📷{p.photo_count}</span>}
          {p.video_count > 0 && <span>🎬{p.video_count}</span>}
        </div>
      </div>
      <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: "#2a3a4a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
          {p.progress}% complete
        </span>
        {p.priority === "High" && (
          <span style={{ fontSize: 9, color: "#ff6b35", fontWeight: 700, letterSpacing: "0.1em", fontFamily: "JetBrains Mono, monospace" }}>● HIGH</span>
        )}
      </div>
    </div>
  );
}

// ── NEW PROJECT MODAL ─────────────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: "", client: "", type: "Photo", stage: "Shoot", priority: "Medium",
    deadline: "", shoot_date: "", photo_count: 0, video_count: 0, notes: "", tags: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.client || !form.deadline) {
      setError("Name, client and deadline are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        photo_count: Number(form.photo_count),
        video_count: Number(form.video_count),
        tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      };
      const created = await api.createProject(payload);
      onCreate(created);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, type = "text", opts = {}) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
        style={{
          width: "100%", background: "#0d1117", border: "1px solid #ffffff14",
          borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
          fontSize: 12, padding: "8px 10px", outline: "none",
        }}
        {...opts}
      />
    </div>
  );

  const select = (label, key, options) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <select value={form[key]} onChange={e => set(key, e.target.value)}
        style={{
          width: "100%", background: "#0d1117", border: "1px solid #ffffff14",
          borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
          fontSize: 12, padding: "8px 10px", outline: "none",
        }}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000bb", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#0d1117", border: "1px solid #ffffff14", borderRadius: 10,
        width: 480, maxHeight: "85vh", overflowY: "auto",
        boxShadow: "0 24px 80px #000000cc",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #ffffff0a", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "JetBrains Mono, monospace", color: "#e8eaf0" }}>New Project</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5a6e", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {field("Project Name", "name")}
          {field("Client", "client")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {select("Type", "type", ["Photo", "Video", "Mixed"])}
            {select("Priority", "priority", ["High", "Medium", "Low"])}
          </div>
          {select("Starting Stage", "stage", STAGES)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {field("Deadline", "deadline", "date")}
            {field("Shoot Date", "shoot_date", "date")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {field("Photo Count", "photo_count", "number")}
            {field("Video Clips", "video_count", "number")}
          </div>
          {field("Tags (comma separated)", "tags")}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 5 }}>Notes</div>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
              style={{
                width: "100%", background: "#0d1117", border: "1px solid #ffffff14",
                borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
                fontSize: 12, padding: "8px 10px", resize: "vertical", outline: "none",
              }} />
          </div>
          {error && <div style={{ color: "#ff4757", fontSize: 11, fontFamily: "JetBrains Mono, monospace", marginBottom: 12 }}>{error}</div>}
          <button onClick={submit} disabled={saving} style={{
            width: "100%", background: "linear-gradient(135deg, #00d4c8, #00a89e)",
            border: "none", borderRadius: 6, color: "#050d15",
            padding: "10px 0", fontFamily: "JetBrains Mono, monospace",
            fontWeight: 900, fontSize: 12, letterSpacing: "0.12em",
            cursor: saving ? "wait" : "pointer", textTransform: "uppercase",
            opacity: saving ? 0.7 : 1,
          }}>{saving ? "Creating…" : "Create Project"}</button>
        </div>
      </div>
    </div>
  );
}

// ── DETAIL PANEL ─────────────────────────────────────────────────────────────

function DetailPanel({ project: initial, onClose, onUpdate, onDelete }) {
  const [p, setP]             = useState(initial);
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => { setP(initial); setDirty(false); setError(""); }, [initial]);

  const patch = (k, v) => { setP(prev => ({ ...prev, [k]: v })); setDirty(true); };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const updated = await api.updateProject(p.id, {
        stage: p.stage, progress: p.progress, notes: p.notes,
        priority: p.priority, deadline: p.deadline,
      });
      onUpdate(updated);
      setDirty(false);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteProject(p.id);
      onDelete(p.id);
      onClose();
    } catch (e) { setError(e.message); setDeleting(false); }
  };

  const days = daysUntil(p.deadline);
  const urg  = urgencyClass(days, p.priority);
  const urgMsg = {
    overdue: "⚠ PAST DEADLINE", critical: "🔴 CRITICAL — deliver ASAP",
    urgent: "🟠 Urgent — prioritise now", soon: "🟡 Coming up soon", normal: "✓ On track",
  };

  return (
    <div style={{ background: "#0d1117", borderLeft: "1px solid #ffffff12", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #ffffff0a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#00d4c8", fontFamily: "JetBrains Mono, monospace", marginBottom: 6, textTransform: "uppercase" }}>Project Detail</div>
            <div style={{ color: "#e8eaf0", fontWeight: 700, fontSize: 15, fontFamily: "JetBrains Mono, monospace", lineHeight: 1.3 }}>{p.name}</div>
            <div style={{ color: "#4a5a6e", fontSize: 12, fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{p.client}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a5a6e", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

        {/* Stage selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#4a5a6e", fontFamily: "JetBrains Mono, monospace", marginBottom: 10, textTransform: "uppercase" }}>Stage</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STAGES.map(s => (
              <button key={s} onClick={() => patch("stage", s)} style={{
                background: p.stage === s ? STAGE_COLOR[s] + "22" : "transparent",
                border: `1px solid ${p.stage === s ? STAGE_COLOR[s] : "#ffffff15"}`,
                color: p.stage === s ? STAGE_COLOR[s] : "#4a5a6e",
                borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: "JetBrains Mono, monospace",
                letterSpacing: "0.06em", transition: "all 0.15s",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#4a5a6e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" }}>Progress</div>
            <div style={{ color: STAGE_COLOR[p.stage], fontWeight: 700, fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}>{p.progress}%</div>
          </div>
          <input type="range" min={0} max={100} value={p.progress}
            onChange={e => patch("progress", Number(e.target.value))}
            style={{ width: "100%", accentColor: STAGE_COLOR[p.stage], cursor: "pointer" }} />
          <div style={{ marginTop: 8 }}>
            <ProgressBar value={p.progress} stage={p.stage} />
          </div>
        </div>

        {/* Urgency banner */}
        <div style={{
          background: URGENCY_COLOR[urg] + "14", border: `1px solid ${URGENCY_COLOR[urg]}33`,
          borderRadius: 6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
        }}>
          <div style={{ color: URGENCY_COLOR[urg], fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700 }}>{urgMsg[urg]}</div>
          <div style={{ marginLeft: "auto", color: URGENCY_COLOR[urg], fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{formatDeadline(p.deadline)}</div>
        </div>

        {/* Meta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            ["Type", `${TYPE_ICON[p.type]} ${p.type}`],
            ["Priority", p.priority],
            ["Shoot Date", p.shoot_date || "—"],
            ["Deadline", p.deadline],
          ].map(([label, val]) => (
            <div key={label} style={{ background: "#111820", borderRadius: 6, padding: "10px 12px", border: "1px solid #ffffff08" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Assets */}
        {(p.photo_count > 0 || p.video_count > 0) && (
          <div style={{ background: "#111820", borderRadius: 6, padding: "12px 14px", border: "1px solid #ffffff08", marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#3a4a5e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 10 }}>Assets</div>
            <div style={{ display: "flex", gap: 24 }}>
              {p.photo_count > 0 && (
                <div>
                  <div style={{ color: "#00d4c8", fontWeight: 900, fontSize: 22, fontFamily: "JetBrains Mono, monospace" }}>{p.photo_count.toLocaleString()}</div>
                  <div style={{ color: "#3a4a5e", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>PHOTOS</div>
                </div>
              )}
              {p.video_count > 0 && (
                <div>
                  <div style={{ color: "#9f7aeb", fontWeight: 900, fontSize: 22, fontFamily: "JetBrains Mono, monospace" }}>{p.video_count}</div>
                  <div style={{ color: "#3a4a5e", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>CLIPS</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#4a5a6e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 8 }}>Notes</div>
          <textarea value={p.notes} onChange={e => patch("notes", e.target.value)} rows={4}
            style={{
              width: "100%", background: "#111820", border: "1px solid #ffffff12",
              borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
              fontSize: 12, padding: "10px 12px", resize: "vertical",
              outline: "none", lineHeight: 1.6, boxSizing: "border-box",
            }} />
        </div>

        {/* Tags */}
        {p.tags?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#4a5a6e", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", marginBottom: 8 }}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {p.tags.map(t => (
                <span key={t} style={{ background: "#ffffff08", border: "1px solid #ffffff12", borderRadius: 3, padding: "3px 8px", fontSize: 10, color: "#4a5a6e", fontFamily: "JetBrains Mono, monospace" }}>#{t}</span>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ color: "#ff4757", fontSize: 11, fontFamily: "JetBrains Mono, monospace", marginBottom: 12 }}>{error}</div>}

        {/* Delete zone */}
        <div style={{ borderTop: "1px solid #ffffff08", paddingTop: 16 }}>
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} style={{
              background: "transparent", border: "1px solid #ff475733",
              color: "#ff4757", borderRadius: 6, padding: "7px 14px",
              fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer", letterSpacing: "0.08em",
            }}>Delete Project</button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#ff4757", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>Are you sure?</span>
              <button onClick={remove} disabled={deleting} style={{
                background: "#ff475722", border: "1px solid #ff4757", color: "#ff4757",
                borderRadius: 4, padding: "5px 12px", fontFamily: "JetBrains Mono, monospace",
                fontSize: 11, cursor: "pointer",
              }}>{deleting ? "Deleting…" : "Yes, delete"}</button>
              <button onClick={() => setConfirmDel(false)} style={{
                background: "transparent", border: "1px solid #ffffff14", color: "#4a5a6e",
                borderRadius: 4, padding: "5px 12px", fontFamily: "JetBrains Mono, monospace",
                fontSize: 11, cursor: "pointer",
              }}>Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Save footer */}
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

// ── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [apiError, setApiError]   = useState("");
  const [selected, setSelected]   = useState(null);
  const [filterStage, setFilterStage]       = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [sortBy, setSortBy]       = useState("deadline");
  const [search, setSearch]       = useState("");
  const [view, setView]           = useState("board");
  const [showNew, setShowNew]     = useState(false);

  // ── Fetch from API ─────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    setLoading(true); setApiError("");
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (e) {
      setApiError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // ── Derived list ───────────────────────────────────────────
  const filtered = projects
    .filter(p => filterStage === "All"    || p.stage    === filterStage)
    .filter(p => filterPriority === "All" || p.priority === filterPriority)
    .filter(p => !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "deadline")  return new Date(a.deadline)  - new Date(b.deadline);
      if (sortBy === "priority")  return PRIORITY[b.priority]  - PRIORITY[a.priority];
      if (sortBy === "progress")  return b.progress - a.progress;
      return a.name.localeCompare(b.name);
    });

  const kanban = STAGES.reduce((acc, s) => ({ ...acc, [s]: filtered.filter(p => p.stage === s) }), {});

  const overdue    = projects.filter(p => daysUntil(p.deadline) < 0).length;
  const inFlight   = projects.filter(p => p.stage !== "Deliver").length;
  const totalPhotos = projects.reduce((s, p) => s + (p.photo_count || 0), 0);
  const totalVideos = projects.reduce((s, p) => s + (p.video_count || 0), 0);

  const handleUpdate = (updated) => {
    setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
    setSelected(updated);
  };

  const handleCreate = (created) => {
    setProjects(ps => [...ps, created]);
  };

  const handleDelete = (id) => {
    setProjects(ps => ps.filter(p => p.id !== id));
    setSelected(null);
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{
      background: "#050d15", minHeight: "100vh",
      color: "#e8eaf0", fontFamily: "JetBrains Mono, monospace",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0a1220; }
        ::-webkit-scrollbar-thumb { background: #1e3a4a; border-radius: 2px; }
        .project-card:hover { background: #141f2e !important; border-color: #00d4c844 !important; transform: translateY(-1px); }
        input[type=range] { -webkit-appearance: none; appearance: none; background: #ffffff14; border-radius: 2px; height: 4px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; cursor: pointer; box-shadow: 0 0 8px currentColor; }
        .filter-btn { border: 1px solid #ffffff12; background: transparent; color: #4a5a6e; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 3px; cursor: pointer; text-transform: uppercase; transition: all 0.15s; }
        .filter-btn.active { background: #00d4c822; border-color: #00d4c8; color: #00d4c8; }
        .kanban-card { background: #111820; border: 1px solid #ffffff0a; border-radius: 6px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
        .kanban-card:hover { border-color: #00d4c844; background: #141f2e; }
        textarea:focus, input:focus { border-color: #00d4c8 !important; }
        select { appearance: none; }
      `}</style>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}

      {/* TOP BAR */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #ffffff0a", display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#00d4c8", textTransform: "uppercase", marginBottom: 2 }}>Accurova</div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.05em" }}>Workflow</div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 10, marginLeft: 16 }}>
          {[
            { label: "Active",   val: inFlight,                          color: "#00d4c8" },
            { label: "Overdue",  val: overdue, color: overdue > 0 ? "#ff4757" : "#4a5a6e" },
            { label: "Photos",   val: totalPhotos.toLocaleString(),       color: "#6c7a8d" },
            { label: "Clips",    val: totalVideos,                        color: "#9f7aeb" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#111820", border: "1px solid #ffffff08", borderRadius: 6, padding: "6px 12px", textAlign: "center" }}>
              <div style={{ color, fontWeight: 900, fontSize: 15 }}>{val}</div>
              <div style={{ color: "#3a4a5e", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
          style={{
            marginLeft: "auto", background: "#111820", border: "1px solid #ffffff12",
            borderRadius: 6, color: "#c8d0e0", fontFamily: "JetBrains Mono, monospace",
            fontSize: 12, padding: "7px 12px", width: 200, outline: "none",
          }} />

        {/* New project */}
        <button onClick={() => setShowNew(true)} style={{
          background: "linear-gradient(135deg, #00d4c8, #00a89e)", border: "none",
          borderRadius: 6, color: "#050d15", padding: "7px 14px",
          fontFamily: "JetBrains Mono, monospace", fontWeight: 900, fontSize: 11,
          letterSpacing: "0.1em", cursor: "pointer", textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>+ New</button>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 2, background: "#111820", borderRadius: 6, padding: 2, border: "1px solid #ffffff08" }}>
          {["board", "kanban"].map(v => (
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
      </div>

      {/* FILTER BAR */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid #ffffff06", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0, background: "#080f1a" }}>
        <span style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>Stage:</span>
        {["All", ...STAGES].map(s => (
          <button key={s} className={`filter-btn ${filterStage === s ? "active" : ""}`}
            onClick={() => setFilterStage(s)}
            style={{
              borderColor: filterStage === s && s !== "All" ? STAGE_COLOR[s] + "88" : undefined,
              color:       filterStage === s && s !== "All" ? STAGE_COLOR[s] : undefined,
              background:  filterStage === s && s !== "All" ? STAGE_COLOR[s] + "15" : undefined,
            }}>{s}</button>
        ))}
        <div style={{ width: 1, height: 16, background: "#ffffff0a", margin: "0 4px" }} />
        <span style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>Priority:</span>
        {["All", "High", "Medium", "Low"].map(p => (
          <button key={p} className={`filter-btn ${filterPriority === p ? "active" : ""}`} onClick={() => setFilterPriority(p)}>{p}</button>
        ))}
        <div style={{ width: 1, height: 16, background: "#ffffff0a", margin: "0 4px" }} />
        <span style={{ color: "#2a3a4e", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>Sort:</span>
        {[["deadline","Deadline"],["priority","Priority"],["progress","Progress"],["name","Name"]].map(([val, label]) => (
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
                  {filtered.map(p => (
                    <ProjectCard key={p.id} project={p} onClick={setSelected} selected={selected?.id === p.id} />
                  ))}
                  {filtered.length === 0 && (
                    <div style={{ color: "#2a3a4e", fontSize: 13, padding: 40, gridColumn: "1/-1", textAlign: "center" }}>
                      No projects match the current filters.
                    </div>
                  )}
                </div>
              )}

              {view === "kanban" && (
                <div style={{ display: "flex", gap: 12, minWidth: "max-content", paddingBottom: 12 }}>
                  {STAGES.map(stage => (
                    <div key={stage} style={{ minWidth: 210, flex: 1 }}>
                      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_COLOR[stage] }} />
                        <span style={{ color: STAGE_COLOR[stage], fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{stage}</span>
                        <span style={{ color: "#2a3a4e", fontSize: 10, marginLeft: "auto" }}>{kanban[stage].length}</span>
                      </div>
                      <div style={{ borderTop: `2px solid ${STAGE_COLOR[stage]}44`, paddingTop: 10 }}>
                        {kanban[stage].map(p => (
                          <div key={p.id} className="kanban-card" onClick={() => setSelected(p)}
                            style={{ borderColor: selected?.id === p.id ? "#00d4c8" : undefined }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#e8eaf0", marginBottom: 4, lineHeight: 1.3 }}>
                              {TYPE_ICON[p.type]} {p.name}
                            </div>
                            <div style={{ fontSize: 10, color: "#3a4a5e", marginBottom: 8 }}>{p.client}</div>
                            <ProgressBar value={p.progress} stage={p.stage} />
                            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                              <DeadlineBadge deadline={p.deadline} priority={p.priority} />
                              <span style={{ fontSize: 10, color: "#3a4a5e" }}>{p.progress}%</span>
                            </div>
                          </div>
                        ))}
                        {kanban[stage].length === 0 && (
                          <div style={{ color: "#1e2e3e", fontSize: 10, textAlign: "center", padding: "16px 0" }}>empty</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width: 340, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <DetailPanel project={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate} onDelete={handleDelete} />
          </div>
        )}
      </div>

      {/* DEADLINE STRIP */}
      <div style={{ borderTop: "1px solid #ffffff06", background: "#080f1a", padding: "8px 24px", display: "flex", gap: 12, overflowX: "auto", flexShrink: 0, alignItems: "center" }}>
        <span style={{ color: "#2a3a4e", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Upcoming →</span>
        {[...projects]
          .filter(p => daysUntil(p.deadline) >= 0 && daysUntil(p.deadline) <= 30)
          .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
          .map(p => {
            const urg = urgencyClass(daysUntil(p.deadline), p.priority);
            return (
              <div key={p.id} onClick={() => setSelected(p)} style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                background: "#111820", border: `1px solid ${URGENCY_COLOR[urg]}33`,
                borderRadius: 4, padding: "5px 10px", whiteSpace: "nowrap",
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: URGENCY_COLOR[urg] }} />
                <span style={{ fontSize: 10, color: "#8a9ab0" }}>{p.name}</span>
                <span style={{ fontSize: 10, color: URGENCY_COLOR[urg], fontWeight: 700 }}>{formatDeadline(p.deadline)}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
