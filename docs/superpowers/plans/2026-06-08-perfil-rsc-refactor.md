# Refactor /perfil a Server Component — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Convertir `src/app/perfil/page.tsx` (802 LOC, `'use client'`) en un Server Component que fetchea todo server-side + un orquestador client (`PerfilView`) que recibe los datos como props, eliminando el waterfall client-side y el `fetch('/api/cpi')` que re-autentica. De paso lleva el archivo SUCIO al estándar (hooks/componentes/capa de datos).

**Architecture:** `page.tsx` (server) hace auth con `getPageUser`, fetchea perfil + conteo de torneos + CPI en paralelo vía `src/lib/data/perfil.ts` (el CPI se calcula server-side llamando `calcularCPI` directo, sin HTTP), y pasa todo como props a `<PerfilView>` (client orchestrator). `PerfilView` posee el estado mutable (`profile`, `editing`, fedegolf, delete) y compone sub-componentes presentacionales + 2 hooks. La interactividad (editar, sync FedeGolf, borrar cuenta, breakdown modal, ExperiencePanel) se preserva 1:1.

**Tech Stack:** Next.js 14 App Router (RSC + client islands), TypeScript, Supabase SSR (`@/utils/supabase/server` + `@/lib/auth/getPageUser`), Vitest.

**Por qué `PerfilView` es un client orchestrator único (no varios islands sueltos):** la interactividad está *intercalada* en el layout (el botón "+ Agregar índice" del header abre el form de la sección Cuenta; `handleSave` y el refresh FedeGolf mutan `profile`, que leen el header y las cards). Esos fragmentos NO son contiguos en el DOM y comparten estado, así que un único orquestador client con los datos iniciales por props es lo correcto. El **perf win** viene de que el server fetchea todo antes de renderizar: `PerfilView` pinta con datos al instante, sin `useEffect` de carga ni spinner ni `/api/cpi`.

**Fuera de alcance (no tocar):** `src/components/ExperienceSetup` (`ExperiencePanel`), `IndiceBreakdownModal`, `InstallAppCard`, `LevelsBar`, `Avatar`, `Button` — se reusan tal cual. `/api/cpi` queda (lo usa solo /perfil hoy, pero no se borra en este PR para no ampliar superficie; se deja como follow-up).

---

## File Structure

**Nuevos:**
- `src/lib/data/perfil.ts` — capa de datos: `fetchProfile`, `countTournaments`, `fetchCpi`. (queries Supabase server-side)
- `src/lib/data/perfil.test.ts` — tests de shaping de la capa de datos.
- `src/app/perfil/perfilFormat.ts` — helpers puros: `getCpiColor`, `getCpiLabel`, `getPlayerTier`. Mueve la lógica de presentación pura fuera del componente.
- `src/app/perfil/perfilFormat.test.ts` — tests de los helpers puros (umbrales).
- `src/app/perfil/components/PerfilView.tsx` — orquestador client (estado + composición).
- `src/app/perfil/components/ProfileHeaderCard.tsx` — header (avatar, nombre, tier, índice/"agregar", torneos).
- `src/app/perfil/components/DualIndexCards.tsx` — cards Federación + Golfers+ (incluye botón refresh FedeGolf).
- `src/app/perfil/components/CpiCard.tsx` — sección CPI (3 estados: ok / insufficient_data / momentum_paused).
- `src/app/perfil/components/AccountSection.tsx` — sección Cuenta (form editar nombre+índice / vista nombre+email).
- `src/app/perfil/components/DeleteAccountModal.tsx` — link "Eliminar mi cuenta" + modal de confirmación 2 pasos.
- `src/app/perfil/components/EditorialBlocks.tsx` — bloques presentacionales estáticos (gap note, nivel badge, "Trae tu historial"). Server-safe.
- `src/app/perfil/hooks/useProfileEdit.ts` — estado/lógica de editar+guardar perfil.
- `src/app/perfil/hooks/useFedegolfRefresh.ts` — estado/lógica del refresh FedeGolf.

**Modificados:**
- `src/app/perfil/page.tsx` — reescrito como Server Component (~45 LOC).

**Tipos compartidos:** `Profile` y `PROFILE_COLS` se definen en `src/lib/data/perfil.ts`. Para el CPI se reusa el tipo canónico **`ResultadoCPI`** de `@/golf/stats/cpi` (NO se inventa un `CpiData` nuevo).

> ⚠️ **CORRECCIÓN del eng-review (P0, 08-jun):** la versión inicial del plan inventó un `CpiData` con campos `roundsInWindow/roundsTotal/deltaForma` y status `'ok'/'momentum_paused'` que `calcularCPI` **NO devuelve**. Verificado en `src/golf/stats/cpi.ts:86-224`: el retorno real (`ResultadoCPI`) es `{ score, trend, status: 'insufficient_data'|'provisional'|'established', rondas_usadas, breakdown, diferenciales }`. Por eso el `/perfil` actual (que gatea la card con `status === 'ok'`) **nunca muestra el score CPI** a usuarios con 3+ rondas — bug en prod. **Decisión de Juanjo (08-jun): arreglarlo** — `provisional`/`established` → card del score; `insufficient_data` → "Activa tu CPI". Se borran las ramas muertas `'ok'`/`'momentum_paused'`.

---

### Interfaces canónicas (definidas una vez, usadas en todo el plan)

En `src/lib/data/perfil.ts`:

```typescript
import type { ResultadoCPI } from '@/golf/stats/cpi'

export interface Profile {
  id: string
  name: string
  indice: number | null
  avatar_url: string | null
  indice_golfers: number | null
  indice_golfers_updated_at: string | null
  nivel: number | null
  nivel_updated_at: string | null
  nivel_expires_at: string | null
}

// Lista de columnas del perfil — fuente ÚNICA. La importan los hooks que
// re-fetchean el profile (evita que dos copias de la lista se desincronicen).
export const PROFILE_COLS =
  'id, name, indice, avatar_url, indice_golfers, indice_golfers_updated_at, nivel, nivel_updated_at, nivel_expires_at'

// El CPI usa el tipo canónico ResultadoCPI de @/golf/stats/cpi (score, trend,
// status: 'insufficient_data'|'provisional'|'established', rondas_usadas, ...).
// NO se define un tipo nuevo.
export type { ResultadoCPI }
```

---

## Task 1: Capa de datos `src/lib/data/perfil.ts`

**Files:**
- Create: `src/lib/data/perfil.ts`
- Test: `src/lib/data/perfil.test.ts`
- Reference: `src/app/api/cpi/route.ts` (lógica CPI a portar), `src/lib/data/dashboard.ts` (patrón de la capa)

- [ ] **Step 1.1: Confirmar el retorno de `calcularCPI` (ya verificado en el eng-review)**

`ResultadoCPI` (src/golf/stats/cpi.ts:86-99): `{ score: number; trend: number; status: 'insufficient_data' | 'provisional' | 'established'; rondas_usadas: number; breakdown {...}; diferenciales[] }`. Parámetro: array de `{ played_at, total_gross, course_rating, slope_rating, holes_played }`. Se reusa este tipo; no se crea uno nuevo.

- [ ] **Step 1.2: Escribir el test que falla**

```typescript
// src/lib/data/perfil.test.ts
import { describe, it, expect, vi } from 'vitest'
import { fetchProfile, countTournaments, fetchCpi } from './perfil'

// Helper: cliente Supabase mockeado con builder chainable.
function mockSupabase(handlers: Record<string, unknown>) {
  return handlers as never
}

describe('fetchProfile', () => {
  it('devuelve el profile del usuario', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'u1', name: 'Ana', indice: 12.3, avatar_url: null, indice_golfers: 10.1, indice_golfers_updated_at: null, nivel: null, nivel_updated_at: null, nivel_expires_at: null }, error: null }),
          }),
        }),
      }),
    }
    const p = await fetchProfile(mockSupabase(supabase), 'u1')
    expect(p?.name).toBe('Ana')
    expect(p?.indice).toBe(12.3)
  })

  it('devuelve null si no hay profile', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'no rows' } }) }) }) }) }
    const p = await fetchProfile(mockSupabase(supabase), 'u1')
    expect(p).toBeNull()
  })
})

describe('countTournaments', () => {
  it('devuelve el count', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: async () => ({ count: 7, error: null }) }) }) }
    const n = await countTournaments(mockSupabase(supabase), 'u1')
    expect(n).toBe(7)
  })

  it('devuelve 0 si count es null', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: async () => ({ count: null, error: null }) }) }) }
    expect(await countTournaments(mockSupabase(supabase), 'u1')).toBe(0)
  })
})

describe('fetchCpi', () => {
  it('mapea rondas y delega en calcularCPI (shape ResultadoCPI)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [{ played_at: '2026-01-01', total_gross: 85, course_rating: 72, slope_rating: 120, holes_played: 18 }], error: null }),
            }),
          }),
        }),
      }),
    }
    const cpi = await fetchCpi(mockSupabase(supabase), 'u1')
    expect(cpi).not.toBeNull()
    expect(typeof cpi?.score).toBe('number')
    expect(['insufficient_data', 'provisional', 'established']).toContain(cpi?.status)
    expect(typeof cpi?.rondas_usadas).toBe('number')
  })

  it('devuelve null si la query falla', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) }
    expect(await fetchCpi(mockSupabase(supabase), 'u1')).toBeNull()
  })
})
```

- [ ] **Step 1.3: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/data/perfil.test.ts`
Expected: FAIL — "Cannot find module './perfil'".

- [ ] **Step 1.4: Implementar `src/lib/data/perfil.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularCPI, type ResultadoCPI } from '@/golf/stats/cpi'

export interface Profile {
  id: string
  name: string
  indice: number | null
  avatar_url: string | null
  indice_golfers: number | null
  indice_golfers_updated_at: string | null
  nivel: number | null
  nivel_updated_at: string | null
  nivel_expires_at: string | null
}

// Fuente ÚNICA de la lista de columnas (la reusan los hooks client-side).
export const PROFILE_COLS =
  'id, name, indice, avatar_url, indice_golfers, indice_golfers_updated_at, nivel, nivel_updated_at, nivel_expires_at'

export type { ResultadoCPI }

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).single()
  if (error || !data) return null
  return data as Profile
}

export async function countTournaments(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase.from('players').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  return count ?? 0
}

// CPI calculado server-side: misma lógica que /api/cpi pero SIN round-trip HTTP
// ni re-auth. Lee las últimas 50 rondas y delega en calcularCPI (que convierte
// 9h→equiv-18h con holes_played). Retorna el ResultadoCPI canónico, o null si
// la query falla (la UI cae a "sin CPI" sin romper la página).
export async function fetchCpi(supabase: SupabaseClient, userId: string): Promise<ResultadoCPI | null> {
  const { data: rondas, error } = await supabase
    .from('historical_rounds')
    .select('played_at, total_gross, course_rating, slope_rating, holes_played')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(50)

  if (error) return null

  const rondasCPI = (rondas ?? []).map((r) => ({
    played_at: r.played_at,
    total_gross: r.total_gross,
    course_rating: r.course_rating ?? null,
    slope_rating: r.slope_rating ?? null,
    holes_played: (r as { holes_played?: number | null }).holes_played ?? null,
  }))

  return calcularCPI(rondasCPI)
}
```

> **Verificá** que el parámetro que espera `calcularCPI` matchea el shape de `rondasCPI` (mismos campos que hoy arma `/api/cpi/route.ts:32-38`). Si `calcularCPI` tipa su input más estricto, ajustá el `.map`.

- [ ] **Step 1.5: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/data/perfil.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/data/perfil.ts src/lib/data/perfil.test.ts
git commit -m "feat(perfil): capa de datos src/lib/data/perfil.ts (fetchProfile, countTournaments, fetchCpi server-side)"
```

---

## Task 2: Helpers puros `src/app/perfil/perfilFormat.ts`

**Files:**
- Create: `src/app/perfil/perfilFormat.ts`
- Test: `src/app/perfil/perfilFormat.test.ts`
- Source: `src/app/perfil/page.tsx:43-65` (las 3 funciones `getCpiColor`, `getCpiLabel`, `getPlayerTier` tal cual).

- [ ] **Step 2.1: Escribir el test que falla**

```typescript
// src/app/perfil/perfilFormat.test.ts
import { describe, it, expect } from 'vitest'
import { getCpiColor, getCpiLabel, getPlayerTier } from './perfilFormat'

describe('getCpiColor', () => {
  it('verde >=75', () => expect(getCpiColor(80)).toBe('#16a34a'))
  it('rojo <25', () => expect(getCpiColor(10)).toBe('#dc2626'))
})
describe('getCpiLabel', () => {
  it('Estable en 40-59', () => expect(getCpiLabel(50)).toBe('Estable'))
})
describe('getPlayerTier', () => {
  it('null → en construcción', () => expect(getPlayerTier(null)).toBe('Perfil en construcción'))
  it('<=5 → avanzado', () => expect(getPlayerTier(4)).toBe('Competidor avanzado'))
  it('>20 → activo', () => expect(getPlayerTier(25)).toBe('Jugador activo'))
})
```

- [ ] **Step 2.2: Correr (debe fallar)**

Run: `npx vitest run src/app/perfil/perfilFormat.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 2.3: Crear `perfilFormat.ts` moviendo las 3 funciones de `page.tsx:43-65` textualmente**

```typescript
export function getCpiColor(score: number): string {
  if (score >= 75) return '#16a34a'
  if (score >= 60) return '#c4992a'
  if (score >= 40) return '#94a8c0'
  if (score >= 25) return '#d97706'
  return '#dc2626'
}

export function getCpiLabel(score: number): string {
  if (score >= 75) return 'Forma excepcional'
  if (score >= 60) return 'En forma'
  if (score >= 40) return 'Estable'
  if (score >= 25) return 'Bajo su nivel'
  return 'Fuera de forma'
}

export function getPlayerTier(indice: number | null) {
  if (indice == null) return 'Perfil en construcción'
  if (indice <= 5) return 'Competidor avanzado'
  if (indice <= 12) return 'Competidor consistente'
  if (indice <= 20) return 'Amateur en progreso'
  return 'Jugador activo'
}
```

- [ ] **Step 2.4: Correr (debe pasar)**

Run: `npx vitest run src/app/perfil/perfilFormat.test.ts`
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/app/perfil/perfilFormat.ts src/app/perfil/perfilFormat.test.ts
git commit -m "refactor(perfil): extraer helpers puros (getCpiColor/Label/PlayerTier) con tests"
```

---

## Task 3: Hooks de interactividad

**Files:**
- Create: `src/app/perfil/hooks/useProfileEdit.ts`
- Create: `src/app/perfil/hooks/useFedegolfRefresh.ts`
- Source: `page.tsx` `handleSave` (121-141) y `handleFedegolfRefresh` (146-184).

> Estos hooks encapsulan la lógica que hoy vive inline. Reciben el `profile` actual y un setter `onProfile` para reflejar mutaciones (igual que hoy `setProfile`). Mueven el `supabase.from(...)` a llamadas directas (siguen siendo client-side porque son mutaciones disparadas por el usuario — aceptable: la regla apunta a lecturas en el render, no a mutaciones on-click). El `select` post-update reusa `PROFILE_COLS` no es accesible client-side, así que se inlinea la lista de columnas igual que hoy.

- [ ] **Step 3.1: `useProfileEdit.ts`**

```typescript
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/data/perfil'

export function useProfileEdit(profile: Profile, onProfile: (p: Profile) => void) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editName, setEditName] = useState(profile.name || '')
  const [editIndice, setEditIndice] = useState(profile.indice != null ? String(profile.indice) : '')

  const save = async () => {
    setSaving(true)
    const supabase = createClient()
    const indiceParsed = editIndice.trim() !== '' ? parseFloat(editIndice) : null
    const { data: updated } = await supabase
      .from('profiles')
      .update({ name: editName.trim(), indice: indiceParsed })
      .eq('id', profile.id)
      .select('id, name, indice, avatar_url')
      .single()
    if (updated) onProfile({ ...profile, ...(updated as Partial<Profile>) } as Profile)
    setSaving(false)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const cancel = () => {
    setEditing(false)
    setEditName(profile.name || '')
    setEditIndice(profile.indice != null ? String(profile.indice) : '')
  }

  return { editing, setEditing, saving, saved, editName, setEditName, editIndice, setEditIndice, save, cancel }
}
```

> **Nota:** el `update().select('id, name, indice, avatar_url')` solo trae 4 columnas; hacemos `{ ...profile, ...updated }` para no perder `indice_golfers`/`nivel`/etc del profile actual (mejora sutil sobre el original, que reemplazaba el objeto entero y perdía esos campos hasta el próximo load — anotar en el commit).

- [ ] **Step 3.2: `useFedegolfRefresh.ts`**

```typescript
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PROFILE_COLS, type Profile } from '@/lib/data/perfil'

type FedegolfMsg = { kind: 'ok' | 'warn' | 'error'; text: string } | null

export function useFedegolfRefresh(profile: Profile, onProfile: (p: Profile) => void) {
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState<FedegolfMsg>(null)

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setMsg(null)
    try {
      const res = await fetch('/api/fedegolf/sync-indice', { method: 'POST' })
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; indice?: number; cambio?: boolean; cached?: boolean; error?: string }
        | null
      if (res.status === 404 || body?.error === 'No hay cuenta FedeGolf vinculada') {
        setMsg({ kind: 'warn', text: 'Vinculá tu cuenta FedeGolf primero.' })
      } else if (!res.ok) {
        setMsg({ kind: 'error', text: body?.error || 'No se pudo actualizar. Intentá más tarde.' })
      } else if (body?.cached) {
        setMsg({ kind: 'warn', text: 'Ya está actualizado. Probá de nuevo en 4 horas.' })
      } else if (body?.cambio === false) {
        setMsg({ kind: 'ok', text: 'Tu índice no cambió.' })
      } else {
        setMsg({ kind: 'ok', text: `Índice actualizado: ${body?.indice?.toFixed(1) ?? '—'}` })
        const supabase = createClient()
        const { data: updated } = await supabase
          .from('profiles')
          .select(PROFILE_COLS)
          .eq('id', profile.id).single()
        if (updated) onProfile(updated as Profile)
      }
    } catch {
      setMsg({ kind: 'error', text: 'Error de red. Probá de nuevo.' })
    } finally {
      setRefreshing(false)
      setTimeout(() => setMsg(null), 6000)
    }
  }

  return { refreshing, msg, refresh }
}
```

> Cambio vs original: ya no hace `supabase.auth.getUser()` para conseguir el `user.id` — lo toma de `profile.id` (que viene del server). Un getUser menos.

- [ ] **Step 3.3: Test de regresión del merge en `useProfileEdit` (eng-review P1)**

> El original hacía `setProfile(updated)` con `updated` = solo 4 columnas → editar el nombre **borraba** `indice_golfers`/`nivel`/etc de la pantalla hasta recargar (bug real). El hook lo arregla con `{ ...profile, ...updated }`. Este test lo blinda. Requiere `@testing-library/react` (`renderHook` + `act`) — verificá que esté en devDeps (`grep '@testing-library/react' package.json`); el repo ya lo usa en otros tests de componentes.

```typescript
// src/app/perfil/hooks/useProfileEdit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProfileEdit } from './useProfileEdit'
import type { Profile } from '@/lib/data/perfil'

const baseProfile: Profile = {
  id: 'u1', name: 'Ana', indice: 12.3, avatar_url: null,
  indice_golfers: 10.1, indice_golfers_updated_at: '2026-01-01',
  nivel: 3, nivel_updated_at: null, nivel_expires_at: null,
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            // El update solo devuelve estas 4 columnas (como en prod).
            single: async () => ({ data: { id: 'u1', name: 'Ana María', indice: 11.0, avatar_url: null }, error: null }),
          }),
        }),
      }),
    }),
  }),
}))

describe('useProfileEdit', () => {
  it('al guardar, MERGEA (no reemplaza): conserva indice_golfers y nivel', async () => {
    const onProfile = vi.fn()
    const { result } = renderHook(() => useProfileEdit(baseProfile, onProfile))
    act(() => { result.current.setEditName('Ana María') })
    await act(async () => { await result.current.save() })
    const merged = onProfile.mock.calls[0][0] as Profile
    expect(merged.name).toBe('Ana María')         // viene del update
    expect(merged.indice).toBe(11.0)              // viene del update
    expect(merged.indice_golfers).toBe(10.1)      // CONSERVADO del profile previo
    expect(merged.nivel).toBe(3)                  // CONSERVADO del profile previo
  })
})
```

Run: `npx vitest run src/app/perfil/hooks/useProfileEdit.test.ts`
Expected: PASS (debe verde — confirma el merge).

- [ ] **Step 3.4: tsc parcial**

Run: `npx tsc --noEmit`
Expected: 0 errores (los hooks compilan; aún no se usan).

- [ ] **Step 3.5: Commit**

```bash
git add src/app/perfil/hooks/
git commit -m "refactor(perfil): hooks useProfileEdit + useFedegolfRefresh (1 getUser menos, merge de profile con test, PROFILE_COLS dedup)"
```

---

## Task 4: Componentes presentacionales

**Files (crear, mover JSX desde `page.tsx`):**
- `src/app/perfil/components/ProfileHeaderCard.tsx` ← JSX header `page.tsx:205-273`
- `src/app/perfil/components/DualIndexCards.tsx` ← JSX `page.tsx:276-389` (incluye botón FedeGolf)
- `src/app/perfil/components/CpiCard.tsx` ← JSX CPI `page.tsx:457-572` (3 estados)
- `src/app/perfil/components/AccountSection.tsx` ← JSX Cuenta `page.tsx:583-687`
- `src/app/perfil/components/DeleteAccountModal.tsx` ← JSX delete `page.tsx:723-799`
- `src/app/perfil/components/EditorialBlocks.tsx` ← gap note (405-438), nivel badge (441-454), "Trae tu historial" (690-720)

Cada componente lleva `'use client'` si recibe callbacks/estado; los puramente presentacionales (`CpiCard`, `EditorialBlocks`) pueden NO llevarlo pero como se renderizan dentro de `PerfilView` (client) da igual — por simplicidad, marcá `'use client'` solo en los que usan handlers.

**Props de cada componente (contrato exacto):**

- [ ] **Step 4.1: `ProfileHeaderCard.tsx`**

```typescript
'use client'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import type { Profile } from '@/lib/data/perfil'
import { getPlayerTier } from '../perfilFormat'

interface Props {
  profile: Profile
  tourneysPlayed: number
  onAddIndice: () => void   // setEditing(true) + scroll al form
}

export function ProfileHeaderCard({ profile, tourneysPlayed, onAddIndice }: Props) {
  const playerTier = getPlayerTier(profile.indice)
  // ... mover el JSX de page.tsx:205-273, reemplazando:
  //   onClick del botón "+ Agregar índice" → onAddIndice
  //   playerTier ya calculado arriba
  return (/* JSX header */)
}
```

> Mover el bloque `<div>` del header (la card con Avatar, badges, h1, índice/agregar, torneos). El `onClick` que hacía `setEditing(true); setTimeout(scrollIntoView)` pasa a `onAddIndice`.

- [ ] **Step 4.2: `DualIndexCards.tsx`**

```typescript
'use client'
import Link from 'next/link'
import type { Profile } from '@/lib/data/perfil'
import { formatRelativeTime } from '@/lib/format'

interface Props {
  profile: Profile
  fedegolf: { refreshing: boolean; msg: { kind: 'ok'|'warn'|'error'; text: string } | null; refresh: () => void }
  onOpenBreakdown: () => void   // setBreakdownOpen(true)
}

export function DualIndexCards({ profile, fedegolf, onOpenBreakdown }: Props) {
  // Mover JSX page.tsx:276-389. Reemplazar:
  //   handleFedegolfRefresh → fedegolf.refresh
  //   fedegolfRefreshing → fedegolf.refreshing
  //   fedegolfMsg → fedegolf.msg
  //   onClick breakdown → onOpenBreakdown
  return (/* JSX dual cards + <style jsx> del spinner */)
}
```

- [ ] **Step 4.3: `CpiCard.tsx` — CON el fix del status (eng-review P0 + decisión Juanjo 08-jun)**

```typescript
import Link from 'next/link'
import { nivelCPI } from '@/golf/stats/cpi'
import { ChevronUp, ChevronDown } from '@/components/icons'
import type { ResultadoCPI } from '@/lib/data/perfil'
import { getCpiColor, getCpiLabel } from '../perfilFormat'

interface Props { cpiData: ResultadoCPI | null }

export function CpiCard({ cpiData }: Props) {
  if (!cpiData) return null

  // FIX: el original gateaba la card del score con status === 'ok', valor que
  // calcularCPI NUNCA devuelve → la card nunca se mostraba a usuarios con rondas.
  // Mapeo correcto:
  //   'insufficient_data' → card "Activa tu CPI"
  //   'provisional' | 'established' → card del SCORE
  if (cpiData.status === 'insufficient_data') {
    // Mover el JSX de page.tsx:512-535 ("Activa tu CPI", botón Importar).
    return (/* JSX "Activa tu CPI" */)
  }

  // provisional | established → card del score.
  // Mover el JSX de page.tsx:457-510 (score grande + label + trend + barra),
  // con estos REEMPLAZOS sobre el original:
  //   - cpiData.roundsInWindow  →  cpiData.rondas_usadas   (el campo real)
  //   - cpiData.score, cpiData.trend  →  igual (sí existen en ResultadoCPI)
  //   - getCpiColor/getCpiLabel/nivelCPI sobre cpiData.score → igual
  //   - SOLO si status === 'provisional', agregar un sufijo discreto
  //     "· provisional" junto a "{rondas_usadas} rondas" (honestidad: el score
  //     aún no está consolidado). Si 'established', sin sufijo.
  const isProvisional = cpiData.status === 'provisional'
  return (/* JSX card del score; usa cpiData.rondas_usadas e isProvisional */)
}
```

> Se ELIMINA la rama `'momentum_paused'` (page.tsx:532-550) — código muerto, `calcularCPI` nunca devuelve ese status. El bloque que la usaba no se porta.

- [ ] **Step 4.4: `AccountSection.tsx`**

```typescript
'use client'
import { Button } from '@/components/ui/Button'
import { Check } from '@/components/icons'
import type { Profile } from '@/lib/data/perfil'

interface Props {
  profile: Profile
  userEmail: string | null
  edit: ReturnType<typeof import('../hooks/useProfileEdit').useProfileEdit>
}

export function AccountSection({ profile, userEmail, edit }: Props) {
  // Mover JSX page.tsx:583-687. Reemplazar:
  //   editing/saving/saved/editName/editIndice/handleSave/cancel → edit.*
  //   inputStyle: mover la const inputStyle (page.tsx:31-41) acá arriba o a perfilFormat.
  return (/* JSX sección Cuenta */)
}
```

> El `id="edit-form"` debe mantenerse en el contenedor del form (el header le hace scrollIntoView por ese id).

- [ ] **Step 4.5: `DeleteAccountModal.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { addToast } from '@/hooks/useToast'

export function DeleteAccountModal() {
  const [deleteStep, setDeleteStep] = useState(0)
  // Mover JSX page.tsx:723-799 (link + modal). El estado deleteStep vive acá
  // (es autocontenido, no lo comparte nadie). El fetch DELETE queda igual.
  return (/* link + modal */)
}
```

- [ ] **Step 4.6: `EditorialBlocks.tsx`** — exportar 3 componentes chicos: `GapNote({ profile })`, `NivelBadge({ profile })`, `SyncHistorialBlock()`. Mover los JSX respectivos. Importan `NIVEL_LABELS, NIVEL_DESCRIPCION` de `@/lib/indice-golfers` y `Button`/`Link` donde aplique.

- [ ] **Step 4.7: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores. (Los componentes compilan aunque aún no se usen desde la page.)

- [ ] **Step 4.8: Commit**

```bash
git add src/app/perfil/components/
git commit -m "refactor(perfil): extraer componentes presentacionales (header, cards, cpi, cuenta, delete, editoriales)"
```

---

## Task 5: Orquestador `PerfilView.tsx`

**Files:**
- Create: `src/app/perfil/components/PerfilView.tsx`

- [ ] **Step 5.1: Implementar `PerfilView`**

```typescript
'use client'
import { useState } from 'react'
import { ExperiencePanel } from '@/components/ExperienceSetup'
import { LevelsBar } from '@/components/perfil/LevelsBar'
import { getNivel } from '@/lib/mi-golf/niveles'
import IndiceBreakdownModal from '@/components/IndiceBreakdownModal'
import InstallAppCard from '@/components/InstallAppCard'
import Link from 'next/link'
import type { Profile, ResultadoCPI } from '@/lib/data/perfil'
import { useProfileEdit } from '../hooks/useProfileEdit'
import { useFedegolfRefresh } from '../hooks/useFedegolfRefresh'
import { ProfileHeaderCard } from './ProfileHeaderCard'
import { DualIndexCards } from './DualIndexCards'
import { CpiCard } from './CpiCard'
import { AccountSection } from './AccountSection'
import { DeleteAccountModal } from './DeleteAccountModal'
import { GapNote, NivelBadge, SyncHistorialBlock } from './EditorialBlocks'

interface Props {
  initialProfile: Profile
  userEmail: string | null
  tourneysPlayed: number
  cpiData: ResultadoCPI | null
}

export function PerfilView({ initialProfile, userEmail, tourneysPlayed, cpiData }: Props) {
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const edit = useProfileEdit(profile, setProfile)
  const fedegolf = useFedegolfRefresh(profile, setProfile)

  const indiceParaNivel = profile.indice_golfers ?? profile.indice

  return (
    <div style={{ /* wrapper styles de page.tsx:193-204 */ }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link href="/dashboard" style={{ /* ... */ }}>← Dashboard</Link>

        <ProfileHeaderCard
          profile={profile}
          tourneysPlayed={tourneysPlayed}
          onAddIndice={() => { edit.setEditing(true); setTimeout(() => document.getElementById('edit-form')?.scrollIntoView({ behavior: 'smooth' }), 100) }}
        />
        <DualIndexCards profile={profile} fedegolf={fedegolf} onOpenBreakdown={() => setBreakdownOpen(true)} />
        {/* link "¿Cuándo uso cuál?" page.tsx:392-402 */}
        <InstallAppCard />
        <GapNote profile={profile} />
        <NivelBadge profile={profile} />
        <CpiCard cpiData={cpiData} />
        {indiceParaNivel != null && <LevelsBar nivel={getNivel(indiceParaNivel)} />}
        <AccountSection profile={profile} userEmail={userEmail} edit={edit} />
        <SyncHistorialBlock />
        <div style={{ marginTop: '16px', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <ExperiencePanel />
        </div>
        <DeleteAccountModal />
      </div>
      <style>{`@keyframes profileIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <IndiceBreakdownModal isOpen={breakdownOpen} onClose={() => setBreakdownOpen(false)} />
    </div>
  )
}
```

> Respetar el ORDEN visual del original exactamente (header → dual cards → "¿cuándo uso cuál?" → InstallAppCard → gap note → nivel badge → CPI → LevelsBar → Cuenta → Sync → ExperiencePanel → Delete). Comparar contra `page.tsx` actual línea por línea al armarlo.

- [ ] **Step 5.2: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5.3: Commit**

```bash
git add src/app/perfil/components/PerfilView.tsx
git commit -m "refactor(perfil): orquestador client PerfilView (estado + composición)"
```

---

## Task 6: `page.tsx` como Server Component

**Files:**
- Modify: `src/app/perfil/page.tsx` (reescritura completa)

- [ ] **Step 6.1: Reescribir `page.tsx`**

```typescript
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { fetchProfile, countTournaments, fetchCpi } from '@/lib/data/perfil'
import { PerfilView } from './components/PerfilView'

export const metadata: Metadata = { title: 'Perfil — Golfers+' }
export const dynamic = 'force-dynamic'

/**
 * Perfil. Server Component: resuelve auth con getPageUser (sin round-trip
 * duplicado — el middleware ya validó) y fetchea perfil + conteo de torneos +
 * CPI en paralelo server-side, co-locado con Supabase (gru1). Antes era
 * 'use client' con useEffect que disparaba 2 getUser + 2 queries + fetch('/api/cpi')
 * (que re-autenticaba) DESPUÉS de hidratar → waterfall + spinner. Ahora PerfilView
 * pinta con datos al instante. Capa de datos: src/lib/data/perfil.ts.
 */
export default async function PerfilPage() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?redirect=/perfil')

  const [profile, tourneysPlayed, cpiData] = await Promise.all([
    fetchProfile(supabase, user.id),
    countTournaments(supabase, user.id),
    fetchCpi(supabase, user.id),
  ])

  if (!profile) {
    // Sin profile (caso borde: usuario auth sin fila en profiles). Antes la page
    // hacía `return null` (pantalla en blanco). Mantener ese comportamiento: el
    // trigger de creación de profile vive en el flujo de onboarding/login.
    return null
  }

  return (
    <PerfilView
      initialProfile={profile}
      userEmail={user.email ?? null}
      tourneysPlayed={tourneysPlayed}
      cpiData={cpiData}
    />
  )
}
```

- [ ] **Step 6.2: Verificar que no queda `supabase.from` ni `getUser` ni `fetch('/api/cpi')` en la page**

Run: `grep -nE "supabase|getUser|/api/cpi|useState|useEffect" src/app/perfil/page.tsx`
Expected: sin matches (la page es server, sin estado ni cliente).

- [ ] **Step 6.3: tsc + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores TS; build OK; `/perfil` aparece como `ƒ` (dynamic server-rendered).

- [ ] **Step 6.4: Commit**

```bash
git add src/app/perfil/page.tsx
git commit -m "perf(perfil): page.tsx a Server Component — mata el waterfall client + fetch /api/cpi re-auth"
```

---

## Task 7: Validación, smoke y entrega

- [ ] **Step 7.1: Suite completa**

Run: `npm run test`
Expected: todo verde, incluidos los tests nuevos (perfil.test.ts, perfilFormat.test.ts) y los canarios.

- [ ] **Step 7.2: Verificar LOC del page refactorizado**

Run: `wc -l src/app/perfil/page.tsx`
Expected: <60 LOC (era 802). Confirmar que ya NO está en la lista de "sucios" (sin supabase directo, sin console.*, <600 LOC).

- [ ] **Step 7.3: Smoke en preview**

Push, esperar preview deploy, obtener bypass (`get_access_to_vercel_url`) y verificar:
- `/perfil` deslogueado → 307 a `/login?redirect=/perfil`.
- (con sesión real, manual desde Juanjo o cookie importada): la página pinta perfil + índices + CPI SIN spinner de "Cargando perfil...", editar nombre/índice guarda, botón FedeGolf responde, "Eliminar mi cuenta" abre modal.

- [ ] **Step 7.4: code-reviewer independiente**

Diff > 100 LOC → lanzar `Agent` `superpowers:code-reviewer` contra el diff vs `origin/main`. Foco: paridad visual/funcional 1:1 con el original, que no se perdió ningún estado/edge case (los 3 estados de CPI, el `{ ...profile, ...updated }` del save, el orden visual), y que la page no quedó con fetching client.

- [ ] **Step 7.5: PR + merge + deploy + smoke post-deploy**

`/pre-push` → PR → (reviewer OK) → merge squash → confirmar Vercel prod success → smoke prod `/perfil` (307 deslogueado) → actualizar `docs/REORDENAMIENTO_TRACKING.md` + memoria `project_perf_overhaul`.

---

## Self-Review (checklist del autor del plan)

**1. Cobertura del spec:**
- "el que toca ordena" → Tasks 1-6 dejan page <60 LOC, sin supabase directo, lógica en hooks/data, vista en componentes. ✓
- Perf (matar waterfall + /api/cpi re-auth) → Task 6 (server fetch) + Task 1 (`fetchCpi` server-side). ✓
- Preservar interactividad (editar, FedeGolf, borrar, ExperiencePanel, breakdown) → Tasks 3-5. ✓

**2. Placeholders:** Los componentes de Task 4 dicen "mover JSX de page.tsx:X-Y" en vez de reproducir 200 líneas — es un **refactor de movimiento**, no código nuevo; la fuente exacta está referenciada por número de línea. Las piezas NUEVAS (capa de datos, hooks, page server, PerfilView, props) tienen código completo. Aceptable para refactor.

**3. Consistencia de tipos:** `Profile` y `CpiData` se definen una vez en `src/lib/data/perfil.ts` y se importan en hooks/componentes/page. `useProfileEdit`/`useFedegolfRefresh` retornan objetos consumidos por props tipadas en AccountSection/DualIndexCards. ✓

**Riesgo principal:** paridad visual 1:1 al mover JSX con estilos inline (mucho `style={{}}`). Mitigación: Task 7.3 smoke visual + Task 7.4 code-reviewer con foco en paridad + comparación línea-a-línea contra el original (que queda en git).

---

## Resultado del eng-review (08-jun-2026)

Revisión independiente (voz externa) + verificación. Hallazgos aplicados al plan:

- **[P0 — RESUELTO] CPI card muerta.** `calcularCPI` devuelve `status: 'insufficient_data'|'provisional'|'established'` (verificado en `cpi.ts:86-224`), no `'ok'`/`'momentum_paused'`. El `/perfil` actual nunca muestra el score CPI a usuarios con rondas. **Decisión de Juanjo: arreglarlo** (Task 4.3 reescrita con el mapeo correcto). Se reusa `ResultadoCPI` en vez del `CpiData` inventado.
- **[P1 — RESUELTO] Bug del save que borra cards.** El original reemplazaba el profile entero al guardar (perdía `indice_golfers`/`nivel` hasta recargar). El hook lo mergea (`{...profile, ...updated}`) + test de regresión (Task 3.3).
- **[P1 — RESUELTO] `PROFILE_COLS` duplicado.** Ahora se exporta de `perfil.ts` y lo importa el hook FedeGolf (Task 1 + 3.2).
- **[Confirmado] `getPageUser` es seguro en `/perfil`** (está en `protectedRoutes` del middleware).
- **[Confirmado] `Promise.all` (no Suspense)** para el CPI: el query es `.limit(50)`, no justifica una boundary de Suspense. Sin salto visual. **Decisión cerrada — no es una pregunta abierta.**
- **[Confirmado] sin side-effects perdidos:** el `useEffect` original solo cargaba datos (sin PostHog/analytics/captureError on-mount).

**Arquitectura, uso de `getPageUser` y rationale de perf: aprobados sin cambios.** El plan está listo para ejecutar con las correcciones aplicadas.
