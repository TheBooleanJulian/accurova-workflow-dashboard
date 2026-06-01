# Accurova Workflow Dashboard

Full-stack project workflow tracker for photography & videography.  
Stack: **React + Vite** → **Express API** → **Supabase** · Deployed on **Zeabur** · CI/CD via **GitHub Actions**

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
├── supabase/
│   └── schema.sql     # Run this once in Supabase SQL editor
├── .github/
│   └── workflows/
│       └── deploy.yml # CI/CD: test on dev, deploy on main
└── zeabur.yaml        # Zeabur monorepo config
```

---

## 1 · Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste and run `supabase/schema.sql`.
3. Go to **Project Settings → API** and note:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY` *(keep this secret — server only)*

---

## 2 · Local development

### Backend

```bash
cd backend
cp .env.example .env          # fill in SUPABASE_URL + SUPABASE_SERVICE_KEY
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
| `SUPABASE_URL_TEST` | Supabase URL for a test project |
| `SUPABASE_SERVICE_KEY_TEST` | service_role key for test project |
| `VITE_API_URL` | `https://accurova-workflow-api.zeabur.app` |
| `ZEABUR_DEPLOY_HOOK_BACKEND` | Zeabur deploy webhook URL (see step 4) |
| `ZEABUR_DEPLOY_HOOK_FRONTEND` | Zeabur deploy webhook URL (see step 4) |

---

## 4 · Zeabur setup

1. Go to [zeabur.com](https://zeabur.com) → **New Project**.
2. Choose **Deploy from GitHub** → select `accurova-workflow`.
3. Zeabur reads `zeabur.yaml` and creates two services automatically.
4. For each service, add environment variables in the Zeabur dashboard:

   **Backend** (`accurova-workflow-api`):
   ```
   SUPABASE_URL          = https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY  = eyJ...
   FRONTEND_URL          = https://accurova-workflow-app.zeabur.app
   ```

   **Frontend** (`accurova-workflow-app`):
   ```
   VITE_API_URL = https://accurova-workflow-api.zeabur.app
   ```

5. In each service → **Settings → Deploy Hooks**, create a hook and copy the URL into the GitHub Secrets above.

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

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/projects` | List all projects (`?stage=Edit&priority=High`) |
| GET | `/projects/:id` | Single project |
| POST | `/projects` | Create project |
| PATCH | `/projects/:id` | Update fields (stage, progress, notes, …) |
| DELETE | `/projects/:id` | Delete project |

---

## 7 · Extending

- **Telegram alerts**: add a cron in the backend that queries Supabase for overdue projects and fires a message via your bot-core library.
- **Auth**: enable Supabase Auth + update the RLS policy to `auth.uid() = owner_id`.
- **File attachments**: use Supabase Storage for brief + deliverable files per project.
