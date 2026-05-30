# Paywall — Plan 1: Fundación (Entitlements + Estado de Suscripción + Gating)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la capa base que decide qué puede hacer cada usuario según su plan, sin cobrar ni tocar el coach todavía — y detrás de un flag apagado, para que construirla NO cambie producción.

**Architecture:** Catálogo de planes en config (fuente de verdad) → función pura `canAccess(tier, feature)` → data layer que lee la suscripción del usuario → hook `useEntitlement(feature)` → componente `<ProGate>`. Todo gateado por un flag global `PAYWALL_ENABLED`; con el flag apagado, `canAccess` devuelve `true` para todo (comportamiento actual intacto).

**Tech Stack:** Next.js 14, TypeScript, Supabase (Postgres + JS client), Vitest (pool `vmThreads`), React Testing Library.

> **Pre-requisito de ejecución:** NO ejecutar este plan hasta que el motor (cerebro v3 / anti-alucinación) esté estable, según la directiva CERO FALLOS y el spec `docs/superpowers/specs/2026-05-29-paywall-premium-design.md`. Este documento es la guía lista para ese momento.

---

## File Structure (Plan 1)

- `supabase/migrations/20260529_billing_subscription_columns.sql` — columnas de suscripción en `profiles`.
- `src/golf/billing/plans.ts` — catálogo de tiers + qué feature desbloquea cada uno (fuente de verdad de producto).
- `src/golf/billing/entitlements.ts` — función pura `canAccess(tier, feature)` + lectura del flag.
- `src/golf/billing/entitlements.test.ts` — tests de la matriz tier×feature + flag.
- `src/lib/data/billing/subscription.ts` — data layer: `getSubscription(supabase, userId)`.
- `src/lib/data/billing/subscription.test.ts` — test con cliente mockeado (patrón `src/lib/data/tournaments/groups.test.ts`).
- `src/hooks/useEntitlement.ts` — hook React que combina suscripción del usuario + `canAccess`.
- `src/hooks/useEntitlement.test.ts` — test del hook.
- `src/components/billing/ProGate.tsx` — wrapper que muestra children o fallback.
- `src/components/billing/ProGate.test.tsx` — test del componente.

Responsabilidad por archivo: una sola cosa. `plans.ts` = datos del catálogo. `entitlements.ts` = decisión pura (sin I/O). `subscription.ts` = I/O a Supabase. `useEntitlement.ts` = puente React. `ProGate.tsx` = render condicional.

---

## Task 1: Migración — columnas de suscripción en `profiles`

**Files:**
- Create: `supabase/migrations/20260529_billing_subscription_columns.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 20260529_billing_subscription_columns.sql
-- Columnas base de suscripción en profiles. Default = free/active:
-- todos los usuarios existentes quedan en el plan gratis sin cambio de comportamiento
-- (el gating real lo decide el flag PAYWALL_ENABLED en código).

DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'pro_plus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'trialing', 'past_due', 'paused', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier   subscription_tier   NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status subscription_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_rounds_remaining integer,
  ADD COLUMN IF NOT EXISTS trial_ends_at         timestamptz;

COMMENT ON COLUMN profiles.subscription_tier IS 'Plan del usuario. free = comportamiento actual.';
COMMENT ON COLUMN profiles.trial_rounds_remaining IS 'Rondas restantes del reverse trial (NULL = no en trial).';
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/20260529_billing_subscription_columns.sql`
Expected: ejecuta sin error; columnas creadas.

- [ ] **Step 3: Verificar columnas**

Run: `node --env-file=.env.local scripts/run-sql.mjs -e "select column_name from information_schema.columns where table_name='profiles' and column_name like 'subscription%' or column_name like 'trial%';"`
Expected: lista `subscription_tier`, `subscription_status`, `trial_rounds_remaining`, `trial_ends_at`.
(Si `run-sql.mjs` no soporta `-e`, crear un archivo `.sql` temporal con el `select` y pasarlo como argumento.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260529_billing_subscription_columns.sql
git commit -m "feat(billing): columnas de suscripción en profiles (default free)"
```

---

## Task 2: Catálogo de planes (`plans.ts`)

**Files:**
- Create: `src/golf/billing/plans.ts`
- Test: cubierto indirectamente por Task 3 (es data estática); test de forma incluido abajo.
- Test: `src/golf/billing/plans.test.ts`

- [ ] **Step 1: Escribir el test de forma del catálogo**

```typescript
// src/golf/billing/plans.test.ts
import { describe, it, expect } from 'vitest'
import { TIERS, TIER_RANK, FEATURE_MIN_TIER, type Feature, type Tier } from './plans'

describe('catálogo de planes', () => {
  it('define los 3 tiers en orden ascendente de rango', () => {
    expect(TIERS).toEqual(['free', 'pro', 'pro_plus'])
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.pro)
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.pro_plus)
  })

  it('cada feature mapea a un tier mínimo válido', () => {
    const tiers: Tier[] = ['free', 'pro', 'pro_plus']
    for (const f of Object.keys(FEATURE_MIN_TIER) as Feature[]) {
      expect(tiers).toContain(FEATURE_MIN_TIER[f])
    }
  })

  it('el diagnóstico del coach es gratis (free) y la proyección es pro_plus', () => {
    expect(FEATURE_MIN_TIER['coach-diagnosis']).toBe('free')
    expect(FEATURE_MIN_TIER['season-projection']).toBe('pro_plus')
    expect(FEATURE_MIN_TIER['coach-plan']).toBe('pro')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- src/golf/billing/plans.test.ts`
Expected: FAIL — `Cannot find module './plans'`.

- [ ] **Step 3: Implementar el catálogo**

```typescript
// src/golf/billing/plans.ts
// Fuente de verdad del catálogo de planes. Mapea cada feature gateable al
// tier mínimo que la desbloquea. Precios viven aparte (Plan 4, config con flag).

export const TIERS = ['free', 'pro', 'pro_plus'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  pro_plus: 2,
}

// Claves de feature gateable. Coinciden con el modelo de gating del spec (§8).
export type Feature =
  | 'coach-diagnosis'    // saber QUÉ mejorar — gratis para todos
  | 'coach-plan'         // el plan de mejora (el CÓMO) — Pro
  | 'coach-tracking'     // seguimiento ronda a ronda — Pro
  | 'history-full'       // historial/stats completos — Pro
  | 'season-projection'  // proyección de hándicap / meta de temporada — Pro+
  | 'comparisons'        // vs tu mejor versión / golfistas similares — Pro+

export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  'coach-diagnosis': 'free',
  'coach-plan': 'pro',
  'coach-tracking': 'pro',
  'history-full': 'pro',
  'season-projection': 'pro_plus',
  'comparisons': 'pro_plus',
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- src/golf/billing/plans.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/billing/plans.ts src/golf/billing/plans.test.ts
git commit -m "feat(billing): catálogo de planes y mapa feature→tier mínimo"
```

---

## Task 3: Función pura de entitlements (`entitlements.ts`) + flag

**Files:**
- Create: `src/golf/billing/entitlements.ts`
- Test: `src/golf/billing/entitlements.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/golf/billing/entitlements.test.ts
import { describe, it, expect } from 'vitest'
import { canAccess } from './entitlements'

describe('canAccess (flag ON)', () => {
  const FLAG_ON = true
  it('free accede al diagnóstico pero no al plan', () => {
    expect(canAccess('free', 'coach-diagnosis', FLAG_ON)).toBe(true)
    expect(canAccess('free', 'coach-plan', FLAG_ON)).toBe(false)
    expect(canAccess('free', 'season-projection', FLAG_ON)).toBe(false)
  })
  it('pro accede al plan y tracking pero no a la proyección de temporada', () => {
    expect(canAccess('pro', 'coach-plan', FLAG_ON)).toBe(true)
    expect(canAccess('pro', 'coach-tracking', FLAG_ON)).toBe(true)
    expect(canAccess('pro', 'season-projection', FLAG_ON)).toBe(false)
  })
  it('pro_plus accede a todo', () => {
    expect(canAccess('pro_plus', 'season-projection', FLAG_ON)).toBe(true)
    expect(canAccess('pro_plus', 'comparisons', FLAG_ON)).toBe(true)
    expect(canAccess('pro_plus', 'coach-diagnosis', FLAG_ON)).toBe(true)
  })
})

describe('canAccess (flag OFF = paywall apagado)', () => {
  it('con el flag apagado, cualquier tier accede a todo (comportamiento actual)', () => {
    expect(canAccess('free', 'season-projection', false)).toBe(true)
    expect(canAccess('free', 'coach-plan', false)).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- src/golf/billing/entitlements.test.ts`
Expected: FAIL — `Cannot find module './entitlements'`.

- [ ] **Step 3: Implementar**

```typescript
// src/golf/billing/entitlements.ts
// Decisión PURA de acceso (sin I/O). El flag se inyecta por parámetro para
// que la función sea trivialmente testeable; el caller lee el flag real.
import { TIER_RANK, FEATURE_MIN_TIER, type Tier, type Feature } from './plans'

/**
 * ¿El usuario con este tier puede acceder a esta feature?
 * @param paywallEnabled si es false, el paywall está apagado → todo permitido.
 */
export function canAccess(tier: Tier, feature: Feature, paywallEnabled: boolean): boolean {
  if (!paywallEnabled) return true
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

/** Lee el flag global del paywall desde env. Off por default (seguro). */
export function isPaywallEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYWALL_ENABLED === 'true'
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- src/golf/billing/entitlements.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/billing/entitlements.ts src/golf/billing/entitlements.test.ts
git commit -m "feat(billing): canAccess puro + flag PAYWALL_ENABLED (off por default)"
```

---

## Task 4: Data layer — leer la suscripción del usuario

**Files:**
- Create: `src/lib/data/billing/subscription.ts`
- Test: `src/lib/data/billing/subscription.test.ts`

Sigue el patrón de `src/lib/data/tournaments/groups.ts`: función que recibe el cliente `supabase` por parámetro.

- [ ] **Step 1: Escribir el test (cliente mockeado)**

```typescript
// src/lib/data/billing/subscription.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSubscription } from './subscription'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof getSubscription>[0]
beforeEach(() => { mockFrom.mockReset() })

describe('getSubscription', () => {
  it('lee tier y status del profile del usuario', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({
      data: { subscription_tier: 'pro', subscription_status: 'active', trial_rounds_remaining: null, trial_ends_at: null },
      error: null,
    })
    mockFrom.mockReturnValue({ select, eq, single })

    const out = await getSubscription(mockSupabase, 'user-1')

    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(out).toEqual({ tier: 'pro', status: 'active', trialRoundsRemaining: null, trialEndsAt: null })
  })

  it('si no hay fila o hay error, devuelve free/active (fallback seguro)', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } })
    mockFrom.mockReturnValue({ select, eq, single })

    const out = await getSubscription(mockSupabase, 'user-x')
    expect(out).toEqual({ tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null })
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- src/lib/data/billing/subscription.test.ts`
Expected: FAIL — `Cannot find module './subscription'`.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/data/billing/subscription.ts
// Capa de acceso a la suscripción del usuario. Patrón: recibe el cliente por parámetro.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tier } from '@/golf/billing/plans'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'

export interface Subscription {
  tier: Tier
  status: SubscriptionStatus
  trialRoundsRemaining: number | null
  trialEndsAt: string | null
}

const FREE_FALLBACK: Subscription = {
  tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null,
}

export async function getSubscription(supabase: SupabaseClient, userId: string): Promise<Subscription> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier, subscription_status, trial_rounds_remaining, trial_ends_at')
    .eq('id', userId)
    .single()

  if (error || !data) return FREE_FALLBACK

  return {
    tier: data.subscription_tier as Tier,
    status: data.subscription_status as SubscriptionStatus,
    trialRoundsRemaining: data.trial_rounds_remaining ?? null,
    trialEndsAt: data.trial_ends_at ?? null,
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- src/lib/data/billing/subscription.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/billing/subscription.ts src/lib/data/billing/subscription.test.ts
git commit -m "feat(billing): data layer getSubscription con fallback free seguro"
```

---

## Task 5: Hook `useEntitlement`

**Files:**
- Create: `src/hooks/useEntitlement.ts`
- Test: `src/hooks/useEntitlement.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
// src/hooks/useEntitlement.test.ts
import { describe, it, expect } from 'vitest'
import { resolveEntitlement } from './useEntitlement'

// resolveEntitlement es la lógica pura del hook (sin React), para testear la decisión.
describe('resolveEntitlement', () => {
  it('loading mientras no hay suscripción cargada', () => {
    expect(resolveEntitlement(null, 'coach-plan', true)).toEqual({ allowed: false, loading: true, tier: null })
  })
  it('con suscripción pro y flag on, permite coach-plan', () => {
    const sub = { tier: 'pro' as const, status: 'active' as const, trialRoundsRemaining: null, trialEndsAt: null }
    expect(resolveEntitlement(sub, 'coach-plan', true)).toEqual({ allowed: true, loading: false, tier: 'pro' })
  })
  it('trialing con tier pro_plus permite la proyección', () => {
    const sub = { tier: 'pro_plus' as const, status: 'trialing' as const, trialRoundsRemaining: 2, trialEndsAt: null }
    expect(resolveEntitlement(sub, 'season-projection', true)).toEqual({ allowed: true, loading: false, tier: 'pro_plus' })
  })
  it('flag off permite todo aunque sea free', () => {
    const sub = { tier: 'free' as const, status: 'active' as const, trialRoundsRemaining: null, trialEndsAt: null }
    expect(resolveEntitlement(sub, 'season-projection', false)).toEqual({ allowed: true, loading: false, tier: 'free' })
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- src/hooks/useEntitlement.test.ts`
Expected: FAIL — `Cannot find module './useEntitlement'`.

- [ ] **Step 3: Implementar (lógica pura + hook React)**

```typescript
// src/hooks/useEntitlement.ts
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getSubscription, type Subscription } from '@/lib/data/billing/subscription'
import { canAccess, isPaywallEnabled } from '@/golf/billing/entitlements'
import type { Feature, Tier } from '@/golf/billing/plans'

export interface EntitlementResult {
  allowed: boolean
  loading: boolean
  tier: Tier | null
}

/** Lógica pura del hook (testeable sin React). */
export function resolveEntitlement(
  sub: Subscription | null,
  feature: Feature,
  paywallEnabled: boolean,
): EntitlementResult {
  if (sub === null) return { allowed: false, loading: true, tier: null }
  return { allowed: canAccess(sub.tier, feature, paywallEnabled), loading: false, tier: sub.tier }
}

/** Hook React: carga la suscripción del usuario actual y resuelve la feature. */
export function useEntitlement(feature: Feature): EntitlementResult {
  const [sub, setSub] = useState<Subscription | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (active) setSub({ tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null }); return }
      const s = await getSubscription(supabase, user.id)
      if (active) setSub(s)
    })()
    return () => { active = false }
  }, [])

  return resolveEntitlement(sub, feature, isPaywallEnabled())
}
```

> Nota de integración: confirmar el nombre real del helper de cliente en `src/lib/supabase.ts` (¿`createClient`? ¿`getSupabaseBrowserClient`?) y ajustar el import. Es archivo protegido — solo se importa, no se modifica.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- src/hooks/useEntitlement.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEntitlement.ts src/hooks/useEntitlement.test.ts
git commit -m "feat(billing): hook useEntitlement + lógica pura resolveEntitlement"
```

---

## Task 6: Componente `<ProGate>`

**Files:**
- Create: `src/components/billing/ProGate.tsx`
- Test: `src/components/billing/ProGate.test.tsx`

- [ ] **Step 1: Escribir el test**

```tsx
// src/components/billing/ProGate.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProGate } from './ProGate'

vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: vi.fn(),
}))
import { useEntitlement } from '@/hooks/useEntitlement'

describe('ProGate', () => {
  it('muestra children cuando allowed=true', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: true, loading: false, tier: 'pro' })
    render(<ProGate feature="coach-plan" fallback={<div>UPSELL</div>}><div>CONTENIDO PRO</div></ProGate>)
    expect(screen.getByText('CONTENIDO PRO')).toBeTruthy()
    expect(screen.queryByText('UPSELL')).toBeNull()
  })

  it('muestra fallback cuando allowed=false', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: false, tier: 'free' })
    render(<ProGate feature="coach-plan" fallback={<div>UPSELL</div>}><div>CONTENIDO PRO</div></ProGate>)
    expect(screen.getByText('UPSELL')).toBeTruthy()
    expect(screen.queryByText('CONTENIDO PRO')).toBeNull()
  })

  it('no muestra nada mientras loading', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: true, tier: null })
    const { container } = render(<ProGate feature="coach-plan" fallback={<div>UPSELL</div>}><div>CONTENIDO PRO</div></ProGate>)
    expect(container.textContent).toBe('')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- src/components/billing/ProGate.test.tsx`
Expected: FAIL — `Cannot find module './ProGate'`.

- [ ] **Step 3: Implementar**

```tsx
// src/components/billing/ProGate.tsx
'use client'
import { type ReactNode } from 'react'
import { useEntitlement } from '@/hooks/useEntitlement'
import type { Feature } from '@/golf/billing/plans'

interface ProGateProps {
  feature: Feature
  fallback: ReactNode
  children: ReactNode
}

/** Envuelve contenido premium: muestra children si el usuario tiene acceso, si no el fallback. */
export function ProGate({ feature, fallback, children }: ProGateProps) {
  const { allowed, loading } = useEntitlement(feature)
  if (loading) return null
  return <>{allowed ? children : fallback}</>
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- src/components/billing/ProGate.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/billing/ProGate.tsx src/components/billing/ProGate.test.tsx
git commit -m "feat(billing): componente ProGate (children vs fallback por entitlement)"
```

---

## Task 7: Verificación integral del Plan 1

- [ ] **Step 1: tsc + tests + build**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: 0 errores TS, todos los tests verdes (incluye canarios), build exitoso.

- [ ] **Step 2: Confirmar que el flag apagado no cambia nada**

Verificar que `NEXT_PUBLIC_PAYWALL_ENABLED` no está seteado (o es `false`) en `.env.local` y en Vercel → con flag off, `canAccess` devuelve `true` siempre → producción intacta.

- [ ] **Step 3: Commit final si quedó algo suelto**

```bash
git status   # debe estar limpio
```

---

## Self-Review (Plan 1)

- **Cobertura de spec:** Plan 1 cubre §8 (modelo de gating: features→tier) y la base de §11 (capa de entitlements, `useEntitlement`, `<ProGate>`, columnas de suscripción). El resto del spec se cubre en los planes 2-6.
- **Placeholders:** ninguno — todo el código está escrito. Único punto a confirmar en ejecución: nombre del helper en `src/lib/supabase.ts` (Task 5, nota).
- **Consistencia de tipos:** `Tier`/`Feature` se definen en `plans.ts` y se reusan en `entitlements.ts`, `subscription.ts`, `useEntitlement.ts`, `ProGate.tsx`. `canAccess(tier, feature, paywallEnabled)` tiene la misma firma en definición (Task 3) y usos (Tasks 5). `getSubscription(supabase, userId)` consistente entre Task 4 y Task 5.

---

# Roadmap de planes 2-6 (a detallar al acercarse la ejecución)

> Se detallan en su propio `docs/superpowers/plans/` cuando toque construirlos. No se escriben en TDD completo ahora para **evitar staleness** contra un codebase en movimiento (cerebro v3 está cambiando archivos). Acá queda el scope y las dependencias.

**Plan 2 — Reverse trial por rondas.** Depende de Plan 1.
- Estado `trialing` + decremento de `trial_rounds_remaining` en el evento "ronda finalizada".
- Caída a `free` al llegar a 0 o pasar `trial_ends_at` (tope 30 días).
- Anti-abuso: un trial por identidad verificada (teléfono/email).
- Gatillo post-trial con datos reales del trial.

**Plan 3 — Sistema de códigos de descuento.** Depende de Plan 1.
- Tablas `discount_codes` + `code_redemptions` (modelo del spec §6).
- Validación server-side (ventana + usos + unicidad + scope).
- Admin UI en `admin/golf-ops` para generar/gestionar (F&F, club con `partner_club_id`, promos).

**Plan 4 — Pasarela de pago chilena + legal.** Depende de Plan 1. El más riesgoso/externo.
- Integración Flow o Mercado Pago (decisión a cerrar) con suscripción recurrente.
- Webhooks → `billing_events` (idempotencia), estados `active`/`past_due`/`paused`/`canceled`.
- Boleta electrónica (SII), IVA 19% incluido, política reembolso/retracto (extender `/reembolsos`).
- Dunning: reintentos + período de gracia. Founding-member price-lock + grandfathering.

**Plan 5 — Paywall UI / experiencia wow.** Depende de 1-4 + `design-shotgun`.
- Gatillo contextual post-diagnóstico ("mostrar el plan, no prometerlo").
- Pantalla de gestión (ver plan, cambiar, cancelar, restaurar, aplicar código, medio de pago).
- Número de futuro, una-promesa-un-número por tier, prueba social, CTA "Activar mi plan", capa de confianza.

**Plan 6 — Cold-start + cost-to-serve + instrumentación.** Cross-cutting.
- Puente al primer wow (import OCR/WHS, semilla con scores de torneo, quiz, umbral honesto sin alucinar).
- Medición de COGS por sesión de coach + margen por tier + fair-use.
- Eventos PostHog del embudo (§12) + tablero de KPIs.

**Secuencia recomendada de construcción:** 1 → (2 ∥ 3) → 4 → 6 → 5. (5 al final porque depende del resto y del diseño visual.)
