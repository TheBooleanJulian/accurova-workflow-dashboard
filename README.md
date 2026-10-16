<div align="center">

# Accurova Workflow Dashboard

**Photoshoot processing tracker for photography & videography, backed by a Google Sheet your scan script already writes to.**

![React](https://img.shields.io/badge/-React-61DAFB?logo=react&logoColor=black)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)
![Google Sheets](https://img.shields.io/badge/-Google%20Sheets-34A853?logo=googlesheets&logoColor=white)
![Zeabur](https://img.shields.io/badge/-Zeabur-6C5CE7)
![License](https://img.shields.io/badge/license-AGPLv3%20%2B%20Commercial-00D4C8.svg)

</div>

---

## What it does

A PC-side script scans shoot folders and writes RAW/processed counts into a Google Sheet; this dashboard reads that sheet and lets you layer status, client, priority and remarks on top. One frontend serves two views: a public, read-only progress page for clients, and a password-gated admin dashboard for editing. Stack: **React + Vite** → **Express API** → **Google Sheets** · Deployed on **Zeabur** · CI/CD via **GitHub Actions**.

## Features

- Reads and augments a Google Sheet populated by an external folder-scan script — no separate database
- **Public dashboard** (`/?token=...`) — read-only shoot progress (name, date, type, status, ratio) for a *single client*, scoped by a private, unguessable per-client link. No remarks/tags/priority/exact counts exposed, and no link means no data — this is not a blanket listing of every shoot to anyone.
- **Admin dashboard** (`/#admin`) — full edit capabilities (`Workflow Status`, `Remarks`, `Client`, `Type`, `Priority`, `Tags`), gated by a single shared password; leaves scan-script-owned columns (including its own `Status`) untouched
- Admin login issues a signed, self-expiring session token (no server-side session store) instead of a baked-in build-time secret
- Filterable project list (`?status=`, `?priority=`, `?type=`) and single-shoot lookup/update endpoints
- Two-service Zeabur deployment (frontend + backend, each added manually as a Git-connected service — see §4), with GitHub Actions CI (test on `dev` and `main`; Zeabur deploys on push independently of CI)
- Custom domain (`workflow.accurova.com`) served through Cloudflare in front of Zeabur

## Screenshots

_Screenshots coming soon._

## Project Structure

```
accurova-workflow/
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx      # Hash router: "#admin" → AdminApp, else → PublicApp
│   │   ├── PublicApp.jsx # Unauthenticated read-only progress view
│   │   ├── AdminApp.jsx  # Password-gated login + full editing dashboard
│   │   ├── shared.jsx    # UI pieces shared by both views
│   │   ├── api.js        # Backend API client
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── .env.example
├── backend/           # Express REST API
│   ├── src/
│   │   └── index.js
│   ├── scripts/
│   │   └── get-oauth-refresh-token.js # one-time local helper, never deployed
│   └── .env.example
├── .github/
│   └── workflows/
│       └── deploy.yml # CI: tests + frontend build on every push to dev/main
```

---

## 1 · Google Sheet setup

The sheet is populated by your folder-scan script with these columns (first tab):

`Photoshoot Name`, `Date`, `Root Folder`, `Full Path`, `RAW Count`, `Processed Count`, `Ratio %`, `Status`, `Last Scanned`, `Status Icon`, `Remarks`

Add six more columns for the dashboard to manage — they're not written by the scan script:

`Workflow Status`, `Client`, `Type`, `Priority`, `Tags`, `Client Token`

**All six must exist as header cells before you use the dashboard** — `google-spreadsheet`'s `row.set()` silently no-ops (no error, nothing written) if the header name isn't already in the sheet's header row, it does not create new columns on the fly. Skipping this step doesn't fail loudly; it just means edits and generated client links silently go nowhere.

`Workflow Status` is deliberately not named `Status` — that header is the scan script's own computed processing state (`Fully Processed` / `Partially Processed` / `Unprocessed`), rewritten on every scan. Reusing that name for the dashboard's human-set status would mean the next scan silently overwrites whatever stage was set on the dashboard.

`Client Token` is managed by the app, not typed by hand — `POST /projects/link` (or the "Copy client link" button in the admin dashboard) fills it in once the column exists. It's how `/public/projects` scopes a link to one client's shoots (see [Security](#security)).

### Google account setup

The backend authenticates as a real Google account via OAuth, not a service-account key — many Google Workspace orgs now block service-account key creation (`iam.disableServiceAccountKeyCreation`), the same policy the [PhotoVault Tracker](../accurova-photovault-tracker) already works around this way. If you've already set up the tracker's OAuth client, reuse it here instead of creating a new one.

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project → enable the **Google Sheets API**.
2. **APIs & Services → OAuth consent screen** → choose **External** (or **Internal** on a Workspace org) → fill in the required fields → add yourself as a **Test user** if prompted.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Desktop app**.
4. Note the **Client ID** and **Client secret** → `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
5. Open the actual Google Sheet → **Share** → give the Google *account* you'll sign in with in the next step **Editor** access (not a service-account email this time — a real account you control).
6. In `backend/`, put `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` in `.env`, then run:
   ```bash
   node scripts/get-oauth-refresh-token.js
   ```
   Open the printed URL, sign in with the account from step 5, and it prints `GOOGLE_OAUTH_REFRESH_TOKEN` — copy that into `.env` (local) and the backend's Zeabur env vars (production). This is a one-time step run locally; it never runs on Zeabur.
7. The sheet ID is the long string in its URL: `https://docs.google.com/spreadsheets/d/`**`SHEET_ID`**`/edit` → `GOOGLE_SHEET_ID`.

The dashboard can edit `Workflow Status`, `Remarks`, `Client`, `Type`, `Priority`, `Tags`. It never touches `Photoshoot Name`, `Date`, `Root Folder`, `Full Path`, `RAW Count`, `Processed Count`, `Ratio %`, `Status`, `Last Scanned` or `Status Icon` — those stay owned by your scan script so the two never fight over the same cells. There's no create/delete from the dashboard either; rows come from real folders your script finds.

---

## Security

The backend serves three tiers from the same public URL:

- `GET /public/projects?token=...` — no password, but **not open**: it requires a per-client token and returns only that client's shoots, stripped to progress fields (see `PUBLIC_FIELDS` in `backend/src/index.js`). Without a valid token it returns nothing — missing token is a `400`, an unrecognized token is an empty list. There's no "show everything" fallback; a bare link with no token is a dead end by design, not an oversight.
  - The token lives in a `Client Token` column, denormalized onto every row for that client (same pattern as `Client`/`Type`/`Priority`/`Tags`), generated by `POST /projects/link` (admin-only — see API reference) and never writable through the normal `PATCH /projects/:id` path.
  - One token covers *all* of a client's shoots, past and future, because it's looked up by client name, not by individual shoot.
- `/projects` (list/get/patch) — gated by a session token obtained from `POST /admin/login`:
  1. The admin frontend (`/#admin`) posts the shared `ADMIN_PASSWORD` once.
  2. The backend compares it with a timing-safe check and, on success, returns a token signed with HMAC-SHA256 (keyed by `ADMIN_PASSWORD`) that embeds its own expiry (12h) — no server-side session store, so it survives restarts and works across multiple instances.
  3. The frontend stores that token in `localStorage` and sends it as `x-admin-token` on every `/projects` request; a `401` clears it and bounces back to the login form.

This is still a **shared password**, not per-user accounts — good enough to keep casual visitors out of the edit surface, not a substitute for real access control if the data is sensitive. For that, put `workflow.accurova.com` (or at least the `/#admin` path) behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) (Zero Trust → Access → Applications) as well, restricted to your team's email addresses — it blocks the request before it ever reaches Zeabur.

Generate a strong password with `openssl rand -hex 16` and set it as `ADMIN_PASSWORD` in the backend's Zeabur env (see §4) and in CI (§3, for the test suite's login test — any value works there, it just needs to be set).

---

## 2 · Local development

### Backend

```bash
cd backend
cp .env.example .env          # fill in GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN + GOOGLE_SHEET_ID + ADMIN_PASSWORD
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

No deploy-trigger secrets needed — Zeabur's Git-connected services auto-deploy on every push to `main` on their own; there's no separate webhook to configure. This workflow is a test/build gate, not what triggers the deploy.

Backend tests don't touch the real sheet — validation runs before any Google Sheets API call — so no Google credentials are needed in CI.

---

## 4 · Zeabur setup

This is a monorepo with two independent apps in it — Zeabur does not auto-split a repo into multiple services from a config file; **each service has to be added manually**, once per app.

1. Go to [zeabur.com](https://zeabur.com) → **New Project**.
2. **Add Service** → **Git** (deploy from your GitHub repo, not Docker Image/Prebuilt) → select `accurova-workflow-dashboard`. This becomes the **backend**: Root Directory `backend`, Build Command `npm ci`, Start Command `npm start`. Name it `accurova-workflow-api` (or note whatever URL Zeabur assigns it).
3. **Add Service** again, same repo, same way. This becomes the **frontend**: Root Directory `frontend`, Build Command `npm ci && npm run build`, Output Directory `dist`. Name it `accurova-workflow-app`.

   If either service's config screen shows **ENTRYPOINT/CMD** (Startup Command/Arguments) instead of Root Directory/Build Command/Start Command, it was created as a **Prebuilt Image** deployment by mistake, not a Git one — delete it and re-add it, making sure you pick the Git/GitHub option, not an image.

4. For each service, add environment variables in the Zeabur dashboard:

   **Backend** (`accurova-workflow-api`):
   ```
   GOOGLE_OAUTH_CLIENT_ID       = xxxx.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET   = xxxx
   GOOGLE_OAUTH_REFRESH_TOKEN   = (from: node scripts/get-oauth-refresh-token.js — see §1)
   GOOGLE_SHEET_ID              = 1ucQvqmJji7kvbrUJTCRZFZibomG5belAWQrQutu4VFQ
   FRONTEND_URL                 = https://workflow.accurova.com
   ADMIN_PASSWORD               = (generate with: openssl rand -hex 16)
   ```

   **Frontend** (`accurova-workflow-app`):
   ```
   VITE_API_URL = https://accurova-workflow-api.zeabur.app
   ```

5. **Custom domain** — the frontend is served at `https://workflow.accurova.com`, not the default `*.zeabur.app` domain:
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
git push origin main    →  Tests run (quality gate) ‖ Zeabur auto-deploys both
                            services in parallel on the same push — live in ~60s
```

The GitHub Actions workflow and Zeabur's deploy are two independent reactions to the same `git push`, not a pipeline where one triggers the other — Zeabur's own GitHub integration redeploys Git-connected services on every push regardless of whether CI passes. Actions is here to catch regressions, not to gate the deploy.

Or just open a PR from `dev` → `main` and merge it.

---

## 6 · API reference

Rows are identified by their sheet row number (`id`). There's no create/delete endpoint — rows come from your scan script.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | none | Health check |
| GET | `/public/projects?token=...` | per-client token | That client's shoots only, progress fields (`id`, `name`, `date`, `client`, `type`, `status`, `ratio`, `status_icon`). `400` with no token; `[]` with an unrecognized one. |
| POST | `/admin/login` | — | `{ "password": "..." }` → `{ "token", "expiresAt" }` on success, `401` otherwise |
| GET | `/projects` | `x-admin-token` | List all shoots, full fields (`?status=Editing&priority=High&type=Photo`) |
| GET | `/projects/:id` | `x-admin-token` | Single shoot, full fields |
| PATCH | `/projects/:id` | `x-admin-token` | Update `status`, `remarks`, `client`, `type`, `priority`, or `tags` |
| POST | `/projects/link` | `x-admin-token` | `{ "client": "..." }` → generates (or reuses) that client's private-link token, writes it to every matching row, returns `{ "token", "client", "shootCount" }` |

`x-admin-token` is the token returned by `/admin/login`; it's self-expiring (12h) and signed with `ADMIN_PASSWORD`, so the backend needs no session store to validate it.

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

### [Unreleased]

- **Breaking:** `GET /public/projects` now requires a per-client `?token=` — previously it returned every shoot to anyone with the link. Added `POST /projects/link` (admin-only) to generate/reuse a client's token, a `Client Token` sheet column to hold it, and a "Copy client link" button in the admin dashboard. The public page shows a "private link required" gate instead of data when no token is present. See [Security](#security).
- Removed `zeabur.yaml` — it never matched Zeabur's real schema for anything (not the Template marketplace format, which it superficially resembled and which requires prebuilt Docker images rather than Git-connected services; not a documented monorepo-config format either), and never actually auto-split this repo into two services the way earlier docs claimed. §4 now documents adding both services manually through the dashboard instead.
- Removed the GitHub Actions "Deploy to Zeabur" job and its `ZEABUR_DEPLOY_HOOK_*` secrets — that's not a real Zeabur feature (no such webhook setting exists in the dashboard), which is why it had been failing silently on every `main` push. Zeabur's Git-connected services already auto-deploy on push on their own; Actions is now test/build-only.
- **Breaking:** switched the backend's Google auth from a service-account key to OAuth (`GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`/`GOOGLE_OAUTH_REFRESH_TOKEN`, replacing `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_KEY`) — service-account key creation is blocked under Google Workspace orgs with `iam.disableServiceAccountKeyCreation` enforced. See §1 and `scripts/get-oauth-refresh-token.js`.
- **Breaking:** replaced the shared `API_KEY`/`VITE_API_KEY` build-time secret with a split public/admin model — `GET /public/projects` is now unauthenticated (progress fields only), and `/projects` is gated by a session token from `POST /admin/login` (shared `ADMIN_PASSWORD`) instead. See [Security](#security).
- Added a separate public, read-only dashboard (`/`) alongside the existing editing dashboard, now moved to `/#admin` behind the password login.
- Renamed the dashboard's editable `Status` column to `Workflow Status` to stop colliding with the PhotoVault Tracker's own computed `Status` column when both apps share a sheet.

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
