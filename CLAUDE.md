# Accurova Workflow Dashboard — project-specific

## There is no `zeabur.yaml` config for this monorepo
A previous `zeabur.yaml` at the repo root claimed Zeabur would read it and
auto-create both services with the right Root Directory/Build/Start
Command. That was never true — the file didn't match any real Zeabur
schema (not the Template marketplace format it superficially resembled,
which requires prebuilt Docker images anyway, not Git services; not a
documented monorepo-config format either). Removed. Both services
(`backend`, `frontend`) have to be added manually through the Zeabur
dashboard — see README §4. If a service's config screen shows
ENTRYPOINT/CMD (Startup Command/Arguments) instead of Root
Directory/Build Command/Start Command, it was created as a Prebuilt Image
deployment by mistake — delete and re-add it as Git instead; a Docker
image has no source code in it for `npm ci`/`npm start` to act on.

## Zeabur has no "Deploy Hook" webhook feature
Don't go looking for one, and don't re-add a GitHub Actions step that posts
to one. Confirmed against Zeabur's own docs: Git-connected services
auto-deploy on every push to their linked branch on their own. A prior
version of `.github/workflows/deploy.yml` posted to
`ZEABUR_DEPLOY_HOOK_BACKEND`/`FRONTEND` secrets that were never
configurable because the setting doesn't exist — it failed silently
(`exit code 3`, curl choking on an empty URL) on every `main` push for a
month while Zeabur deployed anyway, independent of that job. Actions here
is a test/build quality gate, not the deploy trigger.

## Google auth is OAuth, not a service-account key
`iam.disableServiceAccountKeyCreation` is enforced on this org's GCP
projects, so service-account **key** creation is blocked — same wall the
[PhotoVault Tracker](../accurova-photovault-tracker) already hit. The
backend (`backend/src/index.js`) authenticates via `OAuth2Client` +
a refresh token instead (`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`/
`_REFRESH_TOKEN`). The refresh token is minted once, locally, via
`backend/scripts/get-oauth-refresh-token.js` — that script never runs on
Zeabur. Reuse the tracker's existing OAuth client rather than creating a
new one, since both need the same Sheets scope on the same sheet.

## `Status` vs `Workflow Status` — don't collide them again
The shared Google Sheet has two similarly-named columns owned by two
different apps:
- `Status` — the PhotoVault Tracker's own computed processing state
  (`Fully Processed` / `Partially Processed` / `Unprocessed`), rewritten on
  every scan.
- `Workflow Status` — this dashboard's human-set field (`status` in the
  API). Deliberately not named `Status`; it used to be, and the tracker's
  rewrite silently clobbered it on the next scan.

The tracker's rewrite paths (`sync_engine.py`) also preserve this
dashboard's other columns (`Client`, `Type`, `Priority`, `Tags`) across
rewrites, the same way it already preserved `Remarks`. If you add another
dashboard-owned column, add it to `DASHBOARD_COLUMNS` there too, or a bulk
rewrite will blank it.

## Public vs admin dashboard
Two views, one SPA, split by URL hash (not a path) because this is a
static host with no server-side rewrite rules configured: `/` is the
unauthenticated public progress page (`PublicApp.jsx`), `/#admin` is the
password-gated full editing dashboard (`AdminApp.jsx`). The backend
mirrors this split — `GET /public/projects` (no auth, stripped fields) vs
`/projects` (requires `x-admin-token`, obtained from `POST /admin/login`).
Don't widen `PUBLIC_FIELDS` in `backend/src/index.js` without checking
whether that's meant to stay client-invisible (remarks, tags, priority,
and exact raw/processed counts are deliberately excluded).
