# Accurova Workflow Dashboard

Photoshoot processing tracker for photography & videography.
A PC-side script scans shoot folders and writes RAW/processed counts into a Google Sheet; this dashboard reads that sheet and lets you layer status, client, priority and remarks on top.

Stack: **React + Vite** → **Express API** → **Google Sheets** · Deployed on **Zeabur** · CI/CD via **GitHub Actions**

```
accurova-workflow/
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx    # Dashboard UI
│   │   ├── api.js     # Backend API client
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── .env.example
├── backend/           # Express REST API
│   ├── src/
│   │   └── index.js
│   └── .env.example
├── .github/
│   └── workflows/
│       └── deploy.yml # CI/CD: test on dev, deploy on main
└── zeabur.yaml        # Zeabur monorepo config
```

---

## 1 · Google Sheet setup

The sheet is populated by your folder-scan script with these columns (first tab):

`Photoshoot Name`, `Date`, `Root Folder`, `Full Path`, `RAW Count`, `Processed Count`, `Ratio %`, `Status`, `Last Scanned`, `Status Icon`, `Remarks`

Add four more columns for the dashboard to manage manually — they're not written by the scan script:

`Client`, `Type`, `Priority`, `Tags`

The backend needs its own Google Cloud service account to read/write the sheet:

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project → enable the **Google Sheets API**.
2. **IAM & Admin → Service Accounts** → **Create Service Account**. No roles needed at the project level.
3. Open the service account → **Keys** → **Add Key** → **Create new key** → JSON. Download it.
4. From the JSON, note `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `private_key` → `GOOGLE_SERVICE_ACCOUNT_KEY`.
5. Open the actual Google Sheet → **Share** → paste the service account's `client_email` → give it **Editor** access.
6. The sheet ID is the long string in its URL: `https://docs.google.com/spreadsheets/d/`**`SHEET_ID`**`/edit` → `GOOGLE_SHEET_ID`.

The dashboard can edit `Status`, `Remarks`, `Client`, `Type`, `Priority`, `Tags`. It never touches `Photoshoot Name`, `Date`, `Root Folder`, `Full Path`, `RAW Count`, `Processed Count`, `Ratio %`, `Last Scanned` or `Status Icon` — those stay owned by your scan script so the two never fight over the same cells. There's no create/delete from the dashboard either; rows come from real folders your script finds.

---

## 2 · Local development

### Backend

```bash
cd backend
cp .env.example .env          # fill in GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY + GOOGLE_SHEET_ID
npm install
npm run dev                   # http://localhost:3001
```

Test health:
```bash
curl http://localhost:3001/health
```

### Frontend

```bash
cd frontend
cp .env.example .env.local    # VITE_API_URL is optional in dev (Vite proxy handles it)
npm install
npm run dev                   # http://localhost:5173
```

In dev, Vite automatically proxies `/api/*` → `localhost:3001`, so no CORS issues.

---

## 3 · GitHub repository setup

```bash
git init
git remote add origin https://github.com/TheBooleanJulian/accurova-workflow.git
git checkout -b dev
git add .
git commit -m "feat: initial accurova workflow dashboard"
git push -u origin dev
```

### Required GitHub Secrets

Go to **Settings → Secrets → Actions** and add:

| Secret | Value |
|--------|-------|
| `VITE_API_URL` | `https://accurova-workflow-api.zeabur.app` |
| `ZEABUR_DEPLOY_HOOK_BACKEND` | Zeabur deploy webhook URL (see step 4) |
| `ZEABUR_DEPLOY_HOOK_FRONTEND` | Zeabur deploy webhook URL (see step 4) |

Backend tests don't touch the real sheet — validation runs before any Google Sheets API call — so no Google credentials are needed in CI.

---

## 4 · Zeabur setup

1. Go to [zeabur.com](https://zeabur.com) → **New Project**.
2. Choose **Deploy from GitHub** → select `accurova-workflow`.
3. Zeabur reads `zeabur.yaml` and creates two services automatically.
4. For each service, add environment variables in the Zeabur dashboard:

   **Backend** (`accurova-workflow-api`):
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL = xxxx@xxxx.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_KEY   = -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
   GOOGLE_SHEET_ID              = 1ucQvqmJji7kvbrUJTCRZFZibomG5belAWQrQutu4VFQ
   FRONTEND_URL                 = https://workflow.accurova.com
   ```

   **Frontend** (`accurova-workflow-app`):
   ```
   VITE_API_URL = https://accurova-workflow-api.zeabur.app
   ```

5. In each service → **Settings → Deploy Hooks**, create a hook and copy the URL into the GitHub Secrets above.

6. **Custom domain** — the frontend is served at `https://workflow.accurova.com`, not the default `*.zeabur.app` domain:
   - In the `accurova-workflow-app` service → **Settings → Domains** → **Add Domain** → enter `workflow.accurova.com`.
   - Zeabur will give you a CNAME target — add a `CNAME` record for `workflow` pointing to it in your DNS provider for `accurova.com`.
   - Once DNS resolves, Zeabur issues the TLS cert automatically.
   - Keep `VITE_API_URL` and the CI secret `VITE_API_URL` pointed at the backend's URL (`accurova-workflow-api.zeabur.app`, or its own custom domain if you set one) — that's unrelated to the frontend's domain.

   `accurova.com`'s DNS is proxied through **Cloudflare**, which needs two adjustments since Cloudflare terminates TLS in front of Zeabur:
   - **SSL/TLS mode** — set to **Full (strict)** (or **Full**) in Cloudflare → SSL/TLS. Leaving it on **Flexible** causes a redirect loop against Zeabur's HTTPS redirect.
   - **Cert issuance** — Zeabur validates the domain via an HTTP challenge, which can fail while the record is proxied (orange cloud). If verification stalls, temporarily switch the `workflow` CNAME to **DNS only** (grey cloud) in Cloudflare, wait for Zeabur to confirm the domain/cert, then switch it back to **Proxied** (orange cloud).

---

## 5 · CI/CD flow

```
git push origin dev     →  Tests run (backend + frontend build)
                              ↓ pass
git checkout main
git merge dev
git push origin main    →  Tests run → Zeabur deploy hooks fire → live in ~60s
```

Or just open a PR from `dev` → `main` and merge it — Actions handles the rest.

---

## 6 · API reference

Rows are identified by their sheet row number (`id`). There's no create/delete endpoint — rows come from your scan script.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/projects` | List all shoots (`?status=Editing&priority=High&type=Photo`) |
| GET | `/projects/:id` | Single shoot |
| PATCH | `/projects/:id` | Update `status`, `remarks`, `client`, `type`, `priority`, or `tags` |

A project object looks like:

```json
{
  "id": 2,
  "name": "2026-07-24_ClientA",
  "date": "2026-07-24",
  "root_folder": "D:/Shoots",
  "full_path": "D:/Shoots/2026-07-24_ClientA",
  "raw_count": 1240,
  "processed_count": 860,
  "ratio": 69,
  "status": "Editing",
  "last_scanned": "2026-08-01T22:10:00Z",
  "status_icon": "🟡",
  "remarks": "",
  "client": "",
  "type": "",
  "priority": "",
  "tags": []
}
```

---

## 7 · Extending

- **Telegram alerts**: add a cron in the backend that reads the sheet for shoots stuck below a ratio threshold and fires a message via your bot-core library.
- **Auth**: add an API-key or JWT middleware in front of the `/projects` routes (see roadmap below — there's none today).
- **Multi-tab sheets**: if you split shoots across multiple tabs (e.g. by year), swap `doc.sheetsByIndex[0]` in `backend/src/index.js` for logic that reads all tabs and merges rows.

---

## 8 · Future roadmap

Ideas for where this could go next, roughly in priority order:

- **API authentication** — every `/projects` route is currently open to anyone who can reach the backend. Add an API-key or JWT middleware before this goes anywhere near real client data.
- **Telegram alerts** — low-ratio / stalled-shoot notifications via a scheduled job (see Extending above); low effort, high value.
- **Activity log / audit trail** — the Sheets API supports revision history, but a lightweight in-app log of who changed Status/Remarks and when would be more useful day-to-day.
- **Reporting** — throughput trends, average time-to-complete, ratio distribution across shoots.
- **Bulk actions** — multi-select shoots in the table view to bulk-update status/priority.
- **Integrations** — Slack/Discord notifications, calendar sync for shoot dates.
- **PWA / mobile-friendly UI** — useful for checking status on-site during a shoot.
- **Automated changelog** — adopt Conventional Commits + a tool like `semantic-release` or `release-please` to generate the changelog below and bump versions automatically instead of by hand.

Contributions and suggestions welcome — open an issue.

---

## 9 · Changelog

Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):

- **MAJOR** — breaking changes (API/schema changes that require migration)
- **MINOR** — new features, backwards compatible (`feat:` commits)
- **PATCH** — bug fixes, backwards compatible (`fix:` commits)

### [2.0.0] — 2026-08-02

- **Breaking:** replaced Supabase with a Google Sheet as the data store, driven by an external folder-scan script. Dropped `stage`/`deadline`/`photo_count`/`video_count` and the create/delete endpoints; added `date`, `root_folder`, `full_path`, `raw_count`, `processed_count`, `ratio`, `last_scanned`, `status_icon`, plus manually-managed `client`/`type`/`priority`/`tags` columns. Dashboard redesigned around Status/Ratio instead of a Shoot→Deliver kanban.

### [1.0.0] — 2026-07-24

- Initial release: Express + Supabase REST API (`/projects` CRUD, `/health`), React + Vite dashboard, CI/CD via GitHub Actions, Zeabur deployment config.

---

## 10 · License

This project is dual licensed.

- **Community Edition** — [GNU Affero General Public License v3 (AGPLv3)](LICENSE). Free to use, modify, and self-host. If you distribute a modified version or run it as a network service, you must make the corresponding source available.
- **Commercial License** — for organisations that want to embed, modify, or distribute this software without AGPLv3's obligations. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Built by [@TheBooleanJulian](https://github.com/TheBooleanJulian).
