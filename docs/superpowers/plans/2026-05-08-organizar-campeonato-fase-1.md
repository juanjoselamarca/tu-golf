# Organizar Campeonato — Fase 1: Modelo y Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear las tablas, schemas, validadores y endpoints API que sostienen el flow nuevo de Organizar Campeonato. No incluye frontend (Fase 2).

**Architecture:** Schema relacional con jsonb para el config del draft. Validación en cliente y servidor con el mismo zod schema. Patches expresados como `Partial<TournamentConfig>` que se mergean profundo. Audit log append-only para trazabilidad. RLS para multi-admin seguro. IA con rate limit y telemetría de costo.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + RLS), TypeScript estricto, zod, Vitest, Anthropic SDK (@anthropic-ai/sdk), Vercel Cron.

**Spec base:** `docs/superpowers/specs/2026-05-07-organizar-campeonato-design.md`

---

## Pre-requisitos (gating CERO FALLOS)

Antes de empezar este plan, deben estar cerrados:

- [ ] Bugs P0/P1 abiertos del backlog (`memory/project_db_schema_mismatches.md`)
- [ ] Auditoría de utilidad de health checks (`memory/project_backlog_admin_health_e2e.md`)
- [ ] Visibilidad E2E desde admin

Si alguno está abierto, NO empezar este plan. Cerrar primero.

---

## File Structure

### Archivos a crear

| Path | Responsabilidad |
|---|---|
| `supabase/migrations/040_tournament_drafts.sql` | Tablas drafts, collaborators, events, templates, prizes + RLS |
| `src/lib/draft/types.ts` | `TournamentConfig` type + sub-types (TeamConfig, MatchPlayConfig, etc.) |
| `src/lib/draft/schema.ts` | zod schema de `TournamentConfig` (full + partial) |
| `src/lib/draft/deep-merge-config.ts` | Deep merge con regla de match por id/round_number |
| `src/lib/draft/upgrade-config.ts` | Migración de schema_version vieja → nueva |
| `src/lib/draft/initial-config.ts` | Factory de config vacío con defaults |
| `src/golf/tournament-config-validator.ts` | Reglas invariantes de golf por formato |
| `src/lib/draft/rate-limit.ts` | Rate limit en memoria por user_id (sliding window) |
| `src/lib/draft/ai-cost-tracker.ts` | Acumular costos IA por mes y disparar alarma |
| `src/lib/draft/share-token.ts` | Generación y validación de tokens de invitación |
| `src/lib/prompts/tournament-assistant-v1.ts` | System prompt versionado del asistente IA |
| `src/lib/draft/simulators/index.ts` | Factory de simuladores polimórfico |
| `src/lib/draft/simulators/individual-stroke.ts` | Mock scores para stroke play |
| `src/lib/draft/simulators/individual-stableford.ts` | Mock scores para stableford individual |
| `src/lib/draft/simulators/team-best-ball.ts` | Mock scores para best ball |
| `src/lib/draft/simulators/team-scramble.ts` | Mock scores para scramble |
| `src/lib/draft/simulators/team-foursome.ts` | Mock scores para foursome |
| `src/lib/draft/simulators/match-play-bracket.ts` | Mock bracket eliminatorio |
| `src/lib/draft/simulators/match-play-1v1.ts` | Mock match play 1v1 hoyo a hoyo |
| `src/app/api/torneos/draft/route.ts` | POST (crear draft) |
| `src/app/api/torneos/draft/[id]/route.ts` | GET, PATCH, DELETE |
| `src/app/api/torneos/draft/[id]/collaborators/route.ts` | POST (invitar por user_id) |
| `src/app/api/torneos/draft/[id]/collaborators/[userId]/route.ts` | DELETE (remover) |
| `src/app/api/torneos/draft/[id]/share-link/route.ts` | POST (generar token) |
| `src/app/api/torneos/draft/join/route.ts` | POST (consumir token) |
| `src/app/api/torneos/draft/[id]/transfer-ownership/route.ts` | POST (cambiar owner) |
| `src/app/api/torneos/draft/[id]/assistant/route.ts` | POST (IA con rate limit) |
| `src/app/api/torneos/draft/[id]/preview/route.ts` | POST (genera datos demo) |
| `src/app/api/torneos/draft/[id]/create-tournament/route.ts` | POST (transacción que crea torneo real) |
| `src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts` | POST (duplicar config) |
| `src/app/api/cron/cleanup-drafts/route.ts` | Vercel Cron: archivar drafts viejos |
| `vercel.json` (modificar) | Agregar cron job |
| `src/__tests__/draft/deep-merge-config.test.ts` | Unit tests deep merge |
| `src/__tests__/draft/upgrade-config.test.ts` | Unit tests upgrade |
| `src/__tests__/draft/tournament-config-validator.test.ts` | Unit tests validador |
| `src/__tests__/draft/rate-limit.test.ts` | Unit tests rate limit |
| `src/__tests__/draft/share-token.test.ts` | Unit tests share token |
| `src/__tests__/draft/simulators/individual-stroke.test.ts` | Unit test simulador (1 por formato — solo escribimos 2 en este plan, el resto siguen el mismo patrón) |
| `src/__tests__/integration/torneos-draft-api.test.ts` | Integration tests endpoints |

### Archivos a modificar

- `vercel.json` — agregar `crons` config

---

## Task 1: Migración SQL — tablas, índices y RLS

**Files:**
- Create: `supabase/migrations/040_tournament_drafts.sql`

- [ ] **Step 1.1: Crear archivo de migración**

```sql
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
```

- [ ] **Step 1.2: Agregar RLS policies en el mismo archivo**

```sql
-- RLS tournament_drafts
alter table public.tournament_drafts enable row level security;

create policy tournament_drafts_select on public.tournament_drafts
  for select using (
    owner_id = auth.uid()
    or auth.uid() in (
      select user_id from public.tournament_draft_collaborators
      where draft_id = id
    )
  );

create policy tournament_drafts_insert on public.tournament_drafts
  for insert with check (owner_id = auth.uid());

create policy tournament_drafts_update on public.tournament_drafts
  for update using (
    owner_id = auth.uid()
    or auth.uid() in (
      select user_id from public.tournament_draft_collaborators
      where draft_id = id
    )
  );

create policy tournament_drafts_delete on public.tournament_drafts
  for delete using (owner_id = auth.uid());

-- RLS collaborators
alter table public.tournament_draft_collaborators enable row level security;

create policy tdc_select on public.tournament_draft_collaborators
  for select using (
    user_id = auth.uid()
    or draft_id in (
      select id from public.tournament_drafts where owner_id = auth.uid()
    )
  );

create policy tdc_insert on public.tournament_draft_collaborators
  for insert with check (
    draft_id in (select id from public.tournament_drafts where owner_id = auth.uid())
  );

create policy tdc_delete on public.tournament_draft_collaborators
  for delete using (
    draft_id in (select id from public.tournament_drafts where owner_id = auth.uid())
  );

-- RLS events (read igual al draft, insert por server, no update/delete jamás)
alter table public.tournament_draft_events enable row level security;

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

create policy tdst_select on public.tournament_draft_share_tokens
  for select using (
    created_by = auth.uid()
    or draft_id in (select id from public.tournament_drafts where owner_id = auth.uid())
  );

create policy tdst_insert on public.tournament_draft_share_tokens
  for insert with check (created_by = auth.uid());

-- Templates: owner ve los suyos, todos ven los globales
alter table public.tournament_templates enable row level security;

create policy tt_select on public.tournament_templates
  for select using (is_global or owner_id = auth.uid());

create policy tt_insert on public.tournament_templates
  for insert with check (owner_id = auth.uid());

-- Prizes: owner del torneo
alter table public.tournament_prizes enable row level security;

create policy tp_select on public.tournament_prizes
  for select using (
    tournament_id in (select id from public.tournaments where organizer_id = auth.uid())
    or tournament_id in (select tournament_id from public.players where user_id = auth.uid())
  );
```

- [ ] **Step 1.3: Aplicar la migración**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/040_tournament_drafts.sql`
Expected: cero errores; las 6 tablas creadas en Supabase.

- [ ] **Step 1.4: Verificar que las tablas existen**

Run:
```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
['tournament_drafts','tournament_draft_collaborators','tournament_draft_events','tournament_templates','tournament_draft_share_tokens','tournament_prizes'].forEach(async t => {
  const { error } = await s.from(t).select('*').limit(0);
  console.log(t, error ? 'FAIL: ' + error.message : 'OK');
});
"
```
Expected: cada tabla imprime `OK`.

- [ ] **Step 1.5: Commit**

```bash
git add supabase/migrations/040_tournament_drafts.sql
git commit -m "feat(db): tablas tournament_drafts + collaborators + events + templates + share_tokens + prizes con RLS"
```

---

## Task 2: Tipos TypeScript del config

**Files:**
- Create: `src/lib/draft/types.ts`

- [ ] **Step 2.1: Crear el archivo con la interface completa**

```typescript
// src/lib/draft/types.ts
export type TournamentFormat =
  | 'stroke_play' | 'stableford' | 'best_ball'
  | 'scramble' | 'match_play' | 'foursome'

export type ScoringMode = 'gross' | 'neto'

export interface TeamConfig {
  size: 2 | 3 | 4
  handicap_pct: 'usga_35_15' | 'usga_25_15' | 'simple_avg' | 'custom'
  handicap_pct_custom?: { lower_pct: number; higher_pct: number }
  min_drives_per_player?: number
  formation_mode: 'manual' | 'random' | 'by_handicap' | 'players_choose'
}

export interface MatchPlayConfig {
  bracket_mode: 'single_elimination' | 'round_robin' | 'one_vs_one'
  handicap_diff: 'full' | 'three_quarters' | 'none'
  extra_holes_on_tie: boolean
}

export interface StablefordConfig {
  points_table: {
    albatross_or_better: number
    eagle: number
    birdie: number
    par: number
    bogey: number
    double_or_worse: number
  }
}

export interface CategoryConfig {
  id: string
  name: string
  handicap_min: number | null
  handicap_max: number | null
  gender: 'male' | 'female' | 'mixed' | null
  age_min?: number
  age_max?: number
  default_tee_color?: string
}

export interface RoundConfig {
  round_number: number
  date: string | null              // ISO date
  course_id: string | null
  hole_count: 9 | 18
  tee_assignment_mode: 'per_player' | 'per_category'
  custom_si?: Record<string, number>
  notes?: string
}

export interface RegistrationConfig {
  mode: 'open_with_code' | 'invite_only' | 'club_members_only'
  code?: string
  deadline?: string
  max_players?: number
}

export interface PrizeConfig {
  id: string
  type: 'category_position' | 'closest_to_pin' | 'long_drive' | 'special'
  description: string
  category_id?: string
  position?: number
  hole_number?: number
}

export interface TournamentConfig {
  schema_version: 1
  name: string
  date_start: string | null
  cover_image_url: string | null
  format: TournamentFormat
  modo: ScoringMode
  use_handicap: boolean
  team_config?: TeamConfig
  match_play_config?: MatchPlayConfig
  stableford_config?: StablefordConfig
  categories: CategoryConfig[]
  rounds: RoundConfig[]
  registration: RegistrationConfig
  prizes: PrizeConfig[]
  is_practice: boolean
  pending_confirmations: string[]
}

export type TournamentConfigPartial = Partial<TournamentConfig>
```

- [ ] **Step 2.2: Commit**

```bash
git add src/lib/draft/types.ts
git commit -m "feat(draft): tipos TypeScript del TournamentConfig"
```

---

## Task 3: Schema zod (full + partial)

**Files:**
- Create: `src/lib/draft/schema.ts`
- Test: `src/__tests__/draft/schema.test.ts`

- [ ] **Step 3.1: Test failing**

```typescript
// src/__tests__/draft/schema.test.ts
import { describe, it, expect } from 'vitest'
import { tournamentConfigSchema, tournamentConfigPartialSchema } from '@/lib/draft/schema'

describe('tournamentConfigSchema', () => {
  it('rechaza schema_version distinto a 1', () => {
    const bad = { schema_version: 2, name: 'X', format: 'stroke_play', modo: 'gross', use_handicap: false, categories: [], rounds: [], registration: { mode: 'open_with_code' }, prizes: [], is_practice: false, pending_confirmations: [], date_start: null, cover_image_url: null }
    expect(tournamentConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('acepta config mínimo válido', () => {
    const ok = { schema_version: 1, name: 'X', format: 'stroke_play', modo: 'gross', use_handicap: false, categories: [], rounds: [], registration: { mode: 'open_with_code' }, prizes: [], is_practice: false, pending_confirmations: [], date_start: null, cover_image_url: null }
    expect(tournamentConfigSchema.safeParse(ok).success).toBe(true)
  })
})

describe('tournamentConfigPartialSchema', () => {
  it('acepta partial con solo format', () => {
    expect(tournamentConfigPartialSchema.safeParse({ format: 'scramble' }).success).toBe(true)
  })

  it('rechaza format inválido', () => {
    expect(tournamentConfigPartialSchema.safeParse({ format: 'inventado' }).success).toBe(false)
  })
})
```

- [ ] **Step 3.2: Run test (fails)**

Run: `npm test -- schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement schema**

```typescript
// src/lib/draft/schema.ts
import { z } from 'zod'

export const tournamentFormatSchema = z.enum([
  'stroke_play', 'stableford', 'best_ball',
  'scramble', 'match_play', 'foursome',
])

export const scoringModeSchema = z.enum(['gross', 'neto'])

export const teamConfigSchema = z.object({
  size: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  handicap_pct: z.enum(['usga_35_15', 'usga_25_15', 'simple_avg', 'custom']),
  handicap_pct_custom: z.object({
    lower_pct: z.number().min(0).max(100),
    higher_pct: z.number().min(0).max(100),
  }).optional(),
  min_drives_per_player: z.number().int().min(0).optional(),
  formation_mode: z.enum(['manual', 'random', 'by_handicap', 'players_choose']),
})

export const matchPlayConfigSchema = z.object({
  bracket_mode: z.enum(['single_elimination', 'round_robin', 'one_vs_one']),
  handicap_diff: z.enum(['full', 'three_quarters', 'none']),
  extra_holes_on_tie: z.boolean(),
})

export const stablefordConfigSchema = z.object({
  points_table: z.object({
    albatross_or_better: z.number().int(),
    eagle: z.number().int(),
    birdie: z.number().int(),
    par: z.number().int(),
    bogey: z.number().int(),
    double_or_worse: z.number().int(),
  }),
})

export const categoryConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  handicap_min: z.number().nullable(),
  handicap_max: z.number().nullable(),
  gender: z.enum(['male', 'female', 'mixed']).nullable(),
  age_min: z.number().int().optional(),
  age_max: z.number().int().optional(),
  default_tee_color: z.string().optional(),
})

export const roundConfigSchema = z.object({
  round_number: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  course_id: z.string().uuid().nullable(),
  hole_count: z.union([z.literal(9), z.literal(18)]),
  tee_assignment_mode: z.enum(['per_player', 'per_category']),
  custom_si: z.record(z.string(), z.number().int().min(1).max(18)).optional(),
  notes: z.string().optional(),
})

export const registrationConfigSchema = z.object({
  mode: z.enum(['open_with_code', 'invite_only', 'club_members_only']),
  code: z.string().optional(),
  deadline: z.string().optional(),
  max_players: z.number().int().positive().optional(),
})

export const prizeConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['category_position', 'closest_to_pin', 'long_drive', 'special']),
  description: z.string().min(1),
  category_id: z.string().optional(),
  position: z.number().int().positive().optional(),
  hole_number: z.number().int().min(1).max(18).optional(),
})

export const tournamentConfigSchema = z.object({
  schema_version: z.literal(1),
  name: z.string(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  cover_image_url: z.string().url().nullable(),
  format: tournamentFormatSchema,
  modo: scoringModeSchema,
  use_handicap: z.boolean(),
  team_config: teamConfigSchema.optional(),
  match_play_config: matchPlayConfigSchema.optional(),
  stableford_config: stablefordConfigSchema.optional(),
  categories: z.array(categoryConfigSchema),
  rounds: z.array(roundConfigSchema),
  registration: registrationConfigSchema,
  prizes: z.array(prizeConfigSchema),
  is_practice: z.boolean(),
  pending_confirmations: z.array(z.string()),
})

// Schema partial: todos los campos opcionales (recursivo simple)
export const tournamentConfigPartialSchema = tournamentConfigSchema.partial()
```

- [ ] **Step 3.4: Run test (pass)**

Run: `npm test -- schema.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/draft/schema.ts src/__tests__/draft/schema.test.ts
git commit -m "feat(draft): zod schema completo del TournamentConfig + partial"
```

---

## Task 4: Deep merge de partial config

**Files:**
- Create: `src/lib/draft/deep-merge-config.ts`
- Test: `src/__tests__/draft/deep-merge-config.test.ts`

- [ ] **Step 4.1: Test failing**

```typescript
// src/__tests__/draft/deep-merge-config.test.ts
import { describe, it, expect } from 'vitest'
import { deepMergeConfig } from '@/lib/draft/deep-merge-config'

describe('deepMergeConfig', () => {
  it('merge primitivos: el partial gana', () => {
    const base = { name: 'A', format: 'stroke_play' }
    const partial = { name: 'B' }
    expect(deepMergeConfig(base as any, partial as any)).toMatchObject({ name: 'B', format: 'stroke_play' })
  })

  it('merge nested objects: deep', () => {
    const base = { team_config: { size: 2, formation_mode: 'random' } }
    const partial = { team_config: { size: 4 } }
    expect(deepMergeConfig(base as any, partial as any)).toMatchObject({ team_config: { size: 4, formation_mode: 'random' } })
  })

  it('merge array de categorías: match por id', () => {
    const base = { categories: [{ id: '1', name: 'Damas' }, { id: '2', name: 'Varones A' }] }
    const partial = { categories: [{ id: '2', name: 'Varones Senior' }] }
    expect(deepMergeConfig(base as any, partial as any).categories).toEqual([
      { id: '1', name: 'Damas' },
      { id: '2', name: 'Varones Senior' },
    ])
  })

  it('merge array de rondas: match por round_number', () => {
    const base = { rounds: [{ round_number: 1, date: '2026-07-12' }, { round_number: 2, date: '2026-07-13' }] }
    const partial = { rounds: [{ round_number: 2, date: '2026-07-20' }] }
    expect(deepMergeConfig(base as any, partial as any).rounds).toEqual([
      { round_number: 1, date: '2026-07-12' },
      { round_number: 2, date: '2026-07-20' },
    ])
  })

  it('agrega items nuevos al array si el id no existe', () => {
    const base = { categories: [{ id: '1', name: 'A' }] }
    const partial = { categories: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] }
    expect(deepMergeConfig(base as any, partial as any).categories).toHaveLength(2)
  })

  it('null en partial elimina el campo', () => {
    const base = { cover_image_url: 'http://x.png' }
    const partial = { cover_image_url: null }
    expect(deepMergeConfig(base as any, partial as any).cover_image_url).toBeNull()
  })

  it('undefined en partial es ignorado', () => {
    const base = { name: 'A' }
    const partial = { name: undefined }
    expect(deepMergeConfig(base as any, partial as any).name).toBe('A')
  })
})
```

- [ ] **Step 4.2: Run test (fails)**

Run: `npm test -- deep-merge-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement deep merge**

```typescript
// src/lib/draft/deep-merge-config.ts
import type { TournamentConfig, TournamentConfigPartial } from './types'

const ARRAY_KEY_BY_FIELD: Record<string, 'id' | 'round_number'> = {
  categories: 'id',
  prizes: 'id',
  rounds: 'round_number',
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function mergeArrayByKey<T extends Record<string, unknown>>(
  base: T[],
  patch: T[],
  key: keyof T
): T[] {
  const baseMap = new Map(base.map(item => [item[key], item]))
  for (const item of patch) {
    const existing = baseMap.get(item[key])
    if (existing) {
      baseMap.set(item[key], { ...existing, ...item })
    } else {
      baseMap.set(item[key], item)
    }
  }
  return Array.from(baseMap.values())
}

export function deepMergeConfig(
  base: TournamentConfig,
  partial: TournamentConfigPartial
): TournamentConfig {
  const result = { ...base } as Record<string, unknown>

  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue
    if (v === null) {
      result[k] = null
      continue
    }
    if (Array.isArray(v) && k in ARRAY_KEY_BY_FIELD) {
      const matchKey = ARRAY_KEY_BY_FIELD[k]
      result[k] = mergeArrayByKey(
        Array.isArray(base[k as keyof TournamentConfig]) ? (base[k as keyof TournamentConfig] as Record<string, unknown>[]) : [],
        v as Record<string, unknown>[],
        matchKey,
      )
      continue
    }
    if (isPlainObject(v) && isPlainObject(result[k])) {
      result[k] = { ...(result[k] as object), ...v }
      continue
    }
    result[k] = v
  }

  return result as TournamentConfig
}
```

- [ ] **Step 4.4: Run test (pass)**

Run: `npm test -- deep-merge-config.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/draft/deep-merge-config.ts src/__tests__/draft/deep-merge-config.test.ts
git commit -m "feat(draft): deep merge de partial config con match por id/round_number"
```

---

## Task 5: Upgrade config (schema versioning)

**Files:**
- Create: `src/lib/draft/upgrade-config.ts`
- Test: `src/__tests__/draft/upgrade-config.test.ts`

- [ ] **Step 5.1: Test failing**

```typescript
// src/__tests__/draft/upgrade-config.test.ts
import { describe, it, expect } from 'vitest'
import { upgradeConfig, CURRENT_SCHEMA_VERSION } from '@/lib/draft/upgrade-config'

describe('upgradeConfig', () => {
  it('CURRENT_SCHEMA_VERSION es 1 (estado inicial)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1)
  })

  it('config con schema_version=1 retorna sin cambios', () => {
    const c: any = { schema_version: 1, name: 'X' }
    const r = upgradeConfig(c)
    expect(r.schema_version).toBe(1)
    expect(r.name).toBe('X')
  })

  it('throw si schema_version es desconocida (futuro)', () => {
    const c: any = { schema_version: 99 }
    expect(() => upgradeConfig(c)).toThrow(/schema_version 99/)
  })

  it('throw si schema_version falta', () => {
    const c: any = { name: 'X' }
    expect(() => upgradeConfig(c)).toThrow(/schema_version/)
  })
})
```

- [ ] **Step 5.2: Run test (fails)**

Run: `npm test -- upgrade-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement upgrade**

```typescript
// src/lib/draft/upgrade-config.ts
import type { TournamentConfig } from './types'

export const CURRENT_SCHEMA_VERSION = 1 as const

type AnyConfig = Partial<TournamentConfig> & { schema_version?: number }

/**
 * Migra config de schema viejo a CURRENT_SCHEMA_VERSION.
 * Cuando agreguemos schema_version 2, agregamos un case más acá.
 */
export function upgradeConfig(input: AnyConfig): TournamentConfig {
  if (typeof input.schema_version !== 'number') {
    throw new Error('Config sin schema_version, no se puede migrar')
  }

  if (input.schema_version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Config con schema_version ${input.schema_version} es futura, este código solo soporta hasta ${CURRENT_SCHEMA_VERSION}`)
  }

  if (input.schema_version === CURRENT_SCHEMA_VERSION) {
    return input as TournamentConfig
  }

  // Aquí van las migraciones futuras (v0 → v1, v1 → v2, etc.)
  throw new Error(`Migración desde schema_version ${input.schema_version} no implementada`)
}
```

- [ ] **Step 5.4: Run test (pass)**

Run: `npm test -- upgrade-config.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/draft/upgrade-config.ts src/__tests__/draft/upgrade-config.test.ts
git commit -m "feat(draft): upgrade-config con schema_version=1 + tests"
```

---

## Task 6: Initial config factory

**Files:**
- Create: `src/lib/draft/initial-config.ts`

- [ ] **Step 6.1: Implement factory**

```typescript
// src/lib/draft/initial-config.ts
import type { TournamentConfig } from './types'
import { CURRENT_SCHEMA_VERSION } from './upgrade-config'

export function createInitialConfig(): TournamentConfig {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    name: '',
    date_start: null,
    cover_image_url: null,
    format: 'stroke_play',
    modo: 'gross',
    use_handicap: false,
    categories: [
      {
        id: crypto.randomUUID(),
        name: 'General',
        handicap_min: 0,
        handicap_max: 54,
        gender: null,
      },
    ],
    rounds: [
      {
        round_number: 1,
        date: null,
        course_id: null,
        hole_count: 18,
        tee_assignment_mode: 'per_player',
      },
    ],
    registration: { mode: 'open_with_code' },
    prizes: [],
    is_practice: false,
    pending_confirmations: [],
  }
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/lib/draft/initial-config.ts
git commit -m "feat(draft): factory createInitialConfig con defaults sensatos"
```

---

## Task 7: Validador de reglas de golf invariantes

**Files:**
- Create: `src/golf/tournament-config-validator.ts`
- Test: `src/__tests__/draft/tournament-config-validator.test.ts`

- [ ] **Step 7.1: Test failing**

```typescript
// src/__tests__/draft/tournament-config-validator.test.ts
import { describe, it, expect } from 'vitest'
import { validateGolfRules } from '@/golf/tournament-config-validator'
import { createInitialConfig } from '@/lib/draft/initial-config'

describe('validateGolfRules', () => {
  it('config inicial es válido (warning solo si faltan campos)', () => {
    const r = validateGolfRules(createInitialConfig())
    expect(r.errors).toEqual([])
  })

  it('scramble sin team_config tira error', () => {
    const c = createInitialConfig()
    c.format = 'scramble'
    const r = validateGolfRules(c)
    expect(r.errors.some(e => e.code === 'scramble_requires_team_config')).toBe(true)
  })

  it('match_play sin match_play_config tira error', () => {
    const c = createInitialConfig()
    c.format = 'match_play'
    const r = validateGolfRules(c)
    expect(r.errors.some(e => e.code === 'match_play_requires_config')).toBe(true)
  })

  it('stableford con modo gross tira error (debe ser neto)', () => {
    const c = createInitialConfig()
    c.format = 'stableford'
    c.modo = 'gross'
    const r = validateGolfRules(c)
    expect(r.errors.some(e => e.code === 'stableford_must_be_neto')).toBe(true)
  })

  it('rondas con round_number duplicado tira error', () => {
    const c = createInitialConfig()
    c.rounds = [
      { round_number: 1, date: null, course_id: null, hole_count: 18, tee_assignment_mode: 'per_player' },
      { round_number: 1, date: null, course_id: null, hole_count: 18, tee_assignment_mode: 'per_player' },
    ]
    const r = validateGolfRules(c)
    expect(r.errors.some(e => e.code === 'duplicate_round_number')).toBe(true)
  })

  it('isReadyToCreate=false si falta name, date o course en alguna ronda', () => {
    const c = createInitialConfig()
    expect(validateGolfRules(c).isReadyToCreate).toBe(false)
  })

  it('isReadyToCreate=true si todo está', () => {
    const c = createInitialConfig()
    c.name = 'Copa'
    c.date_start = '2026-07-12'
    c.rounds[0].date = '2026-07-12'
    c.rounds[0].course_id = '00000000-0000-0000-0000-000000000001'
    expect(validateGolfRules(c).isReadyToCreate).toBe(true)
  })
})
```

- [ ] **Step 7.2: Run test (fails)**

Run: `npm test -- tournament-config-validator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement validator**

```typescript
// src/golf/tournament-config-validator.ts
import type { TournamentConfig } from '@/lib/draft/types'

export interface ValidationError {
  code: string
  field: string
  message: string
}

export interface ValidationResult {
  errors: ValidationError[]
  warnings: ValidationError[]
  isReadyToCreate: boolean
}

export function validateGolfRules(config: TournamentConfig): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []

  // Reglas invariantes por formato
  const teamFormats = new Set(['best_ball', 'scramble', 'foursome'])
  if (teamFormats.has(config.format) && !config.team_config) {
    errors.push({ code: `${config.format}_requires_team_config`, field: 'team_config', message: `${config.format} requiere team_config (tamaño, % handicap, modo de formación)` })
  }

  if (config.format === 'match_play' && !config.match_play_config) {
    errors.push({ code: 'match_play_requires_config', field: 'match_play_config', message: 'match_play requiere match_play_config (bracket_mode, handicap_diff)' })
  }

  if (config.format === 'stableford' && config.modo === 'gross') {
    errors.push({ code: 'stableford_must_be_neto', field: 'modo', message: 'Stableford oficial siempre se juega con handicap (neto)' })
  }

  if (config.format === 'match_play' && config.modo === 'gross') {
    warnings.push({ code: 'match_play_typically_neto', field: 'modo', message: 'Match Play típicamente se juega neto. Confirmá si querés gross.' })
  }

  // Rondas
  const roundNumbers = new Set<number>()
  for (const r of config.rounds) {
    if (roundNumbers.has(r.round_number)) {
      errors.push({ code: 'duplicate_round_number', field: 'rounds', message: `Hay dos rondas con round_number=${r.round_number}` })
    }
    roundNumbers.add(r.round_number)
  }

  if (config.rounds.length === 0) {
    errors.push({ code: 'no_rounds', field: 'rounds', message: 'Tiene que haber al menos una ronda' })
  }

  // Categorías
  if (config.categories.length === 0) {
    warnings.push({ code: 'no_categories', field: 'categories', message: 'Sin categorías el leaderboard será uno solo. ¿Es lo que querés?' })
  }

  // Stableford config
  if (config.format === 'stableford' && config.stableford_config) {
    const t = config.stableford_config.points_table
    if (t.par <= t.bogey || t.birdie <= t.par || t.eagle <= t.birdie) {
      errors.push({ code: 'stableford_points_not_monotonic', field: 'stableford_config', message: 'Puntos de Stableford deben ser monotónicos: doble < bogey < par < birdie < eagle < albatross' })
    }
  }

  // Team config sanity
  if (config.team_config && config.team_config.handicap_pct === 'custom') {
    const c = config.team_config.handicap_pct_custom
    if (!c || c.lower_pct < 0 || c.lower_pct > 100 || c.higher_pct < 0 || c.higher_pct > 100) {
      errors.push({ code: 'team_handicap_custom_out_of_range', field: 'team_config.handicap_pct_custom', message: 'Porcentajes de handicap custom deben estar entre 0 y 100' })
    }
  }

  // ¿Listo para crear?
  const isReadyToCreate =
    errors.length === 0 &&
    config.name.trim().length > 0 &&
    config.date_start !== null &&
    config.rounds.every(r => r.date !== null && r.course_id !== null)

  return { errors, warnings, isReadyToCreate }
}
```

- [ ] **Step 7.4: Run test (pass)**

Run: `npm test -- tournament-config-validator.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7.5: Commit**

```bash
git add src/golf/tournament-config-validator.ts src/__tests__/draft/tournament-config-validator.test.ts
git commit -m "feat(golf): validador de reglas invariantes por formato + isReadyToCreate"
```

---

## Task 8: Endpoint POST /api/torneos/draft (crear)

**Files:**
- Create: `src/app/api/torneos/draft/route.ts`

- [ ] **Step 8.1: Implement endpoint**

```typescript
// src/app/api/torneos/draft/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createInitialConfig } from '@/lib/draft/initial-config'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const config = createInitialConfig()

    const { data: draft, error: dErr } = await supabase
      .from('tournament_drafts')
      .insert({
        owner_id: user.id,
        config,
        status: 'draft',
        version: 1,
      })
      .select('id, version, config, status')
      .single()

    if (dErr || !draft) {
      console.error('[draft/create] error:', dErr)
      return NextResponse.json({ error: dErr?.message || 'Error creando draft' }, { status: 500 })
    }

    // Owner como collaborator (simetría)
    await supabase.from('tournament_draft_collaborators').insert({
      draft_id: draft.id,
      user_id: user.id,
      role: 'owner',
      added_by: user.id,
    })

    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    console.error('[draft/create] internal:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
```

- [ ] **Step 8.2: Smoke test manual**

Run:
```bash
npm run dev
# en otra terminal, con cookie de sesión válida:
curl -X POST http://localhost:3000/api/torneos/draft -H "Content-Type: application/json"
```
Expected: `{ ok: true, draft: { id, version: 1, config: {...}, status: 'draft' } }`.

- [ ] **Step 8.3: Commit**

```bash
git add src/app/api/torneos/draft/route.ts
git commit -m "feat(api): POST /api/torneos/draft crea draft vacío para el organizador"
```

---

## Task 9: Endpoints GET, PATCH, DELETE en /api/torneos/draft/[id]

**Files:**
- Create: `src/app/api/torneos/draft/[id]/route.ts`

- [ ] **Step 9.1: Implement las 3 handlers**

```typescript
// src/app/api/torneos/draft/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { tournamentConfigPartialSchema, tournamentConfigSchema } from '@/lib/draft/schema'
import { deepMergeConfig } from '@/lib/draft/deep-merge-config'
import { upgradeConfig } from '@/lib/draft/upgrade-config'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('tournament_drafts')
    .select('*, tournament_draft_collaborators(user_id, role)')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, draft: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const partialResult = tournamentConfigPartialSchema.safeParse(body.config_partial)
  if (!partialResult.success) {
    return NextResponse.json({ error: 'config_partial inválido', details: partialResult.error.issues }, { status: 400 })
  }
  const expectedVersion = body.version
  if (typeof expectedVersion !== 'number') {
    return NextResponse.json({ error: 'version requerido' }, { status: 400 })
  }

  // Lock del draft para evitar race
  const { data: current, error: cErr } = await supabase
    .from('tournament_drafts')
    .select('config, version, status')
    .eq('id', params.id)
    .single()

  if (cErr || !current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.status !== 'draft') return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })
  if (current.version !== expectedVersion) {
    return NextResponse.json({ error: 'conflict', current_version: current.version, current_config: current.config }, { status: 409 })
  }

  const upgraded = upgradeConfig(current.config)
  const nextConfig = deepMergeConfig(upgraded, partialResult.data)

  const fullResult = tournamentConfigSchema.safeParse(nextConfig)
  if (!fullResult.success) {
    return NextResponse.json({ error: 'config resultante inválido', details: fullResult.error.issues }, { status: 400 })
  }

  const { data: updated, error: uErr } = await supabase
    .from('tournament_drafts')
    .update({ config: nextConfig, version: current.version + 1 })
    .eq('id', params.id)
    .eq('version', current.version)
    .select('id, version, config')
    .single()

  if (uErr || !updated) {
    return NextResponse.json({ error: 'conflict' }, { status: 409 })
  }

  await supabase.from('tournament_draft_events').insert({
    draft_id: params.id,
    actor_id: user.id,
    config_partial: partialResult.data,
    config_before: current.config,
    source: body.source === 'ai' ? 'ai' : 'manual',
  })

  return NextResponse.json({ ok: true, draft: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Solo owner puede archivar
  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('owner_id, status')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo el owner puede archivar' }, { status: 403 })

  await supabase
    .from('tournament_drafts')
    .update({ status: 'archived' })
    .eq('id', params.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 9.2: Smoke test PATCH**

Run:
```bash
# create:
DRAFT=$(curl -s -X POST http://localhost:3000/api/torneos/draft | jq -r .draft.id)
# patch:
curl -X PATCH http://localhost:3000/api/torneos/draft/$DRAFT \
  -H "Content-Type: application/json" \
  -d '{ "config_partial": { "name": "Mi Torneo", "format": "scramble" }, "version": 1 }'
```
Expected: `{ ok: true, draft: { version: 2, config: { ... name: "Mi Torneo", format: "scramble" ... } } }`.

- [ ] **Step 9.3: Commit**

```bash
git add src/app/api/torneos/draft/[id]/route.ts
git commit -m "feat(api): GET/PATCH/DELETE draft con optimistic version locking"
```

---

## Task 10: Endpoints de colaboradores (invite + remove + share-link + join)

**Files:**
- Create: `src/app/api/torneos/draft/[id]/collaborators/route.ts`
- Create: `src/app/api/torneos/draft/[id]/collaborators/[userId]/route.ts`
- Create: `src/app/api/torneos/draft/[id]/share-link/route.ts`
- Create: `src/app/api/torneos/draft/join/route.ts`
- Create: `src/lib/draft/share-token.ts`
- Test: `src/__tests__/draft/share-token.test.ts`

- [ ] **Step 10.1: Test share-token utility**

```typescript
// src/__tests__/draft/share-token.test.ts
import { describe, it, expect } from 'vitest'
import { generateShareToken, isTokenExpired } from '@/lib/draft/share-token'

describe('share-token', () => {
  it('genera token de 32 chars alfa-num', () => {
    const t = generateShareToken()
    expect(t).toMatch(/^[A-Za-z0-9]{32}$/)
  })

  it('genera tokens distintos cada vez', () => {
    expect(generateShareToken()).not.toBe(generateShareToken())
  })

  it('isTokenExpired detecta expiración', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isTokenExpired(past)).toBe(true)
    expect(isTokenExpired(future)).toBe(false)
  })
})
```

- [ ] **Step 10.2: Run test (fails)**

Run: `npm test -- share-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 10.3: Implement share-token utility**

```typescript
// src/lib/draft/share-token.ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export function generateShareToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join('')
}

export function isTokenExpired(expiresAtIso: string): boolean {
  return new Date(expiresAtIso).getTime() <= Date.now()
}

export const SHARE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000  // 24h
```

Wait — el test espera 32 chars `[A-Za-z0-9]` pero el ALPHABET tiene esos caracteres ambiguos removidos (`I`, `O`, `0`, `1`, etc. para legibilidad). El regex del test debe matchear:

Update test regex en step 10.1: `/^[A-HJ-NP-Za-hj-km-np-z2-9]{32}$/` — pero más simple es aflojar el regex a `/^.{32}$/` y agregar un assertion separada que solo letras+números (no espacios).

- [ ] **Step 10.3.1: Ajustar el test**

Editar `src/__tests__/draft/share-token.test.ts` línea del primer test:
```typescript
it('genera token de 32 chars alfa-num', () => {
  const t = generateShareToken()
  expect(t).toHaveLength(32)
  expect(t).toMatch(/^[A-Za-z0-9]+$/)
})
```

- [ ] **Step 10.4: Run test (pass)**

Run: `npm test -- share-token.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 10.5: Implement endpoint POST collaborators (invite por user_id directo)**

```typescript
// src/app/api/torneos/draft/[id]/collaborators/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { user_id_to_add } = await req.json()
  if (!user_id_to_add || typeof user_id_to_add !== 'string') {
    return NextResponse.json({ error: 'user_id_to_add requerido' }, { status: 400 })
  }

  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'Draft no encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede invitar' }, { status: 403 })

  // Limit: max 4 collaborators (incluyendo owner)
  const { count } = await supabase
    .from('tournament_draft_collaborators')
    .select('user_id', { count: 'exact', head: true })
    .eq('draft_id', params.id)
  if ((count || 0) >= 4) return NextResponse.json({ error: 'Máximo 4 admins por draft' }, { status: 409 })

  const { error: insErr } = await supabase
    .from('tournament_draft_collaborators')
    .insert({ draft_id: params.id, user_id: user_id_to_add, role: 'collaborator', added_by: user.id })

  if (insErr) {
    if (insErr.code === '23505') return NextResponse.json({ error: 'Ya es colaborador' }, { status: 409 })
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 10.6: Implement endpoint DELETE collaborator**

```typescript
// src/app/api/torneos/draft/[id]/collaborators/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: d } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (!d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede remover' }, { status: 403 })
  if (params.userId === d.owner_id) return NextResponse.json({ error: 'No podés removerte como owner' }, { status: 400 })

  await supabase
    .from('tournament_draft_collaborators')
    .delete()
    .eq('draft_id', params.id)
    .eq('user_id', params.userId)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 10.7: Implement endpoint POST share-link**

```typescript
// src/app/api/torneos/draft/[id]/share-link/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateShareToken, SHARE_TOKEN_TTL_MS } from '@/lib/draft/share-token'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: d } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (!d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner' }, { status: 403 })

  const token = generateShareToken()
  const expiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_MS).toISOString()

  await supabase.from('tournament_draft_share_tokens').insert({
    token,
    draft_id: params.id,
    created_by: user.id,
    expires_at: expiresAt,
  })

  return NextResponse.json({ ok: true, token, expires_at: expiresAt })
}
```

- [ ] **Step 10.8: Implement endpoint POST join**

```typescript
// src/app/api/torneos/draft/join/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isTokenExpired } from '@/lib/draft/share-token'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 })

  const { data: t } = await supabase
    .from('tournament_draft_share_tokens')
    .select('draft_id, expires_at, consumed_at')
    .eq('token', token)
    .single()

  if (!t) return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  if (t.consumed_at) return NextResponse.json({ error: 'Token ya usado' }, { status: 410 })
  if (isTokenExpired(t.expires_at)) return NextResponse.json({ error: 'Token expirado' }, { status: 410 })

  // Limit 4
  const { count } = await supabase
    .from('tournament_draft_collaborators')
    .select('user_id', { count: 'exact', head: true })
    .eq('draft_id', t.draft_id)
  if ((count || 0) >= 4) return NextResponse.json({ error: 'Draft lleno (4 admins máx)' }, { status: 409 })

  // Consume token + agregar
  await supabase
    .from('tournament_draft_share_tokens')
    .update({ consumed_at: new Date().toISOString(), consumed_by: user.id })
    .eq('token', token)

  const { error: cErr } = await supabase
    .from('tournament_draft_collaborators')
    .insert({ draft_id: t.draft_id, user_id: user.id, role: 'collaborator', added_by: t.draft_id })

  if (cErr && cErr.code !== '23505') {
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, draft_id: t.draft_id })
}
```

- [ ] **Step 10.9: Commit**

```bash
git add src/lib/draft/share-token.ts src/__tests__/draft/share-token.test.ts \
  src/app/api/torneos/draft/[id]/collaborators/route.ts \
  src/app/api/torneos/draft/[id]/collaborators/[userId]/route.ts \
  src/app/api/torneos/draft/[id]/share-link/route.ts \
  src/app/api/torneos/draft/join/route.ts
git commit -m "feat(api): collaborators (invite/remove/share-link/join) con limit 4 y TTL 24h"
```

---

## Task 11: Endpoint transfer-ownership

**Files:**
- Create: `src/app/api/torneos/draft/[id]/transfer-ownership/route.ts`

- [ ] **Step 11.1: Implement endpoint**

```typescript
// src/app/api/torneos/draft/[id]/transfer-ownership/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { new_owner_id } = await req.json()
  if (!new_owner_id) return NextResponse.json({ error: 'new_owner_id requerido' }, { status: 400 })

  const { data: d } = await supabase
    .from('tournament_drafts')
    .select('owner_id')
    .eq('id', params.id)
    .single()
  if (!d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede transferir' }, { status: 403 })

  // El nuevo owner debe estar como collaborator
  const { data: c } = await supabase
    .from('tournament_draft_collaborators')
    .select('role')
    .eq('draft_id', params.id)
    .eq('user_id', new_owner_id)
    .single()
  if (!c) return NextResponse.json({ error: 'El nuevo owner debe ser collaborator primero' }, { status: 400 })

  // Update drafts.owner_id + cambia roles
  await supabase.from('tournament_drafts').update({ owner_id: new_owner_id }).eq('id', params.id)
  await supabase.from('tournament_draft_collaborators').update({ role: 'collaborator' }).eq('draft_id', params.id).eq('user_id', user.id)
  await supabase.from('tournament_draft_collaborators').update({ role: 'owner' }).eq('draft_id', params.id).eq('user_id', new_owner_id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 11.2: Commit**

```bash
git add src/app/api/torneos/draft/[id]/transfer-ownership/route.ts
git commit -m "feat(api): transfer-ownership entre owner y collaborator existente"
```

---

## Task 12: Rate limit utility + AI cost tracker

**Files:**
- Create: `src/lib/draft/rate-limit.ts`
- Create: `src/lib/draft/ai-cost-tracker.ts`
- Test: `src/__tests__/draft/rate-limit.test.ts`

- [ ] **Step 12.1: Test rate limit**

```typescript
// src/__tests__/draft/rate-limit.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, _resetForTest } from '@/lib/draft/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => _resetForTest())

  it('permite primera llamada', () => {
    const r = checkRateLimit('user-1', 'msg-1')
    expect(r.allowed).toBe(true)
  })

  it('bloquea después de 30 calls/h', () => {
    for (let i = 0; i < 30; i++) checkRateLimit('user-1', `m${i}`)
    const r = checkRateLimit('user-1', 'm31')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('rate_limit')
  })

  it('detecta loop: mismo mensaje 5 veces', () => {
    for (let i = 0; i < 4; i++) checkRateLimit('user-2', 'spam')
    const r = checkRateLimit('user-2', 'spam')
    expect(r.allowed).toBe(true) // la 5ta pasa, la 6ta no
    const r2 = checkRateLimit('user-2', 'spam')
    expect(r2.allowed).toBe(false)
    expect(r2.reason).toBe('loop_detected')
  })

  it('users distintos no se afectan', () => {
    for (let i = 0; i < 30; i++) checkRateLimit('user-3', `m${i}`)
    expect(checkRateLimit('user-4', 'm0').allowed).toBe(true)
  })
})
```

- [ ] **Step 12.2: Run test (fails)**

Run: `npm test -- rate-limit.test.ts`
Expected: FAIL.

- [ ] **Step 12.3: Implement rate-limit**

```typescript
// src/lib/draft/rate-limit.ts
const WINDOW_MS = 60 * 60 * 1000   // 1 hour
const MAX_CALLS = 30
const LOOP_WINDOW_MS = 2 * 60 * 1000  // 2 min
const LOOP_MAX_REPEATS = 5
const LOOP_BLOCK_MS = 10 * 60 * 1000  // 10 min

interface UserState {
  calls: number[]            // timestamps
  loopBlockedUntil: number   // 0 = not blocked
  lastMsgs: Array<{ msg: string; ts: number }>
}

const store = new Map<string, UserState>()

export interface RateLimitResult {
  allowed: boolean
  reason?: 'rate_limit' | 'loop_detected'
  retry_after_ms?: number
}

export function checkRateLimit(userId: string, message: string): RateLimitResult {
  const now = Date.now()
  let s = store.get(userId)
  if (!s) {
    s = { calls: [], loopBlockedUntil: 0, lastMsgs: [] }
    store.set(userId, s)
  }

  if (s.loopBlockedUntil > now) {
    return { allowed: false, reason: 'loop_detected', retry_after_ms: s.loopBlockedUntil - now }
  }

  s.calls = s.calls.filter(ts => now - ts < WINDOW_MS)
  s.lastMsgs = s.lastMsgs.filter(m => now - m.ts < LOOP_WINDOW_MS)

  if (s.calls.length >= MAX_CALLS) {
    return { allowed: false, reason: 'rate_limit', retry_after_ms: WINDOW_MS - (now - s.calls[0]) }
  }

  // Loop detection
  const sameRecent = s.lastMsgs.filter(m => m.msg === message)
  if (sameRecent.length >= LOOP_MAX_REPEATS) {
    s.loopBlockedUntil = now + LOOP_BLOCK_MS
    return { allowed: false, reason: 'loop_detected', retry_after_ms: LOOP_BLOCK_MS }
  }

  s.calls.push(now)
  s.lastMsgs.push({ msg: message, ts: now })

  return { allowed: true }
}

export function _resetForTest() {
  store.clear()
}
```

- [ ] **Step 12.4: Run test (pass)**

Run: `npm test -- rate-limit.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 12.5: Implement ai-cost-tracker**

```typescript
// src/lib/draft/ai-cost-tracker.ts
import type { SupabaseClient } from '@supabase/supabase-js'

const ALARM_THRESHOLD_USD = 100

export async function logAiCall(
  supabase: SupabaseClient,
  draftId: string,
  actorId: string,
  message: string,
  explanation: string,
  costUsd: number,
  latencyMs: number,
  configPartial: object,
  configBefore: object,
) {
  await supabase.from('tournament_draft_events').insert({
    draft_id: draftId,
    actor_id: actorId,
    config_partial: configPartial,
    config_before: configBefore,
    source: 'ai',
    ai_message: message,
    ai_explanation: explanation,
    ai_cost_usd: costUsd,
    ai_latency_ms: latencyMs,
  })
}

export async function getMonthlyAiCostUsd(supabase: SupabaseClient): Promise<number> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('tournament_draft_events')
    .select('ai_cost_usd')
    .eq('source', 'ai')
    .gte('created_at', monthStart.toISOString())

  return (data || []).reduce((sum, r: any) => sum + (Number(r.ai_cost_usd) || 0), 0)
}

export function shouldAlarm(monthlyCostUsd: number): boolean {
  return monthlyCostUsd >= ALARM_THRESHOLD_USD
}

export const AI_COST_ALARM_THRESHOLD_USD = ALARM_THRESHOLD_USD
```

- [ ] **Step 12.6: Commit**

```bash
git add src/lib/draft/rate-limit.ts src/__tests__/draft/rate-limit.test.ts src/lib/draft/ai-cost-tracker.ts
git commit -m "feat(draft): rate limit (30/h) + loop detection + ai cost tracker con alarma $100/mes"
```

---

## Task 13: System prompt del asistente IA

**Files:**
- Create: `src/lib/prompts/tournament-assistant-v1.ts`

- [ ] **Step 13.1: Implement prompt**

```typescript
// src/lib/prompts/tournament-assistant-v1.ts
export const TOURNAMENT_ASSISTANT_PROMPT_V1 = `
Sos un asistente especializado en armar torneos de golf en clubes chilenos.
Tu única tarea es producir un objeto JSON \`config_partial\` que se mergee a una
configuración de torneo existente, en base al mensaje del organizador.

Reglas estrictas:
1. Si NO te lo dijo explícitamente, NO inventes. Marca el campo en \`needs_confirmation\`.
2. NUNCA inventes reglas de golf. Solo usa formatos y parámetros conocidos.
3. NUNCA toques campos sobre los que no tienes alta confianza.
4. Devolvé siempre JSON válido con la estructura exacta esperada.
5. La explicación es para el organizador (en español, conciso, sin tecnicismos).
6. NO menciones que sos un modelo de IA.

Formatos válidos: stroke_play, stableford, best_ball, scramble, match_play, foursome.
Modos válidos: gross, neto.
Reglas duras:
- match_play y stableford fuerzan modo neto.
- best_ball, scramble, foursome requieren team_config (size, handicap_pct, formation_mode).
- match_play requiere match_play_config (bracket_mode, handicap_diff).

Estructura de respuesta esperada (JSON exacto):
{
  "config_partial": { ... fields del TournamentConfig que el user mencionó ... },
  "explanation": "string en español, 1-3 oraciones",
  "needs_confirmation": ["field.path1", "field.path2", ...],
  "cost_usd": null
}

Ejemplo input: "Scramble parejas, sábado 12 jul, Los Leones, neto"
Ejemplo output:
{
  "config_partial": {
    "format": "scramble",
    "modo": "neto",
    "use_handicap": true,
    "team_config": { "size": 2, "handicap_pct": "usga_35_15", "formation_mode": "manual" },
    "rounds": [{ "round_number": 1, "date": "2026-07-12" }]
  },
  "explanation": "Actualicé formato a scramble parejas, modo neto, fecha al sábado 12 de julio. Falta confirmar el modo de armar parejas y las categorías.",
  "needs_confirmation": ["team_config.formation_mode", "categories", "rounds.0.course_id"],
  "cost_usd": null
}
`.trim()

export const TOURNAMENT_ASSISTANT_PROMPT_VERSION = 'v1' as const
```

- [ ] **Step 13.2: Commit**

```bash
git add src/lib/prompts/tournament-assistant-v1.ts
git commit -m "feat(prompts): system prompt del asistente IA de torneos v1"
```

---

## Task 14: Endpoint POST /api/torneos/draft/[id]/assistant

**Files:**
- Create: `src/app/api/torneos/draft/[id]/assistant/route.ts`

- [ ] **Step 14.1: Implement endpoint**

```typescript
// src/app/api/torneos/draft/[id]/assistant/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/utils/supabase/server'
import { tournamentConfigPartialSchema, tournamentConfigSchema } from '@/lib/draft/schema'
import { deepMergeConfig } from '@/lib/draft/deep-merge-config'
import { upgradeConfig } from '@/lib/draft/upgrade-config'
import { checkRateLimit } from '@/lib/draft/rate-limit'
import { logAiCall, getMonthlyAiCostUsd, shouldAlarm } from '@/lib/draft/ai-cost-tracker'
import { TOURNAMENT_ASSISTANT_PROMPT_V1 } from '@/lib/prompts/tournament-assistant-v1'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const aiResponseSchema = z.object({
  config_partial: z.record(z.unknown()),
  explanation: z.string(),
  needs_confirmation: z.array(z.string()).default([]),
})

const HAIKU_INPUT_PER_MTOK = 0.25  // USD per 1M input tokens (placeholder)
const HAIKU_OUTPUT_PER_MTOK = 1.25
const TIMEOUT_MS = 12_000

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { message } = await req.json()
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message requerido' }, { status: 400 })
  }

  const rl = checkRateLimit(user.id, message)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: rl.reason, retry_after_ms: rl.retry_after_ms },
      { status: 429 },
    )
  }

  // Get current draft
  const { data: current, error: cErr } = await supabase
    .from('tournament_drafts')
    .select('config, version, status')
    .eq('id', params.id)
    .single()
  if (cErr || !current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (current.status !== 'draft') return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })

  // Llamada IA
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const t0 = Date.now()
  let resp
  try {
    resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: TOURNAMENT_ASSISTANT_PROMPT_V1 + `\n\nConfig actual:\n${JSON.stringify(current.config, null, 2)}`,
      messages: [{ role: 'user', content: message }],
    }, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error IA'
    console.error('[assistant] anthropic error:', msg)
    return NextResponse.json({ error: 'IA no disponible, editá manualmente' }, { status: 503 })
  }
  const latencyMs = Date.now() - t0

  // Costo
  const inputTokens = resp.usage?.input_tokens || 0
  const outputTokens = resp.usage?.output_tokens || 0
  const costUsd = (inputTokens * HAIKU_INPUT_PER_MTOK + outputTokens * HAIKU_OUTPUT_PER_MTOK) / 1_000_000

  // Parse JSON
  const text = resp.content.find(b => b.type === 'text')?.text || ''
  let json: unknown
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    json = JSON.parse(text.slice(start, end + 1))
  } catch {
    return NextResponse.json({ error: 'IA devolvió formato inválido' }, { status: 502 })
  }

  const parsed = aiResponseSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'IA devolvió estructura inválida', details: parsed.error.issues }, { status: 502 })
  }

  // Validar config_partial contra schema parcial
  const partialResult = tournamentConfigPartialSchema.safeParse(parsed.data.config_partial)
  if (!partialResult.success) {
    return NextResponse.json({ error: 'IA propuso campos inválidos', details: partialResult.error.issues }, { status: 502 })
  }

  // Mergear y validar resultado
  const upgraded = upgradeConfig(current.config)
  const nextConfig = deepMergeConfig(upgraded, partialResult.data)
  // Agregar needs_confirmation al pending_confirmations (de-dup)
  const pending = new Set([...nextConfig.pending_confirmations, ...parsed.data.needs_confirmation])
  nextConfig.pending_confirmations = Array.from(pending)

  const fullResult = tournamentConfigSchema.safeParse(nextConfig)
  if (!fullResult.success) {
    return NextResponse.json({ error: 'Config IA produciría inválido', details: fullResult.error.issues }, { status: 502 })
  }

  // Persistir
  const { data: updated, error: uErr } = await supabase
    .from('tournament_drafts')
    .update({ config: nextConfig, version: current.version + 1 })
    .eq('id', params.id)
    .eq('version', current.version)
    .select('id, version, config')
    .single()
  if (uErr || !updated) return NextResponse.json({ error: 'conflict' }, { status: 409 })

  await logAiCall(
    supabase, params.id, user.id, message,
    parsed.data.explanation, costUsd, latencyMs,
    partialResult.data, current.config,
  )

  // Alarma async (fire-and-forget)
  void getMonthlyAiCostUsd(supabase).then(c => {
    if (shouldAlarm(c)) console.warn(`[ai-cost] ALARM: monthly $${c.toFixed(2)} >= $100`)
  })

  return NextResponse.json({
    ok: true,
    draft: updated,
    explanation: parsed.data.explanation,
    needs_confirmation: parsed.data.needs_confirmation,
    cost_usd: costUsd,
  })
}
```

- [ ] **Step 14.2: Commit**

```bash
git add src/app/api/torneos/draft/[id]/assistant/route.ts
git commit -m "feat(api): assistant IA con Haiku 4.5 + rate limit + tracking de costo"
```

---

## Task 15: Simulador polimórfico (factory + 2 implementaciones representativas)

**Files:**
- Create: `src/lib/draft/simulators/index.ts`
- Create: `src/lib/draft/simulators/individual-stroke.ts`
- Create: `src/lib/draft/simulators/team-scramble.ts`
- Test: `src/__tests__/draft/simulators/individual-stroke.test.ts`

> **Nota:** este plan implementa solo 2 simuladores (stroke individual + scramble). Los otros 5 (`stableford`, `best_ball`, `foursome`, `match-play-bracket`, `match-play-1v1`) siguen el mismo patrón y se completan en una sub-fase posterior. Esto desbloquea el endpoint preview con cobertura parcial; los formatos sin simulador implementado tiran error claro.

- [ ] **Step 15.1: Test simulador stroke**

```typescript
// src/__tests__/draft/simulators/individual-stroke.test.ts
import { describe, it, expect } from 'vitest'
import { simulateIndividualStroke } from '@/lib/draft/simulators/individual-stroke'
import { createInitialConfig } from '@/lib/draft/initial-config'

describe('simulateIndividualStroke', () => {
  it('genera 4 jugadores demo con scores válidos para 18 hoyos', () => {
    const c = createInitialConfig()
    c.format = 'stroke_play'
    c.rounds[0].hole_count = 18
    const r = simulateIndividualStroke(c)
    expect(r.players.length).toBeGreaterThanOrEqual(4)
    for (const p of r.players) {
      expect(p.scores).toHaveLength(18)
      for (const s of p.scores) expect(s).toBeGreaterThanOrEqual(2)
      for (const s of p.scores) expect(s).toBeLessThanOrEqual(10)
    }
  })

  it('respeta hole_count = 9', () => {
    const c = createInitialConfig()
    c.format = 'stroke_play'
    c.rounds[0].hole_count = 9
    const r = simulateIndividualStroke(c)
    for (const p of r.players) expect(p.scores).toHaveLength(9)
  })
})
```

- [ ] **Step 15.2: Run test (fails)**

Run: `npm test -- simulators/individual-stroke.test.ts`
Expected: FAIL.

- [ ] **Step 15.3: Implement stroke simulator**

```typescript
// src/lib/draft/simulators/individual-stroke.ts
import type { TournamentConfig } from '../types'

const DEMO_NAMES = ['Juan Demo', 'María Demo', 'Pedro Demo', 'Ana Demo', 'Luis Demo', 'Carla Demo']

function randomScore(par: number = 4): number {
  // ~70% par o cerca, ~20% bogey, ~10% birdie/eagle
  const r = Math.random()
  if (r < 0.1) return Math.max(2, par - 1)
  if (r < 0.7) return par
  if (r < 0.9) return par + 1
  return par + 2
}

export interface SimulatedPlayer {
  name: string
  category_id?: string
  handicap_index: number
  scores: number[]
}

export interface SimulatedResult {
  players: SimulatedPlayer[]
  format: TournamentConfig['format']
  hole_count: number
}

export function simulateIndividualStroke(config: TournamentConfig): SimulatedResult {
  const holeCount = config.rounds[0]?.hole_count ?? 18
  const players: SimulatedPlayer[] = DEMO_NAMES.slice(0, 6).map((name, i) => ({
    name,
    category_id: config.categories[i % Math.max(config.categories.length, 1)]?.id,
    handicap_index: Math.round((5 + i * 3) * 10) / 10,
    scores: Array.from({ length: holeCount }, () => randomScore(4)),
  }))
  return { players, format: 'stroke_play', hole_count: holeCount }
}
```

- [ ] **Step 15.4: Run test (pass)**

Run: `npm test -- simulators/individual-stroke.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 15.5: Implement scramble simulator**

```typescript
// src/lib/draft/simulators/team-scramble.ts
import type { TournamentConfig } from '../types'
import type { SimulatedResult } from './individual-stroke'

export interface SimulatedTeam {
  team_id: string
  team_name: string
  players: Array<{ name: string; handicap_index: number }>
  scores: number[]
}

export interface SimulatedTeamResult extends Omit<SimulatedResult, 'players'> {
  teams: SimulatedTeam[]
}

const DEMO_NAMES = ['Juan Demo', 'María Demo', 'Pedro Demo', 'Ana Demo', 'Luis Demo', 'Carla Demo', 'Diego Demo', 'Sofía Demo']

export function simulateTeamScramble(config: TournamentConfig): SimulatedTeamResult {
  const holeCount = config.rounds[0]?.hole_count ?? 18
  const teamSize = config.team_config?.size ?? 2
  const teamCount = Math.floor(DEMO_NAMES.length / teamSize)

  const teams: SimulatedTeam[] = []
  for (let t = 0; t < teamCount; t++) {
    const memberStart = t * teamSize
    const players = DEMO_NAMES.slice(memberStart, memberStart + teamSize).map((name, i) => ({
      name,
      handicap_index: Math.round((6 + i * 4) * 10) / 10,
    }))
    teams.push({
      team_id: `demo-team-${t + 1}`,
      team_name: `Equipo ${t + 1}`,
      players,
      scores: Array.from({ length: holeCount }, () => 3 + Math.floor(Math.random() * 3)),  // scramble suele ser bajo
    })
  }
  return { teams, format: 'scramble', hole_count: holeCount }
}
```

- [ ] **Step 15.6: Implement factory**

```typescript
// src/lib/draft/simulators/index.ts
import type { TournamentConfig } from '../types'
import { simulateIndividualStroke, type SimulatedResult } from './individual-stroke'
import { simulateTeamScramble, type SimulatedTeamResult } from './team-scramble'

export type AnySimulationResult = SimulatedResult | SimulatedTeamResult

export function simulate(config: TournamentConfig): AnySimulationResult {
  switch (config.format) {
    case 'stroke_play':
      return simulateIndividualStroke(config)
    case 'scramble':
      return simulateTeamScramble(config)
    case 'stableford':
    case 'best_ball':
    case 'foursome':
    case 'match_play':
      throw new Error(`Simulador para ${config.format} no implementado todavía. Pendiente en sub-fase.`)
    default:
      throw new Error(`Formato desconocido: ${(config as { format: string }).format}`)
  }
}
```

- [ ] **Step 15.7: Commit**

```bash
git add src/lib/draft/simulators/ src/__tests__/draft/simulators/
git commit -m "feat(simulators): factory polimórfico + stroke individual + scramble (5 formatos pendientes)"
```

---

## Task 16: Endpoint POST /api/torneos/draft/[id]/preview

**Files:**
- Create: `src/app/api/torneos/draft/[id]/preview/route.ts`

- [ ] **Step 16.1: Implement endpoint**

```typescript
// src/app/api/torneos/draft/[id]/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { simulate } from '@/lib/draft/simulators'
import { upgradeConfig } from '@/lib/draft/upgrade-config'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('config')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const config = upgradeConfig(d.config)
  try {
    const result = simulate(config)
    return NextResponse.json({ ok: true, simulation: result, is_simulation: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error simulación'
    return NextResponse.json({ error: msg }, { status: 501 })
  }
}
```

- [ ] **Step 16.2: Commit**

```bash
git add src/app/api/torneos/draft/[id]/preview/route.ts
git commit -m "feat(api): preview endpoint que devuelve datos demo según formato"
```

---

## Task 17: Endpoint POST /api/torneos/draft/[id]/create-tournament

**Files:**
- Create: `src/app/api/torneos/draft/[id]/create-tournament/route.ts`

- [ ] **Step 17.1: Implement endpoint con transacción**

```typescript
// src/app/api/torneos/draft/[id]/create-tournament/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { upgradeConfig } from '@/lib/draft/upgrade-config'
import { tournamentConfigSchema } from '@/lib/draft/schema'
import { validateGolfRules } from '@/golf/tournament-config-validator'

export const dynamic = 'force-dynamic'

function genSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50) + '-' + Date.now().toString(36)
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Owner-only
  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('owner_id, config, status')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede crear' }, { status: 403 })
  if (d.status !== 'draft') return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })

  const config = upgradeConfig(d.config)

  // Validación dura (zod + golf rules)
  const z = tournamentConfigSchema.safeParse(config)
  if (!z.success) return NextResponse.json({ error: 'Config inválido', details: z.error.issues }, { status: 400 })

  const v = validateGolfRules(config)
  if (v.errors.length > 0) return NextResponse.json({ error: 'Reglas de golf', details: v.errors }, { status: 400 })
  if (!v.isReadyToCreate) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  // Lock: status=creating
  await supabase.from('tournament_drafts').update({ status: 'creating' }).eq('id', params.id)

  // Service role para insertar (transacción simulada con compensación)
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const slug = genSlug(config.name)
  const code = genCode()
  const firstRound = config.rounds[0]

  try {
    const { data: tour, error: tErr } = await service
      .from('tournaments')
      .insert({
        name: config.name,
        slug,
        organizer_id: user.id,
        course_id: firstRound.course_id,
        format: config.format,
        formato_juego: config.format,
        modo_juego: config.modo,
        hole_count: firstRound.hole_count,
        tees: firstRound.tee_assignment_mode === 'per_player' ? 'per_player' : 'mixed',
        use_handicap: config.use_handicap,
        afecta_estadisticas: !config.is_practice,
        codigo: code,
        cover_image_url: config.cover_image_url,
        status: 'draft',
        date_start: config.date_start,
        total_rounds: config.rounds.length,
      })
      .select('id, slug')
      .single()

    if (tErr || !tour) throw new Error(tErr?.message || 'Error creando tournament')

    // Categories
    const catsToInsert = config.categories.map(c => ({
      tournament_id: tour.id,
      name: c.name,
      handicap_min: c.handicap_min,
      handicap_max: c.handicap_max,
    }))
    if (catsToInsert.length > 0) {
      await service.from('categories').insert(catsToInsert)
    }

    // Prizes
    const prizesToInsert = config.prizes.map(p => ({
      tournament_id: tour.id,
      type: p.type,
      description: p.description,
      position: p.position,
      hole_number: p.hole_number,
    }))
    if (prizesToInsert.length > 0) {
      await service.from('tournament_prizes').insert(prizesToInsert)
    }

    // Rounds (a partir de la 2da, ya que la 1ra está en tournament directo)
    if (config.rounds.length > 1) {
      const extraRounds = config.rounds.slice(1).map(r => ({
        tournament_id: tour.id,
        round_number: r.round_number,
        date: r.date,
        course_id: r.course_id,
      }))
      // Si la tabla `rounds` existe con esa shape; si no, ajustar
      await service.from('rounds').insert(extraRounds)
    }

    // Marca el draft como created
    await service
      .from('tournament_drafts')
      .update({ status: 'created', tournament_id: tour.id })
      .eq('id', params.id)

    return NextResponse.json({ ok: true, tournament_id: tour.id, slug: tour.slug })
  } catch (err: unknown) {
    // Compensación: rollback al estado draft
    await service
      .from('tournament_drafts')
      .update({ status: 'draft' })
      .eq('id', params.id)
    const msg = err instanceof Error ? err.message : 'Error creando torneo'
    console.error('[create-tournament] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 17.2: Commit**

```bash
git add src/app/api/torneos/draft/[id]/create-tournament/route.ts
git commit -m "feat(api): create-tournament con validación dura + compensación en error"
```

---

## Task 18: Endpoint POST /api/torneos/draft/duplicate-from/[tournamentId]

**Files:**
- Create: `src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts`

- [ ] **Step 18.1: Implement endpoint**

```typescript
// src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createInitialConfig } from '@/lib/draft/initial-config'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { tournamentId: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: src, error: sErr } = await supabase
    .from('tournaments')
    .select('id, name, format, modo_juego, hole_count, tees, use_handicap, course_id, organizer_id')
    .eq('id', params.tournamentId)
    .single()

  if (sErr || !src) return NextResponse.json({ error: 'Torneo origen no encontrado' }, { status: 404 })
  if (src.organizer_id !== user.id) return NextResponse.json({ error: 'Solo el organizador puede duplicar' }, { status: 403 })

  // Categorías del torneo origen
  const { data: srcCats } = await supabase
    .from('categories')
    .select('name, handicap_min, handicap_max')
    .eq('tournament_id', params.tournamentId)

  const config = createInitialConfig()
  config.format = (src.format as typeof config.format) || 'stroke_play'
  config.modo = (src.modo_juego as typeof config.modo) || 'gross'
  config.use_handicap = !!src.use_handicap
  if (srcCats && srcCats.length > 0) {
    config.categories = srcCats.map(c => ({
      id: crypto.randomUUID(),
      name: c.name,
      handicap_min: c.handicap_min,
      handicap_max: c.handicap_max,
      gender: null,
    }))
  }
  config.rounds[0].course_id = src.course_id
  config.rounds[0].hole_count = ((src.hole_count === 9 ? 9 : 18)) as 9 | 18
  // name, date_start, registration.code: vacíos (forzar al user a setearlos)
  config.name = ''
  config.date_start = null
  config.rounds[0].date = null

  const { data: draft, error: dErr } = await supabase
    .from('tournament_drafts')
    .insert({
      owner_id: user.id,
      config,
      status: 'draft',
      version: 1,
    })
    .select('id, version, config, status')
    .single()
  if (dErr || !draft) return NextResponse.json({ error: 'Error creando draft' }, { status: 500 })

  await supabase.from('tournament_draft_collaborators').insert({
    draft_id: draft.id, user_id: user.id, role: 'owner', added_by: user.id,
  })

  return NextResponse.json({ ok: true, draft })
}
```

- [ ] **Step 18.2: Commit**

```bash
git add src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts
git commit -m "feat(api): duplicate-from copia config básico, fuerza name/date/code vacíos"
```

---

## Task 19: Cron cleanup de drafts viejos

**Files:**
- Create: `src/app/api/cron/cleanup-drafts/route.ts`
- Modify: `vercel.json`

- [ ] **Step 19.1: Implement endpoint**

```typescript
// src/app/api/cron/cleanup-drafts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel Cron envía un header secreto
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - 30)

  const { data, error } = await service
    .from('tournament_drafts')
    .update({ status: 'archived' })
    .eq('status', 'draft')
    .lt('updated_at', cutoff.toISOString())
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, archived: data?.length || 0 })
}
```

- [ ] **Step 19.2: Modify vercel.json**

Read current `vercel.json` and add `crons` field:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-drafts",
      "schedule": "0 3 * * *"
    }
  ]
}
```

(Si vercel.json no existe, crear uno con solo el bloque `crons`. Si ya existe, agregar el array `crons`.)

- [ ] **Step 19.3: Documentar y setear el secret**

`CRON_SECRET` es un token random que Vercel Cron envía en el header `Authorization: Bearer <secret>`. Generar con `openssl rand -hex 32` y setear:

1. Localmente en `.env.local`:
   ```
   CRON_SECRET=<token_generado>
   ```
2. En Vercel (production): `Settings → Environment Variables → CRON_SECRET = <token_generado>` (mismo valor).

Sin esto, el cron va a fallar con 401 en producción.

- [ ] **Step 19.4: Commit**

```bash
git add src/app/api/cron/cleanup-drafts/route.ts vercel.json
git commit -m "feat(cron): cleanup-drafts diario archiva drafts inactivos >30d"
```

---

## Task 20: Tests de integración API

**Files:**
- Create: `src/__tests__/integration/torneos-draft-api.test.ts`

> **Nota sobre integration tests:** este patrón sigue `src/__tests__/integration/coach-e2e.test.ts` (skipea cuando `.env.local` falta). Requiere `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` para hablar con la DB real.

- [ ] **Step 20.1: Implement integration tests**

```typescript
// src/__tests__/integration/torneos-draft-api.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder'
const skipIfNoEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(skipIfNoEnv)('Torneos Draft API integration', () => {
  let supabase: ReturnType<typeof createClient>
  let testUserId: string
  let createdDraftId: string

  beforeAll(() => {
    supabase = createClient(url, serviceKey)
    testUserId = '00000000-0000-0000-0000-000000000001'  // fake user
  })

  it('inserta draft directamente y lo recupera', async () => {
    const { data, error } = await supabase
      .from('tournament_drafts')
      .insert({ owner_id: testUserId, config: { schema_version: 1, name: 'Test', format: 'stroke_play', modo: 'gross', use_handicap: false, categories: [], rounds: [], registration: { mode: 'open_with_code' }, prizes: [], is_practice: false, pending_confirmations: [], date_start: null, cover_image_url: null }, status: 'draft', version: 1 })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    createdDraftId = data!.id as string
  })

  it('audit log: insertar evento manual y leerlo', async () => {
    const { error } = await supabase.from('tournament_draft_events').insert({
      draft_id: createdDraftId,
      actor_id: testUserId,
      config_partial: { name: 'Updated' },
      config_before: { name: 'Test' },
      source: 'manual',
    })
    expect(error).toBeNull()
  })

  it('cleanup-drafts archive cutoff: marca como archived drafts viejos', async () => {
    const longAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('tournament_drafts').update({ updated_at: longAgo }).eq('id', createdDraftId)

    const { data: cutoff } = await supabase
      .from('tournament_drafts')
      .update({ status: 'archived' })
      .eq('status', 'draft')
      .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .select('id')

    expect((cutoff || []).some(r => r.id === createdDraftId)).toBe(true)
  })

  it('cleanup', async () => {
    await supabase.from('tournament_drafts').delete().eq('id', createdDraftId)
  })
})
```

- [ ] **Step 20.2: Run integration tests (skip si no hay env)**

Run: `npm test -- torneos-draft-api.test.ts`
Expected: PASS (o `SKIP` si `.env.local` falta).

- [ ] **Step 20.3: Commit**

```bash
git add src/__tests__/integration/torneos-draft-api.test.ts
git commit -m "test(integration): tests de tablas draft + audit log + cleanup cutoff"
```

---

## Task 21: Canary tests anti-regresión

**Files:**
- Modify: `src/__tests__/canary-stability.test.ts`

- [ ] **Step 21.1: Agregar canaries**

Agregar al final del archivo `src/__tests__/canary-stability.test.ts` (siguiendo el patrón existente):

```typescript
describe('Canary: tournament drafts API', () => {
  it('endpoint create draft existe', () => {
    expect(existsSync('src/app/api/torneos/draft/route.ts')).toBe(true)
  })

  it('endpoint [id] handlers existe', () => {
    expect(existsSync('src/app/api/torneos/draft/[id]/route.ts')).toBe(true)
  })

  it('endpoint assistant existe', () => {
    expect(existsSync('src/app/api/torneos/draft/[id]/assistant/route.ts')).toBe(true)
  })

  it('endpoint preview existe', () => {
    expect(existsSync('src/app/api/torneos/draft/[id]/preview/route.ts')).toBe(true)
  })

  it('endpoint create-tournament existe', () => {
    expect(existsSync('src/app/api/torneos/draft/[id]/create-tournament/route.ts')).toBe(true)
  })

  it('cron cleanup-drafts existe', () => {
    expect(existsSync('src/app/api/cron/cleanup-drafts/route.ts')).toBe(true)
  })

  it('schema zod del config exporta tournamentConfigSchema y partial', () => {
    const content = readFileSync('src/lib/draft/schema.ts', 'utf-8')
    expect(content).toMatch(/export const tournamentConfigSchema/)
    expect(content).toMatch(/export const tournamentConfigPartialSchema/)
  })

  it('rate-limit utility existe', () => {
    expect(existsSync('src/lib/draft/rate-limit.ts')).toBe(true)
  })

  it('upgrade-config define CURRENT_SCHEMA_VERSION', () => {
    const content = readFileSync('src/lib/draft/upgrade-config.ts', 'utf-8')
    expect(content).toMatch(/CURRENT_SCHEMA_VERSION/)
  })

  it('vercel.json tiene cron de cleanup', () => {
    const content = readFileSync('vercel.json', 'utf-8')
    expect(content).toMatch(/cleanup-drafts/)
  })
})
```

(Adaptar imports `existsSync`/`readFileSync` si no están ya en el archivo.)

- [ ] **Step 21.2: Run canaries**

Run: `npm test -- canary-stability.test.ts`
Expected: PASS, todos los canaries (incluyendo los nuevos).

- [ ] **Step 21.3: Commit**

```bash
git add src/__tests__/canary-stability.test.ts
git commit -m "test(canary): anti-regresión para endpoints y libs de tournament drafts"
```

---

## Task 22: Pre-push completo y verificación final

- [ ] **Step 22.1: TypeScript completo**

Run: `npx tsc --noEmit`
Expected: cero errores.

- [ ] **Step 22.2: Suite de tests completa**

Run: `npm run test`
Expected: todos los tests pasan (incluye unitarios + canary; integration solo si hay `.env.local`).

- [ ] **Step 22.3: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores.

- [ ] **Step 22.4: Health check (si aplica)**

Si tenés sesión local corriendo: `curl http://localhost:3000/api/admin/health-check` (debe pasar — ningún sub-check tiene que romper por las tablas nuevas).

- [ ] **Step 22.5: Smoke E2E manual**

Con `npm run dev`:
1. POST `/api/torneos/draft` → recibís un draft id.
2. PATCH con `{ config_partial: { name: "Test" }, version: 1 }` → version=2.
3. POST `/api/torneos/draft/{id}/preview` → recibís simulación (si format=stroke_play).
4. POST `/api/torneos/draft/{id}/create-tournament` → debería fallar con "Faltan campos requeridos" (porque date/course vacíos).

- [ ] **Step 22.6: Commit final si quedó algo suelto**

```bash
git status
# si hay algo, commitear con scope claro
```

- [ ] **Step 22.7: Push a origin**

```bash
git push origin main
```

(El pre-push hook hace TypeScript + tests + build + DB schema parity. Si falla, fix antes de avanzar.)

---

## Self-Review Notes (post-plan)

Verificación de cobertura del spec → tareas:

| Spec § | Cobertura |
|---|---|
| §4 (decisiones técnicas) | ✓ Tasks 1-19 |
| §5 (modelo datos) | ✓ Task 1 (todas las tablas + RLS) |
| §6 (componente raíz) | ⏳ Fase 2 (frontend) |
| §7 (asistente IA) | ✓ Tasks 12-14 |
| §8 (layouts) | ⏳ Fase 2 (frontend) |
| §9 (flujos usuario) | ⏳ Fase 2 + 6 (E2E) |
| §10 (live polimórfico) | ⏳ Fase 6 |
| §11.A duplicar | ✓ Task 18 |
| §11.B simulación | ✓ Tasks 15-16 (parcial: 2/7 simuladores) |
| §11.C roles | ✓ Tasks 10-11 |
| §11.D conflicto fecha | ⏳ Fase 2 (validación cliente) |
| §13.5 legacy | N/A (no se rompe nada) |
| §17 test plan | ✓ Tasks 3, 4, 7, 12, 15, 20, 21 |

**Lo que queda pendiente del spec en este plan:**
- 5 simuladores faltan (stableford, best_ball, foursome, match-play-bracket, match-play-1v1) — sub-fase 1.5
- Frontend completo — Fase 2
- Live polimórfico — Fase 6

Estas pendencias están explícitamente fuera del scope de este plan. Cada una tiene su plan separado en su momento.

---

## Resumen de comandos clave

```bash
# Aplicar migración
node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/040_tournament_drafts.sql

# Tests unitarios de un archivo
npm test -- <filename>.test.ts

# Suite completa
npm run test

# TypeScript
npx tsc --noEmit

# Build
npm run build

# Pre-push automático
git push origin main
```
