-- supabase/migrations/040_tournament_drafts.sql
-- Tabla principal del borrador
create table if not exists public.tournament_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'creating', 'created', 'archived')),
  version integer not null default 1,
  tournament_id uuid references public.tournaments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tournament_drafts_owner on public.tournament_drafts(owner_id);
create index if not exists idx_tournament_drafts_status on public.tournament_drafts(status);
create index if not exists idx_tournament_drafts_updated on public.tournament_drafts(updated_at);

-- Trigger updated_at
create or replace function public.touch_tournament_drafts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_tournament_drafts_updated_at on public.tournament_drafts;
create trigger trg_tournament_drafts_updated_at
before update on public.tournament_drafts
for each row execute function public.touch_tournament_drafts_updated_at();

-- Colaboradores
create table if not exists public.tournament_draft_collaborators (
  draft_id uuid not null references public.tournament_drafts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'collaborator')),
  added_by uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (draft_id, user_id)
);

create index if not exists idx_tdc_user on public.tournament_draft_collaborators(user_id);

-- Audit log append-only
create table if not exists public.tournament_draft_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.tournament_drafts(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  config_partial jsonb not null,
  config_before jsonb,
  source text not null check (source in ('manual', 'ai')),
  ai_message text,
  ai_explanation text,
  ai_cost_usd numeric(8, 5),
  ai_latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_tde_draft on public.tournament_draft_events(draft_id, created_at);

-- Plantillas (estructura, sin UI en MVP)
create table if not exists public.tournament_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  config jsonb not null,
  is_global boolean not null default false,
  created_at timestamptz not null default now()
);

-- Tokens compartibles para invitar
create table if not exists public.tournament_draft_share_tokens (
  token text primary key,
  draft_id uuid not null references public.tournament_drafts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tdst_draft on public.tournament_draft_share_tokens(draft_id);
create index if not exists idx_tdst_expires on public.tournament_draft_share_tokens(expires_at) where consumed_at is null;

-- Premios persistidos al crear torneo
create table if not exists public.tournament_prizes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  type text not null,
  description text not null,
  category_id uuid references public.categories(id) on delete set null,
  position integer,
  hole_number integer,
  awarded_to uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tp_tournament on public.tournament_prizes(tournament_id);

-- RLS tournament_drafts
alter table public.tournament_drafts enable row level security;

drop policy if exists tournament_drafts_select on public.tournament_drafts;
create policy tournament_drafts_select on public.tournament_drafts
  for select using (
    owner_id = auth.uid()
    or auth.uid() in (
      select user_id from public.tournament_draft_collaborators
      where draft_id = id
    )
  );

drop policy if exists tournament_drafts_insert on public.tournament_drafts;
create policy tournament_drafts_insert on public.tournament_drafts
  for insert with check (owner_id = auth.uid());

drop policy if exists tournament_drafts_update on public.tournament_drafts;
create policy tournament_drafts_update on public.tournament_drafts
  for update using (
    owner_id = auth.uid()
    or auth.uid() in (
      select user_id from public.tournament_draft_collaborators
      where draft_id = id
    )
  );

drop policy if exists tournament_drafts_delete on public.tournament_drafts;
create policy tournament_drafts_delete on public.tournament_drafts
  for delete using (owner_id = auth.uid());

-- RLS collaborators
alter table public.tournament_draft_collaborators enable row level security;

drop policy if exists tdc_select on public.tournament_draft_collaborators;
create policy tdc_select on public.tournament_draft_collaborators
  for select using (
    user_id = auth.uid()
    or draft_id in (
      select id from public.tournament_drafts where owner_id = auth.uid()
    )
  );

drop policy if exists tdc_insert on public.tournament_draft_collaborators;
create policy tdc_insert on public.tournament_draft_collaborators
  for insert with check (
    draft_id in (select id from public.tournament_drafts where owner_id = auth.uid())
  );

drop policy if exists tdc_delete on public.tournament_draft_collaborators;
create policy tdc_delete on public.tournament_draft_collaborators
  for delete using (
    draft_id in (select id from public.tournament_drafts where owner_id = auth.uid())
  );

-- RLS events (read igual al draft, insert por server, no update/delete jamás)
alter table public.tournament_draft_events enable row level security;

drop policy if exists tde_select on public.tournament_draft_events;
create policy tde_select on public.tournament_draft_events
  for select using (
    draft_id in (
      select id from public.tournament_drafts
      where owner_id = auth.uid()
        or auth.uid() in (
          select user_id from public.tournament_draft_collaborators
          where draft_id = tournament_drafts.id
        )
    )
  );

-- Solo server (service role) inserta. Sin policy de insert para anon.

-- RLS share tokens (solo el owner del draft puede leer/crear)
alter table public.tournament_draft_share_tokens enable row level security;

drop policy if exists tdst_select on public.tournament_draft_share_tokens;
create policy tdst_select on public.tournament_draft_share_tokens
  for select using (
    created_by = auth.uid()
    or draft_id in (select id from public.tournament_drafts where owner_id = auth.uid())
  );

drop policy if exists tdst_insert on public.tournament_draft_share_tokens;
create policy tdst_insert on public.tournament_draft_share_tokens
  for insert with check (created_by = auth.uid());

-- Templates: owner ve los suyos, todos ven los globales
alter table public.tournament_templates enable row level security;

drop policy if exists tt_select on public.tournament_templates;
create policy tt_select on public.tournament_templates
  for select using (is_global or owner_id = auth.uid());

drop policy if exists tt_insert on public.tournament_templates;
create policy tt_insert on public.tournament_templates
  for insert with check (owner_id = auth.uid());

-- Prizes: owner del torneo
alter table public.tournament_prizes enable row level security;

drop policy if exists tp_select on public.tournament_prizes;
create policy tp_select on public.tournament_prizes
  for select using (
    tournament_id in (select id from public.tournaments where organizer_id = auth.uid())
    or tournament_id in (select tournament_id from public.players where user_id = auth.uid())
  );
