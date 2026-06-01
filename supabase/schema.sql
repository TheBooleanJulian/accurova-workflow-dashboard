-- ============================================================
-- Accurova Workflow Dashboard — Supabase Schema
-- Run this in the Supabase SQL editor to bootstrap the DB
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── PROJECTS ────────────────────────────────────────────────
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client      text not null,
  type        text not null check (type in ('Photo', 'Video', 'Mixed')),
  stage       text not null check (stage in ('Shoot', 'Ingest', 'Cull', 'Edit', 'Export', 'Deliver')) default 'Shoot',
  priority    text not null check (priority in ('High', 'Medium', 'Low')) default 'Medium',
  deadline    date not null,
  shoot_date  date,
  photo_count integer not null default 0,
  video_count integer not null default 0,
  progress    integer not null default 0 check (progress between 0 and 100),
  notes       text default '',
  tags        text[] default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
-- For now: open access with service role key (server-side only).
-- Enable RLS but allow the service role to bypass it.
alter table projects enable row level security;

-- Policy: service role (used by backend) can do everything.
-- The anon/authenticated keys are NOT exposed to the frontend.
create policy "service role full access"
  on projects for all
  using (true)
  with check (true);

-- ── SEED DATA ────────────────────────────────────────────────
insert into projects (name, client, type, stage, priority, deadline, shoot_date, photo_count, video_count, progress, notes, tags) values
  ('Ng Wedding Banquet',     'Ng & Lim Family',    'Mixed', 'Edit',    'High',   '2026-06-05', '2026-05-24', 1840, 12, 58, 'Banquet hall lighting tricky. 3 highlight reels needed.', array['wedding','banquet']),
  ('TechCorp Headshots Q2',  'TechCorp Pte Ltd',   'Photo', 'Cull',    'High',   '2026-06-03', '2026-05-30',  420,  0, 35, '48 pax. Deliver web + print sizes. Brand guide attached.', array['corporate','headshots']),
  ('Mei & Darren Actual Day','Mei Ling Tan',        'Photo', 'Export',  'Medium', '2026-06-14', '2026-05-18',  920,  0, 88, 'Final selects approved. Awaiting address for USB delivery.', array['wedding','actual-day']),
  ('Aether Spirits Brand Film','Aether Spirits SG', 'Video', 'Edit',    'High',   '2026-06-10', '2026-05-22',    0, 34, 42, 'Color grade after rough cut approval. VO not recorded yet.', array['commercial','brand-film']),
  ('SGSME Conf Coverage',    'SGSME Assoc.',       'Mixed', 'Ingest',  'Medium', '2026-06-18', '2026-05-31', 2100,  8, 12, 'Dual-card backup in progress. Corrupted card slot 2 — check.', array['event','conference']),
  ('Priya Maternity Session','Priya Krishnan',     'Photo', 'Deliver', 'Low',    '2026-06-20', '2026-05-10',  310,  0,100, 'Gallery link sent. Awaiting client download confirmation.', array['portrait','maternity']),
  ('Zouk NYE Recap',         'Zouk Singapore',     'Video', 'Shoot',   'Medium', '2026-07-01', '2026-06-15',    0,  0,  0, 'Pre-production: storyboard + shot list pending.', array['nightlife','recap']);
