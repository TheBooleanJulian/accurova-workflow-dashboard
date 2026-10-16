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
public progress page (`PublicApp.jsx`), `/#admin` is the password-gated
full editing dashboard (`AdminApp.jsx`). The backend mirrors this split —
`GET /public/projects` (token-scoped, stripped fields) vs `/projects`
(requires `x-admin-token`, obtained from `POST /admin/login`). Don't widen
`PUBLIC_FIELDS` in `backend/src/index.js` without checking whether that's
meant to stay client-invisible (remarks, tags, priority, and exact
raw/processed counts are deliberately excluded).

## The public dashboard is per-client, not a blanket listing
This was deliberately reconsidered mid-project: an earlier version made
`/public/projects` return every shoot, unauthenticated, to anyone with the
link — a conscious simplicity tradeoff at the time. Once real data went
live (~1,400 shoots, real client names), that read as an actual privacy
exposure and got reversed. Don't revert to a blanket public listing even
for convenience — `GET /public/projects` now requires `?token=`, matched
against a `Client Token` column on each row (`POST /projects/link`
generates/reuses one per client, propagated to every row sharing that
`Client` name, case-insensitive exact match). No token → `400`. An
unrecognized token → `[]`, not an error and not a fallback to "show
everything."

`row.set()` in `google-spreadsheet` silently no-ops on a header that
doesn't exist in the sheet (no error, nothing written, no new column
created) — if `Client Token` isn't already a header cell in the actual
sheet, `POST /projects/link` fails loudly with a 500 pointing at this
(checked via `sheet.headerValues.includes(...)` up front). If you add any
other new writable/internal column in the future, add it to the sheet's
header row manually first — nothing here creates columns on the fly.
