# tAIger+ Plan Activo + Cumplimiento — Implementation Plan **v2.1 (reconciliado)**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reconciliación con spec paralelo:** ver `2026-05-08-taiger-plan-cumplimiento-design.md` §0. La lane home (`/coach/page.tsx`) está cedida al plan `2026-05-11-taiger-coach-home-redesign.md`. Este plan cubre solo la **chat lane** (`/coach/sesion/[id]` + APIs + migration + componentes chat-embedded).

**Tasks borrados respecto a v2 standalone (superseded por el paralelo):**
- Task 4.1 `<TodayCard>` — reemplazado por `<PlanActiveCard>` del paralelo (Task 12 allá).
- Task 4.2 `<PlanCompletedCard>` — manejado por status pill en PlanActiveCard del paralelo.
- Task 5.4 `/coach/page.tsx` rewrite — propiedad del Task 14 del paralelo.

**Goal:** Cerrar el loop coach → check-in → cumplimiento en `/coach/sesion`. Plan-aware chat header, drawer con escape hatches, drill cards inline, quick replies, tool transparency chips, citation chips, voice-to-text, todo behind feature flag para shippear sin Cerebro v2 listo. Backend: migration 040 (coach_events.type extend), 3 API routes nuevas.

**Architecture:** Cero invención de schema — reusamos `coach_plans` (state machine ya existente: active/resolved/expired/superseded/cancelled), `plan_outcomes` (correlación ronda↔plan ya existente), `coach_events` (event log existente con 11 types — añadimos 5). Componentes nuevos son client-only; sin nueva tabla, sin nueva enum, sin nuevo lib path.

**Tech Stack:** Next.js 14 App Router + TypeScript + Vitest (vmThreads pool) + @testing-library/react + Supabase (`@/lib/supabase` + `@/lib/supabaseAdmin` existentes) + Tailwind + ReactMarkdown + SSE.

**Spec:** `docs/superpowers/specs/2026-05-08-taiger-plan-cumplimiento-design.md` v2.
**Mockups:** `.superpowers/brainstorm/standalone/tu-golf-brainstorm.html` (necesitan actualización para reflejar dark-fijo + plan-completed card — Phase 0.5).

---

## File Structure (v2 — dramáticamente más simple)

### Migrations
- Create: `supabase/migrations/040_coach_events_extend_types.sql` — extiende CHECK preservando los 11 types reales + añade 5 nuevos.
- Create: `supabase/migrations/rollback/040_coach_events_rollback.sql` — restore previo en caso de rollback.

### Server lib
- Create: `src/lib/coach/practice-suggestions.ts` — mapping `pattern_id → { headline, subtitle, duration_min }`.
- Create: `src/lib/coach/active-plan.ts` — `getActivePlan(sb, userId)` + `getRecentCompletedPlan(sb, userId)` + `getLatestPlanOutcome(sb, planId)`.
- Create: `src/lib/feature-flags.ts` o extender existente — flag `taigerCoachPremium`.

### API routes
- Create: `src/app/api/taiger/plans/active/route.ts` — GET enriched plan context.
- Create: `src/app/api/taiger/practice/[planId]/log/route.ts` — POST emite `practice_session_logged` event.
- Create: `src/app/api/taiger/check-in/route.ts` — POST `{ plan_id, round_id, choice: 'confirmed' | 'dismissed' }` emite `plan_check_in_*` event.

### Components (atómicos)
- Create: `src/components/coach/QuickReplies.tsx`
- Create: `src/components/coach/ToolUseChip.tsx`
- Create: `src/components/coach/DrillCard.tsx` (renombrado conceptualmente como "PracticeCard" pero filename DrillCard por continuidad)
- Create: `src/components/coach/VoiceInputButton.tsx` (Web Speech API)
- Modify: `src/components/coach/CitedMarkdown.tsx` — activar binding citation tap.

### Components (composites)
- Create: `src/components/coach/PlanAwareChatHeader.tsx`
- ~~Create: `src/components/coach/TodayCard.tsx`~~ — superseded por PlanActiveCard del paralelo.
- ~~Create: `src/components/coach/PlanCompletedCard.tsx`~~ — superseded; manejado por badge en PlanAwareChatHeader (chat lane) y status pill en PlanActiveCard (home lane del paralelo).
- Create: `src/components/coach/PlanDetailDrawer.tsx`

### Hooks
- Create: `src/hooks/usePlanContext.ts` — fetch plan activo + último outcome + completed_recently flag.

### Pages
- Modify: `src/app/coach/page.tsx` — Today/Completed/Hero según estado.
- Modify: `src/app/coach/layout.tsx` — force dark-fijo en `/coach` (override theme toggle).
- Modify: `src/app/coach/sesion/[id]/page.tsx` — split en 4 sub-tasks (ver Phase 5).

### Tests
- Create: `src/__tests__/components/{QuickReplies,ToolUseChip,DrillCard,VoiceInputButton,PlanAwareChatHeader,PlanDetailDrawer}.test.tsx`
- Create: `src/__tests__/lib/coach/active-plan.test.ts`
- Create: `src/__tests__/lib/coach/practice-suggestions.test.ts`
- Create: `src/__tests__/api/taiger/plans-active.test.ts`
- Create: `src/__tests__/api/taiger/check-in.test.ts`
- Create: `src/__tests__/hooks/usePlanContext.test.tsx`
- Modify: `src/__tests__/canary-stability.test.ts` — añadir canarios.
- Helper: `src/__tests__/__helpers/mock-supabase.ts` — builder fluido reutilizable.

---

## Phase 0 — Schema delta (1 task, 1 migración)

### Task 0.1: Migration 040 + rollback

**Files:**
- Create: `supabase/migrations/040_coach_events_extend_types.sql`
- Create: `supabase/migrations/rollback/040_coach_events_rollback.sql`

- [ ] **Step 1: Capturar lista real de types ANTES de tocar**

```sql
-- scripts/inspect-coach-events-types.sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.coach_events'::regclass
  AND conname = 'coach_events_type_check';
```

Run: `node --env-file=.env.local scripts/run-sql.mjs scripts/inspect-coach-events-types.sql`
Expected: lista exacta de N types. Copiar al script de migration paso 2.

- [ ] **Step 2: Escribir migration 040 con la lista REAL capturada**

```sql
-- supabase/migrations/040_coach_events_extend_types.sql
-- Extiende coach_events.type con 5 nuevos eventos para el loop plan + cumplimiento.
-- Lista pre-existente VERIFICADA con Task 0.1 step 1 (NO INVENTAR).

BEGIN;

ALTER TABLE public.coach_events DROP CONSTRAINT IF EXISTS coach_events_type_check;

ALTER TABLE public.coach_events ADD CONSTRAINT coach_events_type_check CHECK (
  type IN (
    -- VERIFICADOS pre-existentes (copiados de output Task 0.1 step 1):
    'round_processed',
    'pattern_detected',
    'pattern_resolved',
    'plan_assigned',
    'plan_outcome',
    'plan_resolved',
    'plan_superseded',
    'session_message',
    'tool_called',
    'context_built',
    'admin_override',
    'hallucination_check',
    'extractor_shadow',
    'hallucination_review',
    'plan_accepted_by_user',
    -- NUEVOS (sub-proyecto A):
    'practice_session_logged',
    'quick_reply_picked',
    'plan_check_in_confirmed',
    'plan_check_in_dismissed',
    'voice_input_used'
  )
);

COMMIT;
```

**Crítico:** si Task 0.1 step 1 devuelve types adicionales a esta lista, AÑADIRLOS antes de COMMIT. No asumir.

- [ ] **Step 3: Escribir rollback**

```sql
-- supabase/migrations/rollback/040_coach_events_rollback.sql
-- Rollback de migration 040 — vuelve al CHECK pre-existente.

BEGIN;

ALTER TABLE public.coach_events DROP CONSTRAINT IF EXISTS coach_events_type_check;

ALTER TABLE public.coach_events ADD CONSTRAINT coach_events_type_check CHECK (
  type IN (
    -- ORIGINAL pre-040 (copiar desde Task 0.1 step 1):
    'round_processed', 'pattern_detected', 'pattern_resolved',
    'plan_assigned', 'plan_outcome', 'plan_resolved', 'plan_superseded',
    'session_message', 'tool_called', 'context_built',
    'admin_override', 'hallucination_check',
    'extractor_shadow', 'hallucination_review', 'plan_accepted_by_user'
  )
);

COMMIT;
```

- [ ] **Step 4: Aplicar migration**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/040_coach_events_extend_types.sql`
Expected: BEGIN, ALTER TABLE x2, COMMIT.

- [ ] **Step 5: Verificar**

Run: `node --env-file=.env.local scripts/run-sql.mjs scripts/inspect-coach-events-types.sql`
Expected: nueva lista contiene los 5 nuevos types.

- [ ] **Step 6: Update schema parity baseline si aplica**

Si pre-push hook step 4 falla con el cambio, editar `scripts/verify-db-schema-baseline.json` (o equivalente) para reconocer los nuevos types.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/040_coach_events_extend_types.sql supabase/migrations/rollback/040_coach_events_rollback.sql scripts/inspect-coach-events-types.sql
git commit -m "feat(coach/db): extend coach_events.type con 5 nuevos para loop plan + cumplimiento"
```

---

## Phase 0.5 — Mock helper + practice suggestions (1 task)

### Task 0.5: Mock Supabase helper + practice suggestions mapping

**Files:**
- Create: `src/__tests__/__helpers/mock-supabase.ts`
- Create: `src/lib/coach/practice-suggestions.ts`
- Create: `src/__tests__/lib/coach/practice-suggestions.test.ts`

- [ ] **Step 1: Mock helper reutilizable**

```ts
// src/__tests__/__helpers/mock-supabase.ts
import { vi } from 'vitest';

export interface MockTableResponses {
  [table: string]: {
    data: any;
    error?: any;
  };
}

export function mockSupabase(responses: MockTableResponses, user: { id: string } | null = { id: 'u1' }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn((table: string) => {
      const response = responses[table] ?? { data: null, error: null };
      const chain: any = {};
      const methods = ['select', 'eq', 'in', 'not', 'order', 'limit', 'update', 'insert', 'delete'];
      methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
      chain.maybeSingle = vi.fn().mockResolvedValue(response);
      chain.single = vi.fn().mockResolvedValue(response);
      chain.then = (resolve: any) => resolve(response);
      return chain;
    }),
  };
}
```

- [ ] **Step 2: Test de practice-suggestions**

```ts
// src/__tests__/lib/coach/practice-suggestions.test.ts
import { describe, it, expect } from 'vitest';
import { derivePracticeAction, KNOWN_PATTERNS } from '@/lib/coach/practice-suggestions';

describe('derivePracticeAction', () => {
  it('approach_100_150 mapea a "Driving range — aproximaciones"', () => {
    const r = derivePracticeAction({ pattern_id: 'approach_100_150' } as any);
    expect(r.headline).toMatch(/aproximaciones/i);
    expect(r.duration_min).toBeGreaterThan(0);
  });
  it('putts_1_2m mapea a putting green', () => {
    const r = derivePracticeAction({ pattern_id: 'putts_1_2m' } as any);
    expect(r.headline).toMatch(/putt/i);
  });
  it('pattern_id desconocido devuelve fallback "Sesión libre"', () => {
    const r = derivePracticeAction({ pattern_id: 'unknown_xyz' } as any);
    expect(r.headline).toMatch(/sesión libre/i);
  });
  it('cubre los 5 patrones MVP del spec', () => {
    expect(KNOWN_PATTERNS).toEqual(expect.arrayContaining([
      'approach_100_150', 'putts_1_2m', 'post_bogey_spiral',
      'driving_dispersion', 'putts_from_3m',
    ]));
  });
});
```

- [ ] **Step 3: Implementación**

```ts
// src/lib/coach/practice-suggestions.ts
export interface PracticeAction {
  headline: string;
  subtitle: string;
  duration_min: number;
}

const MAP: Record<string, PracticeAction> = {
  approach_100_150: { headline: 'Driving range — aproximaciones', subtitle: '25 min · hierros 8 y 9', duration_min: 25 },
  putts_1_2m:       { headline: 'Putting green — putts cortos',    subtitle: '20 min · radio 1-2m', duration_min: 20 },
  post_bogey_spiral:{ headline: 'Ronda con foco mental',           subtitle: '9 hoyos · respiración post-bogey', duration_min: 90 },
  driving_dispersion:{ headline: 'Driving range — dispersión',     subtitle: '30 min · drives + medio',           duration_min: 30 },
  putts_from_3m:    { headline: 'Putting green — distancia',       subtitle: '20 min · putts 3-5m',               duration_min: 20 },
};

export const KNOWN_PATTERNS = Object.keys(MAP);

const FALLBACK: PracticeAction = {
  headline: 'Sesión libre', subtitle: '30 min · trabajá lo que sientas',
  duration_min: 30,
};

export function derivePracticeAction(plan: { pattern_id: string }): PracticeAction {
  return MAP[plan.pattern_id] ?? FALLBACK;
}
```

- [ ] **Step 4: Run tests + commit**

```bash
npm run test -- src/__tests__/lib/coach/practice-suggestions.test.ts
git add src/lib/coach/practice-suggestions.ts src/__tests__/lib/coach/practice-suggestions.test.ts src/__tests__/__helpers/mock-supabase.ts
git commit -m "feat(coach/lib): practice-suggestions mapping + mock-supabase helper"
```

---

## Phase 1 — Active plan helpers (1 task, TDD)

### Task 1.1: `src/lib/coach/active-plan.ts`

**Files:**
- Create: `src/lib/coach/active-plan.ts`
- Create: `src/__tests__/lib/coach/active-plan.test.ts`

- [ ] **Step 1: Test fallido**

```ts
// src/__tests__/lib/coach/active-plan.test.ts
import { describe, it, expect } from 'vitest';
import { mockSupabase } from '@/__tests__/__helpers/mock-supabase';
import { getActivePlan, getRecentCompletedPlan, getLatestPlanOutcome } from '@/lib/coach/active-plan';

describe('getActivePlan', () => {
  it('devuelve null si no hay plan active', async () => {
    const sb = mockSupabase({ coach_plans: { data: null } });
    const r = await getActivePlan(sb as any, 'u1');
    expect(r).toBeNull();
  });
  it('devuelve el plan active', async () => {
    const sb = mockSupabase({ coach_plans: { data: { id: 'p1', status: 'active', pattern_id: 'approach_100_150', user_id: 'u1' } } });
    const r = await getActivePlan(sb as any, 'u1');
    expect(r?.id).toBe('p1');
  });
});

describe('getRecentCompletedPlan', () => {
  it('devuelve plan resolved en últimos 7 días', async () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    const sb = mockSupabase({ coach_plans: { data: { id: 'p2', status: 'resolved', resolved_at: recent } } });
    const r = await getRecentCompletedPlan(sb as any, 'u1');
    expect(r?.id).toBe('p2');
  });
});

describe('getLatestPlanOutcome', () => {
  it('devuelve el outcome más reciente de un plan', async () => {
    const sb = mockSupabase({ plan_outcomes: { data: { plan_id: 'p1', actual_value: 0.78, created_at: '2026-05-08' } } });
    const r = await getLatestPlanOutcome(sb as any, 'p1');
    expect(r?.actual_value).toBe(0.78);
  });
});
```

- [ ] **Step 2: Run, expectar fallar.**

- [ ] **Step 3: Implementar**

```ts
// src/lib/coach/active-plan.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActivePlan {
  id: string;
  user_id: string;
  status: string;
  pattern_id: string;
  hypothesis: string | null;
  metric: string | null;
  target_value: number | null;
  target_op: string | null;
  baseline_value: number | null;
  duration_days: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface PlanOutcome {
  id: number;
  plan_id: string;
  user_id: string;
  actual_value: number | null;
  delta_vs_target: number | null;
  round_id: string | null;
  created_at: string;
}

export async function getActivePlan(sb: SupabaseClient, userId: string): Promise<ActivePlan | null> {
  const { data, error } = await sb
    .from('coach_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ActivePlan | null;
}

export async function getRecentCompletedPlan(sb: SupabaseClient, userId: string, daysWindow = 7): Promise<ActivePlan | null> {
  const cutoff = new Date(Date.now() - daysWindow * 86400000).toISOString();
  const { data, error } = await sb
    .from('coach_plans')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['resolved', 'expired'])
    .gte('resolved_at', cutoff)
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ActivePlan | null;
}

export async function getLatestPlanOutcome(sb: SupabaseClient, planId: string): Promise<PlanOutcome | null> {
  const { data, error } = await sb
    .from('plan_outcomes')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as PlanOutcome | null;
}
```

- [ ] **Step 4: Run pass + commit**

```bash
git add src/lib/coach/active-plan.ts src/__tests__/lib/coach/active-plan.test.ts
git commit -m "feat(coach/lib): active-plan helpers (getActivePlan, getRecentCompletedPlan, getLatestPlanOutcome)"
```

---

## Phase 2 — API routes (3 tasks)

### Task 2.1: `GET /api/taiger/plans/active`

**Files:**
- Create: `src/app/api/taiger/plans/active/route.ts`
- Create: `src/__tests__/api/taiger/plans-active.test.ts`

- [ ] **Step 1: Test**

```ts
// src/__tests__/api/taiger/plans-active.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase } from '@/__tests__/__helpers/mock-supabase';
import { GET } from '@/app/api/taiger/plans/active/route';

vi.mock('@/lib/supabase', () => ({ supabaseServerClient: vi.fn() }));

describe('GET /api/taiger/plans/active', () => {
  beforeEach(() => vi.resetAllMocks());

  it('401 sin auth', async () => {
    const { supabaseServerClient } = await import('@/lib/supabase');
    (supabaseServerClient as any).mockResolvedValue(mockSupabase({}, null));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('200 con plan active + outcome reciente', async () => {
    const { supabaseServerClient } = await import('@/lib/supabase');
    (supabaseServerClient as any).mockResolvedValue(mockSupabase({
      coach_plans: { data: { id: 'p1', user_id: 'u1', status: 'active', pattern_id: 'approach_100_150', metric: 'gir_100_150', target_value: 0.7, target_op: '>=', baseline_value: 0.55, duration_days: 21, created_at: '2026-05-01' } },
      plan_outcomes: { data: { plan_id: 'p1', actual_value: 0.71, delta_vs_target: 0.01, created_at: '2026-05-10' } },
    }));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activePlan.id).toBe('p1');
    expect(body.latestOutcome.actual_value).toBe(0.71);
    expect(body.completedRecently).toBeNull();
  });

  it('200 con completedRecently si hay plan resolved <7d y no hay active', async () => {
    const recent = new Date(Date.now() - 3 * 86400000).toISOString();
    const { supabaseServerClient } = await import('@/lib/supabase');
    let callCount = 0;
    const sbAny: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn((t: string) => {
        const data = t === 'coach_plans'
          ? (callCount++ === 0 ? null : { id: 'p2', status: 'resolved', resolved_at: recent })
          : null;
        const chain: any = {};
        ['select','eq','in','gte','order','limit'].forEach(m => chain[m] = vi.fn().mockReturnValue(chain));
        chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
        return chain;
      }),
    };
    (supabaseServerClient as any).mockResolvedValue(sbAny);
    const res = await GET();
    const body = await res.json();
    expect(body.activePlan).toBeNull();
    expect(body.completedRecently?.id).toBe('p2');
  });
});
```

- [ ] **Step 2: Implementar la ruta usando libs existentes**

```ts
// src/app/api/taiger/plans/active/route.ts
import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase';
import { getActivePlan, getRecentCompletedPlan, getLatestPlanOutcome } from '@/lib/coach/active-plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = await supabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const activePlan = await getActivePlan(sb, user.id);
  const completedRecently = activePlan ? null : await getRecentCompletedPlan(sb, user.id);
  const latestOutcome = activePlan ? await getLatestPlanOutcome(sb, activePlan.id) : null;

  return NextResponse.json({ activePlan, completedRecently, latestOutcome });
}
```

**Nota:** `supabaseServerClient` debe existir en `@/lib/supabase` o crearse como alias del helper actual de cookies. Si no existe con ese nombre, ajustar import (verificar Task 1.1 step previo).

- [ ] **Step 3: Run + commit**

```bash
git add src/app/api/taiger/plans/active/route.ts src/__tests__/api/taiger/plans-active.test.ts
git commit -m "feat(taiger/api): GET /api/taiger/plans/active enriched context"
```

---

### Task 2.2: `POST /api/taiger/practice/[planId]/log`

**Files:**
- Create: `src/app/api/taiger/practice/[planId]/log/route.ts`
- Create: `src/__tests__/api/taiger/practice-log.test.ts`

- [ ] **Step 1: Test**

```ts
// src/__tests__/api/taiger/practice-log.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase } from '@/__tests__/__helpers/mock-supabase';
import { POST } from '@/app/api/taiger/practice/[planId]/log/route';

vi.mock('@/lib/supabase', () => ({ supabaseServerClient: vi.fn() }));

const mkReq = (body: any = {}) =>
  new Request('http://localhost/api/taiger/practice/p1/log', {
    method: 'POST', body: JSON.stringify(body),
  });

describe('POST /api/taiger/practice/[planId]/log', () => {
  beforeEach(() => vi.resetAllMocks());

  it('401 sin auth', async () => {
    const { supabaseServerClient } = await import('@/lib/supabase');
    (supabaseServerClient as any).mockResolvedValue(mockSupabase({}, null));
    const res = await POST(mkReq(), { params: { planId: 'p1' } });
    expect(res.status).toBe(401);
  });

  it('200 emite practice_session_logged', async () => {
    const { supabaseServerClient } = await import('@/lib/supabase');
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const sbAny: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn((t: string) => {
        if (t === 'coach_plans') return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', user_id: 'u1', status: 'active' } }),
        };
        if (t === 'coach_events') return { insert: insertMock };
        return {};
      }),
    };
    (supabaseServerClient as any).mockResolvedValue(sbAny);
    const res = await POST(mkReq({ note: 'driving range 25 min' }), { params: { planId: 'p1' } });
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'practice_session_logged',
      user_id: 'u1',
      related_plan_id: 'p1',
    }));
  });

  it('403 si plan no es del usuario', async () => {
    const { supabaseServerClient } = await import('@/lib/supabase');
    const sbAny: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', user_id: 'OTHER', status: 'active' } }),
      })),
    };
    (supabaseServerClient as any).mockResolvedValue(sbAny);
    const res = await POST(mkReq(), { params: { planId: 'p1' } });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Implementar**

```ts
// src/app/api/taiger/practice/[planId]/log/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const Body = z.object({
  note: z.string().max(500).optional(),
  duration_min: z.number().int().positive().optional(),
});

export async function POST(req: Request, { params }: { params: { planId: string } }) {
  const sb = await supabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body;
  try { body = Body.parse(await req.json().catch(() => ({}))); }
  catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const { data: plan } = await sb.from('coach_plans')
    .select('id, user_id, status').eq('id', params.planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (plan.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await sb.from('coach_events').insert({
    user_id: user.id,
    type: 'practice_session_logged',
    related_plan_id: params.planId,
    payload: { note: body.note, duration_min: body.duration_min },
  });

  return NextResponse.json({ ok: true, plan_id: params.planId });
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/app/api/taiger/practice src/__tests__/api/taiger/practice-log.test.ts
git commit -m "feat(taiger/api): POST /api/taiger/practice/[planId]/log + ownership check"
```

---

### Task 2.3: `POST /api/taiger/check-in`

**Files:**
- Create: `src/app/api/taiger/check-in/route.ts`
- Create: `src/__tests__/api/taiger/check-in.test.ts`

Comportamiento: el usuario confirma o niega que el outcome reciente fue producto de trabajar el plan. **Nunca cambia `coach_plans.status` directamente** — solo emite evento. Cerebro v2 toma N confirmaciones consecutivas y decide pasar plan a `resolved`.

- [ ] **Step 1: Test**

```ts
// src/__tests__/api/taiger/check-in.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/taiger/check-in/route';
import { mockSupabase } from '@/__tests__/__helpers/mock-supabase';

vi.mock('@/lib/supabase', () => ({ supabaseServerClient: vi.fn() }));

const mkReq = (body: any) => new Request('http://localhost/api/taiger/check-in', {
  method: 'POST', body: JSON.stringify(body),
});

describe('POST /api/taiger/check-in', () => {
  beforeEach(() => vi.resetAllMocks());

  it('400 si choice inválido', async () => {
    const { supabaseServerClient } = await import('@/lib/supabase');
    (supabaseServerClient as any).mockResolvedValue(mockSupabase({}, { id: 'u1' }));
    const res = await POST(mkReq({ plan_id: 'p1', choice: 'maybe' }));
    expect(res.status).toBe(400);
  });

  it('200 confirmed emite plan_check_in_confirmed', async () => {
    const { supabaseServerClient } = await import('@/lib/supabase');
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const sbAny: any = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn((t: string) => {
        if (t === 'coach_plans') return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1', user_id: 'u1', status: 'active' } }),
        };
        if (t === 'coach_events') return { insert: insertMock };
        return {};
      }),
    };
    (supabaseServerClient as any).mockResolvedValue(sbAny);
    const res = await POST(mkReq({ plan_id: 'p1', round_id: 'r1', choice: 'confirmed' }));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'plan_check_in_confirmed',
    }));
  });
});
```

- [ ] **Step 2: Implementar**

```ts
// src/app/api/taiger/check-in/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const Body = z.object({
  plan_id: z.string().uuid(),
  round_id: z.string().uuid().optional(),
  choice: z.enum(['confirmed', 'dismissed']),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const sb = await supabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const { data: plan } = await sb.from('coach_plans')
    .select('id, user_id, status').eq('id', body.plan_id).maybeSingle();
  if (!plan || plan.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await sb.from('coach_events').insert({
    user_id: user.id,
    type: body.choice === 'confirmed' ? 'plan_check_in_confirmed' : 'plan_check_in_dismissed',
    related_plan_id: body.plan_id,
    payload: { round_id: body.round_id, note: body.note },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/app/api/taiger/check-in src/__tests__/api/taiger/check-in.test.ts
git commit -m "feat(taiger/api): POST /api/taiger/check-in (confirmed | dismissed) emite evento"
```

---

## Phase 3 — Atomic UI components (4 tasks)

Cada task sigue patrón TDD idéntico (test fallido → impl → pass → commit). Para no inflar el plan, doy código completo en cada componente pero pasos abreviados.

### Task 3.1: `<QuickReplies />`

**Files:** `src/components/coach/QuickReplies.tsx` + test.

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickReplies } from '@/components/coach/QuickReplies';

describe('<QuickReplies />', () => {
  it('renderiza chips, primero como primary', () => {
    render(<QuickReplies replies={['Lo trabajé', 'No pude', 'Demasiado difícil', 'Explicame']} onPick={() => {}} />);
    expect(screen.getByText('Lo trabajé').parentElement?.dataset.primary).toBe('true');
  });
  it('onPick disparado con texto', () => {
    const onPick = vi.fn();
    render(<QuickReplies replies={['A', 'B']} onPick={onPick} />);
    fireEvent.click(screen.getByText('B'));
    expect(onPick).toHaveBeenCalledWith('B');
  });
  it('disabled previene click', () => {
    const onPick = vi.fn();
    render(<QuickReplies replies={['A']} onPick={onPick} disabled />);
    fireEvent.click(screen.getByText('A'));
    expect(onPick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/coach/QuickReplies.tsx
'use client';

interface Props {
  replies: string[];
  onPick: (reply: string) => void;
  disabled?: boolean;
}

export function QuickReplies({ replies, onPick, disabled }: Props) {
  if (!replies.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5 ml-7">
      {replies.map((reply, i) => (
        <button
          key={reply}
          type="button"
          disabled={disabled}
          data-primary={i === 0}
          onClick={() => !disabled && onPick(reply)}
          className={[
            'px-2.5 py-1 rounded-full text-[10px] font-medium border bg-white',
            i === 0 ? 'border-[#c4992a] text-[#c4992a]' : 'border-[#d1d1d6] text-[#1d1d1f]',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/QuickReplies.tsx src/__tests__/components/QuickReplies.test.tsx
git commit -m "feat(coach/ui): QuickReplies con primary gold + disabled state"
```

---

### Task 3.2: `<ToolUseChip />`

Mismo patrón TDD. Código:

```tsx
// src/components/coach/ToolUseChip.tsx
'use client';

interface Props {
  state: 'loading' | 'done' | 'error';
  label: string;
  summary?: string;
}

export function ToolUseChip({ state, label, summary }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[#e7e7e7] bg-white text-[9px] text-[#86868b] w-fit">
      {state === 'loading' && <span role="status" aria-label="loading" className="w-3 h-3 border-2 border-[#c4992a] border-t-transparent rounded-full animate-spin" />}
      {state === 'done' && <span aria-label="done" className="text-[#34c759]">✓</span>}
      {state === 'error' && <span aria-label="error" className="text-[#ff3b30]">✕</span>}
      <span>{label}</span>
      {summary && state === 'done' && <span className="opacity-70">· {summary}</span>}
    </div>
  );
}
```

- [ ] Tests: render loading/done/error con assertions de labels/icons.
- [ ] Commit: `feat(coach/ui): ToolUseChip con 3 estados`.

---

### Task 3.3: `<DrillCard />`

```tsx
// src/components/coach/DrillCard.tsx
'use client';

export interface DrillCardData {
  id: string;
  title: string;
  description?: string | null;
  duration_min?: number | null;
  done?: boolean;
}

interface Props {
  drill: DrillCardData;
  onLog: (drillId: string) => void;
}

export function DrillCard({ drill, onLog }: Props) {
  return (
    <div className="ml-7 mt-2 p-3 bg-white border border-[#e7e7e7] rounded-xl">
      <div className="flex justify-between items-start">
        <div>
          {drill.duration_min != null && <div className="text-[9px] tracking-wider text-[#86868b]">PRÁCTICA · {drill.duration_min} MIN</div>}
          <div className="text-[12px] font-semibold text-[#1d1d1f] mt-0.5">{drill.title}</div>
          {drill.description && <div className="text-[10px] text-[#86868b] mt-0.5">{drill.description}</div>}
        </div>
        {drill.done
          ? <span aria-label="drill-done" className="w-[18px] h-[18px] rounded-full bg-[#34c759] text-white text-[11px] flex items-center justify-center">✓</span>
          : <span aria-label="drill-pending" className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#d1d1d6]" />}
      </div>
      {!drill.done && (
        <button type="button" onClick={() => onLog(drill.id)} className="mt-2 w-full bg-[#c4992a] text-[#0a0a0a] py-1.5 rounded-lg text-[11px] font-semibold">
          Marcar como hecho
        </button>
      )}
    </div>
  );
}
```

- [ ] Tests: pending state, done state, onLog disparado.
- [ ] Commit: `feat(coach/ui): DrillCard con estado done + onLog handler`.

---

### Task 3.4: `<VoiceInputButton />` (Tier 2)

```tsx
// src/components/coach/VoiceInputButton.tsx
'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onTranscript: (text: string) => void;
  lang?: string;
}

export function VoiceInputButton({ onTranscript, lang = 'es-CL' }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);

  useEffect(() => {
    const W: any = window;
    const SpeechRecognition = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const r = new SpeechRecognition();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      onTranscript(text);
      setListening(false);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setSupported(true);
  }, [lang, onTranscript]);

  if (!supported) return null;

  const toggle = () => {
    if (listening) { recogRef.current.stop(); }
    else { recogRef.current.start(); setListening(true); }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? 'Detener dictado' : 'Dictar mensaje'}
      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[12px] ${listening ? 'bg-[#ff3b30] text-white' : 'bg-[#1a1a1a] text-white'}`}
    >
      {listening ? '■' : '🎤'}
    </button>
  );
}
```

- [ ] Tests: render hidden si SpeechRecognition no existe en window; mock SpeechRecognition para test de toggle.
- [ ] Commit: `feat(coach/ui): VoiceInputButton (Web Speech API, es-CL)`.

---

## Phase 4 — Composite UI components (2 tasks tras reconciliación)

### ~~Task 4.1: `<TodayCard />`~~ — SUPERSEDED por paralelo

**Decisión 2026-05-11:** este task queda cancelado. `<PlanActiveCard>` del plan paralelo `2026-05-11-taiger-coach-home-redesign.md` Task 12 cubre el caso con más información (anti-streak dots + correlación cuantificada + status pill por tone). El home del paralelo orquesta el render. Mi `practice-suggestions.ts` (Task 0.5) queda como interface ofrecida al paralelo si quieren mostrar próxima práctica sugerida en el subtitle.

### ~~Task 4.1.bis (originalmente Task 4.1): `<TodayCard />` (dark-fijo)~~

(Sección preservada solo como referencia histórica de v2 standalone. NO ejecutar.)

```tsx
// src/components/coach/TodayCard.tsx
'use client';

export interface TodayCardData {
  date_label: string;
  action_headline: string;
  action_subtitle: string;
  plan_id: string;
  plan_title: string;
  day_current: number;
  duration_days: number;
  actual_value: number | null;
  target_value: number | null;
  baseline_value: number | null;
  delta_strokes: number | null;
}

interface Props {
  data: TodayCardData;
  onStart: (planId: string) => void;
}

export function TodayCard({ data, onStart }: Props) {
  const pct = data.actual_value != null && data.target_value != null
    ? Math.min(100, Math.max(0, (data.actual_value / data.target_value) * 100))
    : 0;
  const dash = (pct / 100) * 100;
  return (
    <div className="p-5 bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] text-white rounded-2xl mb-3 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#c4992a] to-transparent" />
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[9px] tracking-[2px] font-semibold opacity-50">{data.date_label}</div>
          <div className="text-[22px] font-light mt-2 leading-tight tracking-tight">{data.action_headline}</div>
          <div className="text-[14px] font-light opacity-85 mt-0.5">{data.action_subtitle}</div>
        </div>
        <div className="relative w-[38px] h-[38px] flex-shrink-0" aria-label={`progress-${Math.round(pct)}`}>
          <svg width={38} height={38} viewBox="0 0 38 38">
            <circle cx={19} cy={19} r={16} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={2} />
            <circle cx={19} cy={19} r={16} fill="none" stroke="#c4992a" strokeWidth={2} strokeDasharray={`${dash} 100`} strokeLinecap="round" transform="rotate(-90 19 19)" />
          </svg>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
        <div>
          <div className="text-[9px] tracking-wider opacity-45">PLAN · DÍA {data.day_current} DE {data.duration_days}</div>
          <div className="text-[11px] opacity-85 mt-0.5">
            {data.plan_title}
            {data.delta_strokes != null && (
              <> · <span className={data.delta_strokes < 0 ? 'text-[#4ade80]' : 'text-[#ff9f0a]'}>{data.delta_strokes < 0 ? '−' : '+'}{Math.abs(data.delta_strokes).toFixed(1)} strokes</span></>
            )}
          </div>
        </div>
        <button type="button" onClick={() => onStart(data.plan_id)} className="bg-[#c4992a] text-[#0a0a0a] px-4 py-2 rounded-full text-[11px] font-bold tracking-wide">
          Empezar
        </button>
      </div>
    </div>
  );
}
```

- [ ] Tests: render con/sin actual_value, click "Empezar", ring sin progress cuando actual_value null.
- [ ] Commit: `feat(coach/ui): TodayCard action-first hero (dark-fijo)`.

---

### Task 4.2: `<PlanAwareChatHeader />` (PlanCompletedCard borrado)

**Cambio reconciliación:** ya no se crea `<PlanCompletedCard>` standalone. El estado `resolved`/`expired` en la chat lane se muestra como **badge dentro del `<PlanAwareChatHeader>`** ("Plan completado · esperando siguiente") en vez de un card aparte. El paralelo maneja el caso resolved/expired en home con status pill en PlanActiveCard.

`PlanCompletedCard.tsx` no se crea. Tests asociados se omiten. Si en futuro lane home y lane chat necesitan compartir un "completed banner", se extrae como helper compartido — out of scope ahora.

```tsx
// src/components/coach/PlanCompletedCard.tsx
'use client';

interface Props {
  plan: { id: string; hypothesis: string | null; status: string; resolved_at: string | null };
  onRequestNext: () => void;
}

export function PlanCompletedCard({ plan, onRequestNext }: Props) {
  const status = plan.status === 'resolved' ? 'Cumplido' : 'No alcanzado';
  return (
    <div className="p-5 bg-[#0a0a0a] text-white rounded-2xl mb-3 border border-white/8">
      <div className="text-[9px] tracking-[2px] font-semibold opacity-50">PLAN {status.toUpperCase()}</div>
      <div className="text-[18px] font-light mt-2 leading-tight">{plan.hypothesis ?? 'Plan finalizado'}</div>
      <button onClick={onRequestNext} className="mt-4 bg-[#c4992a] text-[#0a0a0a] px-4 py-2 rounded-full text-[11px] font-bold tracking-wide">
        Pedí el próximo plan
      </button>
    </div>
  );
}
```

```tsx
// src/components/coach/PlanAwareChatHeader.tsx
'use client';

export interface PlanHeaderData {
  plan_id: string;
  hypothesis: string;
  day_current: number;
  duration_days: number;
  actual_value: number | null;
  target_value: number | null;
  delta_strokes: number | null;
}

interface Props {
  plan: PlanHeaderData | null;
  onBack: () => void;
  onTapPlan: () => void;
}

export function PlanAwareChatHeader({ plan, onBack, onTapPlan }: Props) {
  return (
    <div className="bg-[#0a0a0a] text-white px-3.5 py-2.5 flex items-center gap-2.5">
      <button onClick={onBack} aria-label="Volver" className="text-base opacity-60">‹</button>
      {plan ? (
        <button type="button" onClick={onTapPlan} className="flex-1 text-left bg-transparent border-0 cursor-pointer text-white">
          <div className="text-[12px] font-semibold truncate">{plan.hypothesis}</div>
          <div className="text-[9px] opacity-55">
            Día {plan.day_current}/{plan.duration_days}
            {plan.actual_value != null && plan.target_value != null && (
              <> · {plan.actual_value.toFixed(2)} / {plan.target_value.toFixed(2)}</>
            )}
            {plan.delta_strokes != null && (
              <> · <span className={plan.delta_strokes < 0 ? 'text-[#4ade80]' : 'text-[#ff9f0a]'}>{plan.delta_strokes < 0 ? '−' : '+'}{Math.abs(plan.delta_strokes).toFixed(1)}</span></>
            )}
          </div>
        </button>
      ) : (
        <div className="flex-1 text-[12px] font-semibold">Conversación continua</div>
      )}
    </div>
  );
}
```

- [ ] Tests: con/sin plan, formatting de números, click handlers.
- [ ] Commits: 2 commits separados (PlanCompletedCard, PlanAwareChatHeader).

---

### Task 4.3: `<PlanDetailDrawer />` con escape hatches

```tsx
// src/components/coach/PlanDetailDrawer.tsx
'use client';

interface PlanOutcomeRow {
  id: number;
  actual_value: number | null;
  delta_vs_target: number | null;
  created_at: string;
}

interface Props {
  open: boolean;
  plan: {
    id: string;
    hypothesis: string | null;
    metric: string | null;
    actual_value: number | null;
    target_value: number | null;
    baseline_value: number | null;
    day_current: number;
    duration_days: number;
    status: string;
  };
  outcomes: PlanOutcomeRow[];
  onClose: () => void;
  onRequestAdjust: () => void;
  onMarkCompleted: () => void;
}

export function PlanDetailDrawer({ open, plan, outcomes, onClose, onRequestAdjust, onMarkCompleted }: Props) {
  if (!open) return null;
  const canMarkCompleted = plan.day_current >= plan.duration_days * 0.8;
  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="drawer-backdrop" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto p-5">
        <div className="w-10 h-1 bg-[#d1d1d6] rounded-full mx-auto mb-4" />
        <div className="text-[10px] tracking-wider text-[#86868b]">PLAN · DÍA {plan.day_current} DE {plan.duration_days}</div>
        <div className="text-[18px] font-semibold text-[#1d1d1f] mt-1">{plan.hypothesis}</div>
        {plan.metric && (
          <div className="mt-3 text-[12px] text-[#1d1d1f]">
            <strong>{plan.metric}:</strong> {plan.actual_value?.toFixed(2) ?? '—'} / {plan.target_value?.toFixed(2) ?? '—'} (baseline {plan.baseline_value?.toFixed(2) ?? '—'})
          </div>
        )}
        <div className="mt-4">
          <div className="text-[10px] tracking-wider text-[#86868b]">HISTORIAL DE RONDAS</div>
          <ul className="mt-2 space-y-1.5">
            {outcomes.map((o) => (
              <li key={o.id} className="text-[11px] text-[#1d1d1f] flex justify-between">
                <span>{new Date(o.created_at).toLocaleDateString('es-CL')}</span>
                <span>{o.actual_value?.toFixed(2) ?? '—'} · Δ {o.delta_vs_target?.toFixed(2) ?? '—'}</span>
              </li>
            ))}
            {outcomes.length === 0 && <li className="text-[11px] text-[#86868b]">Sin rondas evaluadas aún.</li>}
          </ul>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onRequestAdjust} className="flex-1 py-2 rounded-lg border border-[#c4992a] text-[#c4992a] text-[11px] font-semibold">
            Pedile a tAIger+ ajustar
          </button>
          {canMarkCompleted && (
            <button onClick={onMarkCompleted} className="flex-1 py-2 rounded-lg bg-[#1a1a1a] text-white text-[11px] font-semibold">
              Marcar completado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] Tests: open=false hidden, backdrop click, "Marcar completado" oculto si day_current < 80% duration_days, click handlers.
- [ ] Commit: `feat(coach/ui): PlanDetailDrawer + escape hatches (adjust, mark completed)`.

---

## Phase 5 — Hooks + page integration (5 tasks atómicos)

### Task 5.1: `usePlanContext` hook

```ts
// src/hooks/usePlanContext.ts
'use client';
import { useEffect, useState } from 'react';

export interface PlanContext {
  activePlan: any | null;
  completedRecently: any | null;
  latestOutcome: any | null;
}

export function usePlanContext() {
  const [data, setData] = useState<PlanContext>({ activePlan: null, completedRecently: null, latestOutcome: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/taiger/plans/active', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return { ...data, loading, error };
}
```

- [ ] Tests: mock fetch, valida states loading/data/error.
- [ ] Commit: `feat(coach/hooks): usePlanContext fetcher`.

---

### Task 5.2: Activate `<CitedMarkdown />` citation chips

(Modificación de archivo existente — patrón ya descrito en plan v1 Task 3.5. Citation chips solo funcionan cuando Cerebro v2 emite el formato. Feature flag controla visibilidad.)

- [ ] Tests: agregar test que verifica que `[texto](#cite=id)` se renderiza como botón con onClick.
- [ ] Commit: `feat(coach/ui): CitedMarkdown activa binding citation onClick`.

---

### Task 5.3: `/coach/layout.tsx` dark-fijo

```tsx
// src/app/coach/layout.tsx — añadir wrapper que fuerza dark
// (Pseudo-diff: envolver children en <div data-force-theme="dark" className="coach-dark-scope">...</div>
// + un className en globals.css que define :where([data-force-theme="dark"]) usando los mismos tokens dark globales.)
```

Documentar excepción en `src/app/coach/layout.tsx` con comentario:

```tsx
/**
 * /coach es dark-fijo por decisión de spec v2 §5 + §13 open question 4.
 * Excepción al sistema tri-state Auto/Light/Dark del proyecto, igual que /dashboard.
 * Razón: la surface de coach es "modo trabajo" — contraste alto, foco en datos.
 */
```

- [ ] Tests: canary que verifica `data-force-theme="dark"` está presente en el layout.
- [ ] Commit: `feat(coach/layout): force dark-fijo en /coach (excepción documentada)`.

---

### ~~Task 5.4: `/coach/page.tsx` rewrite~~ — CEDIDO al paralelo

**Decisión 2026-05-11:** `/coach/page.tsx` lo reescribe completo el plan paralelo `2026-05-11-taiger-coach-home-redesign.md` Task 14. Este task queda cancelado en mi plan.

**Coordinación:** si la chat lane necesita un helper como `usePlanContext` que el paralelo no implementó, lo agregamos como hook compartido (`src/hooks/usePlanContext.ts` ya creado en mi Task 5.1) y el paralelo puede consumirlo (lo dejamos como upgrade opcional).

(Refactor del page existente. Usar `usePlanContext`. Lógica de switch entre 3 surfaces.)

```tsx
// Pseudo-diff de /coach/page.tsx:
'use client';
import { useRouter } from 'next/navigation';
import { usePlanContext } from '@/hooks/usePlanContext';
import { TodayCard } from '@/components/coach/TodayCard';
import { PlanCompletedCard } from '@/components/coach/PlanCompletedCard';
import { TaigerHero } from '@/components/coach/TaigerHero';
import { derivePracticeAction } from '@/lib/coach/practice-suggestions';

export default function CoachPage() {
  const router = useRouter();
  const { activePlan, completedRecently, latestOutcome, loading } = usePlanContext();

  if (loading) return <CoachSkeleton />;

  if (activePlan) {
    const practice = derivePracticeAction(activePlan);
    const dayCurrent = computeDayCurrent(activePlan);
    return (
      <main className="coach-page">
        <TodayCard data={{
          date_label: formatDateLabel(new Date()),
          action_headline: practice.headline,
          action_subtitle: practice.subtitle,
          plan_id: activePlan.id,
          plan_title: activePlan.hypothesis ?? 'Plan en curso',
          day_current: dayCurrent,
          duration_days: activePlan.duration_days ?? 21,
          actual_value: latestOutcome?.actual_value ?? null,
          target_value: activePlan.target_value,
          baseline_value: activePlan.baseline_value,
          delta_strokes: latestOutcome?.delta_vs_target ?? null,
        }} onStart={(planId) => router.push(`/coach/sesion/nueva?context=daily_practice&plan=${planId}`)} />
        {/* resto: tAIger+ chat shortcut + patrones */}
      </main>
    );
  }

  if (completedRecently) {
    return <PlanCompletedCard plan={completedRecently} onRequestNext={() => router.push(`/coach/sesion/nueva?context=request_new_plan`)} />;
  }

  return <TaigerHero />;
}
```

- [ ] Helpers: `formatDateLabel`, `computeDayCurrent` en `src/lib/coach/today-card-derivation.ts` con tests.
- [ ] Tests page: render con/sin activePlan/completedRecently.
- [ ] Commit: `feat(coach/page): /coach selecciona surface por estado del plan`.

---

### Task 5.5: `/coach/sesion/[id]/page.tsx` — split en 4 sub-commits

**El task más grande.** Lo divido en 4 commits separados para mantener atomicidad. Cada uno con sus tests.

**5.5a — Plan-aware header + drawer wiring**
- Reemplazar header genérico por `<PlanAwareChatHeader />`.
- Estado `drawerOpen` + render condicional de `<PlanDetailDrawer />`.
- Fetch outcomes para drawer desde nuevo endpoint o `usePlanContext`.
- Commit: `feat(coach/sesion): plan-aware header + detail drawer wiring`.

**5.5b — SSE handler extension**
- Extender el parser SSE existente con event types `drill_card`, `quick_replies`, `tool_start`, `tool_done`.
- Estados nuevos: `drillsByMsgIdx`, `quickRepliesByMsgIdx`, `toolsByMsgIdx`.
- Commit: `feat(coach/sesion): SSE parser handles drill_card/quick_replies/tool_use events`.

**5.5c — Inline render: ToolUseChip + DrillCard + QuickReplies**
- En el map de mensajes, render condicional de los 3 componentes según los estados de 5.5b.
- Behind feature flag `taigerCoachPremium`.
- Commit: `feat(coach/sesion): render inline drill cards + quick replies + tool chips (feature flag)`.

**5.5d — Composer + button + VoiceInputButton**
- Wrap input en form con botón `+` izquierdo (Apple Messages pattern).
- Mount `<VoiceInputButton />` al lado.
- "+" abre modal placeholder "Próximamente".
- Voice button inyecta texto al input.
- Commit: `feat(coach/sesion): composer + button + voice input (Web Speech API)`.

Por cada sub-commit:
- [ ] Test E2E ligero que verifica que el commit no rompe el flujo principal del chat.
- [ ] `npm run test` después de cada commit antes de pasar al siguiente.

---

## Phase 6 — Feature flag wiring (1 task)

### Task 6.1: Feature flag `taigerCoachPremium`

**Files:**
- Create o modify: `src/lib/feature-flags.ts`
- Modify: `src/app/coach/sesion/[id]/page.tsx` para gate los renders Tier 1.

```ts
// src/lib/feature-flags.ts
export const featureFlags = {
  taigerCoachPremium: process.env.NEXT_PUBLIC_TAIGER_COACH_PREMIUM === 'true',
};

// uso en componente:
import { featureFlags } from '@/lib/feature-flags';
{featureFlags.taigerCoachPremium && drillsByMsgIdx[idx] && <DrillCard ... />}
```

- [ ] Tests: render con flag on/off.
- [ ] Documentar la env var en `.env.example`.
- [ ] Commit: `feat(coach/flags): taigerCoachPremium gate para renders Tier 1`.

---

## Phase 7 — Anti-regression canaries (1 task)

### Task 7.1: Extender `canary-stability.test.ts`

```ts
// Bloque nuevo en canary-stability.test.ts
describe('canary: tAIger+ plan + cumplimiento v2', () => {
  const fs = require('fs');
  const path = require('path');

  // TodayCard / PlanCompletedCard canaries removidos en v2.1 reconciliación —
  // ahora viven en el paralelo coach-home-redesign (PlanActiveCard).

  it('PlanAwareChatHeader.tsx existe', () => {
    const s = fs.readFileSync(path.join(process.cwd(), 'src/components/coach/PlanAwareChatHeader.tsx'), 'utf-8');
    expect(s).toMatch(/export function PlanAwareChatHeader/);
  });

  it('practice-suggestions.ts cubre los 5 patterns MVP', () => {
    const s = fs.readFileSync(path.join(process.cwd(), 'src/lib/coach/practice-suggestions.ts'), 'utf-8');
    for (const p of ['approach_100_150', 'putts_1_2m', 'post_bogey_spiral', 'driving_dispersion', 'putts_from_3m']) {
      expect(s).toContain(`'${p}'`);
    }
  });

  it('rutas API force-dynamic', () => {
    const routes = [
      'src/app/api/taiger/plans/active/route.ts',
      'src/app/api/taiger/practice/[planId]/log/route.ts',
      'src/app/api/taiger/check-in/route.ts',
    ];
    for (const r of routes) {
      const s = fs.readFileSync(path.join(process.cwd(), r), 'utf-8');
      expect(s, `${r} debe ser force-dynamic`).toMatch(/export const dynamic = 'force-dynamic'/);
    }
  });

  it('/coach/layout.tsx es dark-fijo', () => {
    const s = fs.readFileSync(path.join(process.cwd(), 'src/app/coach/layout.tsx'), 'utf-8');
    expect(s).toMatch(/data-force-theme="dark"|coach-dark-scope/);
  });

  it('feature flag taigerCoachPremium existe', () => {
    const s = fs.readFileSync(path.join(process.cwd(), 'src/lib/feature-flags.ts'), 'utf-8');
    expect(s).toMatch(/taigerCoachPremium/);
  });
});
```

- [ ] Commit: `test(canary): anti-regresion sub-proyecto A v2`.

---

## Phase 8 — Final pass (1 task)

### Task 8.1: TS check + tests + build + smoke + docs + push

- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run test` — 1512+25 pasando.
- [ ] `npm run build` — clean.
- [ ] Smoke test manual: `/coach` con plan activo, plan completed, sin plan.
- [ ] Entry en `docs/SPRINT_LOG.md` (arriba del archivo).
- [ ] `node scripts/update-docs.js`.
- [ ] Commit docs.
- [ ] Skill `/pre-push`.
- [ ] `git push origin main` (solo si pre-push verde).
- [ ] Verificar deploy Vercel.
- [ ] Marcar plan completo (`- [ ]` → `- [x]`) y commit final.

---

## Self-review v2

**Spec coverage (v2.1 reconciliado):** cada vista del spec v2.1 tiene tasks.

| Spec § | Tasks |
|---|---|
| Vista 1 home (CEDIDA) | paralelo Tasks 1-14 |
| Vista 2 PlanAwareChatHeader | 4.2, 5.5a |
| Vista 2 ToolUseChip | 3.2, 5.5b, 5.5c, 6.1 |
| Vista 2 Citation chips | 5.2 (chat lane lo activa; paralelo no toca CitedMarkdown) |
| Vista 2 DrillCard | 3.3, 5.5b, 5.5c, 6.1 |
| Vista 2 QuickReplies | 3.1, 5.5b, 5.5c, 6.1 |
| Vista 2 Composer + Voice | 3.4, 5.5d |
| Vista 3 PlanDetailDrawer | 4.3, 5.5a |
| Vista 4 Check-in flow | 2.3 |
| Vista 5 Lifecycle UI | badge en PlanAwareChatHeader (Task 4.2) cuando status=resolved/expired |
| §11 Voice tier 2 | 3.4, 5.5d |
| §10 Feature flag | 6.1 |
| §12 Acceptance 1-16 | 5.5 + 6.1 + 7.1 + APIs (2.1-2.3) |

**Placeholder scan:** code blocks completos. Excepción: Task 5.5 sub-commits dan pseudo-diff sobre archivo 706-líneas; el engineer ejecutor debe leer el archivo primero y matchear las inserciones — esto es práctica común para modificaciones grandes y es preferible a inventar line numbers.

**Type consistency:** `DrillCardData` en componente y SSE consumer (5.5b) tienen mismo shape. `PlanHeaderData` solo en PlanAwareChatHeader. Sin retroactive edits. (`TodayCardData` borrado en v2.1.)

**Scope (v2.1 reconciliado):** 10 tasks ejecutables (vs 12 en v2 standalone, vs 28 en v1). Tasks borrados por reconciliación: 4.1 (TodayCard), 5.4 (/coach/page rewrite). Task 4.2 simplificado (sin PlanCompletedCard). El paralelo agrega 18 tasks suyos sobre el home — total combinado ~28 tasks pero en lanes paralelas sin bloqueos.

**Risk acknowledgement:**
- Migration 040 sigue dependiente de copiar la lista pre-existente real (Task 0.1 step 1). Sin esto se rompe el constraint. Hay test explícito.
- `supabaseServerClient` es helper asumido existente en `@/lib/supabase`. Si tiene otro nombre, ajustar en Task 2.1 step 2.
- Feature flag OFF por default — sub-proyecto A entrega valor incluso sin Cerebro v2 listo (Today Card + header + drawer + voice).

---

**Plan v2 completo. Listo para ejecución.**
