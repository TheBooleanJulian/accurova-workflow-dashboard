// frontend/src/shared.jsx
// Pieces shared between the public dashboard and the admin dashboard.

export const TYPE_ICON = { Photo: "📷", Video: "🎬", Mixed: "🎞️" };
export const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1, "": 0 };

const NEUTRAL = "#6c7a8d";
const STATUS_PALETTE = [
  { match: /complete|done|delivered/i,        color: "#2ed573" },
  { match: /progress|processing|editing|cull|ingest/i, color: "#00b4a8" },
  { match: /error|issue|stuck|blocked/i,       color: "#ff4757" },
  { match: /not started|pending|new|queued/i,  color: "#a07d4f" },
];

export function statusColor(status) {
  const hit = STATUS_PALETTE.find((s) => s.match.test(status || ""));
  return hit ? hit.color : NEUTRAL;
}

// Strips a leading "YYYY_MM_DD " / "YYYY-MM-DD " folder-name date prefix for
// display — the date is already shown separately, and the prefix otherwise
// eats the title's width before the actual event/client name is visible.
// Cosmetic only: the underlying `name` field (and the scan script's data)
// is untouched.
export function displayName(name) {
  const stripped = (name || "").replace(/^\d{4}[-_]\d{2}[-_]\d{2}[\s_-]*/, "").trim();
  return stripped || name || "";
}

// Parsed manually (not `new Date(dateStr).toLocaleDateString()`) to avoid a
// timezone-driven off-by-one day — "2026-10-15" is a plain calendar date,
// not a UTC instant.
export function formatDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
  if (!m) return dateStr || "—";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Caps the displayed percentage at 100 — a shoot can genuinely have more
// processed files than raw ones (multiple exports per RAW), but showing
// e.g. "50033.3%" on a client-facing page reads as broken, not accurate.
export function displayRatio(value) {
  return Number.isFinite(value) ? Math.min(100, Math.round(value)) : null;
}

export function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  return Number.isNaN(d) ? null : d;
}

export function formatScanned(dateStr) {
  const d = daysAgo(dateStr);
  if (d === null)   return "never";
  if (d <= 0)        return "today";
  if (d === 1)       return "yesterday";
  return `${d}d ago`;
}

export function StatusChip({ status }) {
  const c = statusColor(status);
  return (
    <span style={{
      background: c + "22", color: c, border: `1px solid ${c}55`,
      borderRadius: 4, padding: "2px 8px",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace",
      whiteSpace: "nowrap",
    }}>{status || "—"}</span>
  );
}

export function RatioBar({ value, color }) {
  return (
    <div style={{ height: 4, background: "#ffffff0d", borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, value || 0))}%`, height: "100%",
        background: `linear-gradient(90deg, ${color}99, ${color})`,
        borderRadius: 2, transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
        boxShadow: value > 0 ? `0 0 8px ${color}66` : "none",
      }} />
    </div>
  );
}

export function Spinner() {
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

export const GLOBAL_STYLES = `
  * { box-sizing: border-box; }
  @keyframes spin { to { transform: rotate(360deg); } }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #0a1220; }
  ::-webkit-scrollbar-thumb { background: #1e3a4a; border-radius: 2px; }
  .project-card:hover { background: #141f2e !important; border-color: #00d4c844 !important; transform: translateY(-1px); }
  .filter-btn { border: 1px solid #ffffff12; background: transparent; color: #4a5a6e; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 3px; cursor: pointer; text-transform: uppercase; transition: all 0.15s; }
  .filter-btn.active { background: #00d4c822; border-color: #00d4c8; color: #00d4c8; }
  .table-row { cursor: pointer; transition: background 0.15s; }
  .table-row:hover { background: #141f2e; }
  textarea:focus, input:focus, select:focus { border-color: #00d4c8 !important; }
  select { appearance: none; }
`;
