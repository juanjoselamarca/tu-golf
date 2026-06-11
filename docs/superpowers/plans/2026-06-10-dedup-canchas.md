# Dedup de canchas duplicadas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar las 3 canchas duplicadas en uso (Los Leones, La Dehesa, Lomas) haciendo canónica la ficha manual, corrigiendo sus tees a los valores oficiales fedegolf, redirigiendo las fichas fedegolf vía `canonical_course_id` y desactivándolas — sin repointear ninguna ronda real.

**Architecture:** Lógica de golf pura y testeada en `src/golf/courses/course-dedup.ts` (`planTeeCorrections`, `findDuplicateRounds`). Capa de datos idempotente en `src/lib/data/course-dedup.ts`. Scripts read-only (dry-run con impacto por usuario) y apply (con backup). El recompute reusa `recomputeRoundsFromCatalog` (PR #144, ya en main). Protocolo por cluster: dry-run → OK de Juanjo → backup → apply → recompute → code-reviewer.

**Tech Stack:** TypeScript, Vitest (pool vmThreads), Supabase service-role vía `scripts/run-sql.mjs` y `@supabase/supabase-js`, tsx para scripts.

**Datos de referencia (verificados contra prod 2026-06-10):**

| Cluster | Manual canónica | Fedegolf a redirigir |
|---|---|---|
| Los Leones | `8f64cd3a-daed-4d97-98e9-7f8ef9552f2d` | `b1b6ba60-...`(V, 1 ronda) · `348ce623-...`(D) |
| La Dehesa | `8fb8c2ce-...` (0 tees) | `01a0ec3f-...`(V) · `785378dc-...`(D) |
| Lomas | `dff847e1-...` | `b4bca060-...`(V) · `f076395b-...`(D) |

`course_tees` cols: `id, course_id, nombre, yardaje_total, par_total, rating, slope, genero, created_at, front_course_rating, front_slope_rating, front_bogey_rating, back_course_rating, back_slope_rating, back_bogey_rating, bogey_rating, total_yards, total_meters, fuente`.

`TeeRow` = `{ nombre, genero?, rating, slope, front_course_rating?, front_slope_rating?, back_course_rating?, back_slope_rating? }`.

---

## Task 1: `planTeeCorrections` (función pura)

**Files:**
- Create: `src/golf/courses/course-dedup.ts`
- Test: `src/golf/courses/__tests__/course-dedup.test.ts`

Regla: para cada tee oficial (match por `nombre` lowercase + `genero`), el resultado toma `rating`/`slope` del oficial (fedegolf = fuente de verdad para 18h). `front_*`/`back_*` toman el oficial si NO es null, si no conservan el de la ficha manual (no se nulea una capacidad 9h existente). Tee manual sin equivalente oficial → se deja intacto (no aparece en el output). `action: 'update'` si la manual ya tenía ese (color,género), `'insert'` si no.

- [ ] **Step 1: Write the failing test** (datos reales Los Leones)

```typescript
import { describe, it, expect } from 'vitest'
import { planTeeCorrections } from '../course-dedup'

const manual = [
  { nombre: 'azul',   genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
  { nombre: 'blanco', genero: 'M', rating: 71.8, slope: 130, front_course_rating: 36.2, front_slope_rating: 128, back_course_rating: null, back_slope_rating: null },
  { nombre: 'negras', genero: 'M', rating: 75.1, slope: 142, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
  { nombre: 'rojo',   genero: 'F', rating: 74.8, slope: 131, front_course_rating: 37.7, front_slope_rating: 128, back_course_rating: null, back_slope_rating: null },
]
const official = [
  { nombre: 'dorado', genero: 'M', rating: 68.3, slope: 121, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
  { nombre: 'blanco', genero: 'M', rating: 71.6, slope: 129, front_course_rating: 36.2, front_slope_rating: 128, back_course_rating: null, back_slope_rating: null },
  { nombre: 'azul',   genero: 'M', rating: 73.3, slope: 136, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
  { nombre: 'negras', genero: 'M', rating: 75.1, slope: 142, front_course_rating: 37.8, front_slope_rating: 137, back_course_rating: null, back_slope_rating: null },
  { nombre: 'rojo',   genero: 'F', rating: 74.8, slope: 131, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null },
]

describe('planTeeCorrections', () => {
  it('corrige 18h al oficial y conserva front-9 cuando el oficial no lo trae', () => {
    const ups = planTeeCorrections(manual, official)
    const azul = ups.find(u => u.nombre === 'azul' && u.genero === 'M')!
    expect(azul.action).toBe('update')
    expect(azul.rating).toBe(73.3)        // 18h al oficial
    expect(azul.slope).toBe(136)
    expect(azul.front_course_rating).toBe(37.2) // front igual (oficial trae)

    const negras = ups.find(u => u.nombre === 'negras')!
    expect(negras.front_course_rating).toBe(37.8) // oficial AGREGA front que faltaba
    expect(negras.front_slope_rating).toBe(137)

    const rojo = ups.find(u => u.nombre === 'rojo' && u.genero === 'F')!
    expect(rojo.front_course_rating).toBe(37.7) // oficial null → CONSERVA el manual
    expect(rojo.rating).toBe(74.8)

    const dorado = ups.find(u => u.nombre === 'dorado')!
    expect(dorado.action).toBe('insert')  // no estaba en la manual
    expect(dorado.rating).toBe(68.3)
  })

  it('no toca tees manuales que el oficial no tiene', () => {
    const extraManual = [...manual, { nombre: 'verde', genero: 'M', rating: 70, slope: 120, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null }]
    const ups = planTeeCorrections(extraManual, official)
    expect(ups.find(u => u.nombre === 'verde')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/golf/courses/__tests__/course-dedup.test.ts`
Expected: FAIL ("planTeeCorrections is not a function").

- [ ] **Step 3: Implement**

```typescript
import type { TeeRow } from './tee-resolver'

export interface TeeUpsert {
  nombre: string
  genero: string | null
  rating: number | null
  slope: number | null
  front_course_rating: number | null
  front_slope_rating: number | null
  back_course_rating: number | null
  back_slope_rating: number | null
  action: 'update' | 'insert'
}

function key(t: { nombre: string; genero?: string | null }): string {
  return `${t.nombre.trim().toLowerCase()}|${(t.genero ?? '').toUpperCase()}`
}
function pick<T>(official: T | null | undefined, manual: T | null | undefined): T | null {
  return official != null ? official : (manual ?? null)
}

/**
 * Para cada tee OFICIAL (fedegolf = fuente de verdad de 18h), devuelve el tee
 * corregido para la ficha manual: rating/slope del oficial; front/back del
 * oficial si existe, si no se conserva el de la manual (no se pierde el 9h).
 * Tees manuales sin equivalente oficial NO se tocan (no aparecen).
 */
export function planTeeCorrections(manualTees: TeeRow[], officialTees: TeeRow[]): TeeUpsert[] {
  const manualByKey = new Map(manualTees.map(t => [key(t), t]))
  return officialTees.map(off => {
    const man = manualByKey.get(key(off))
    return {
      nombre: off.nombre.trim().toLowerCase(),
      genero: (off.genero ?? null),
      rating: off.rating,
      slope: off.slope,
      front_course_rating: pick(off.front_course_rating, man?.front_course_rating),
      front_slope_rating: pick(off.front_slope_rating, man?.front_slope_rating),
      back_course_rating: pick(off.back_course_rating, man?.back_course_rating),
      back_slope_rating: pick(off.back_slope_rating, man?.back_slope_rating),
      action: man ? 'update' : 'insert',
    }
  })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/golf/courses/__tests__/course-dedup.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/courses/course-dedup.ts src/golf/courses/__tests__/course-dedup.test.ts
git commit -m "feat(dedup): planTeeCorrections — corrige tees de la ficha manual al oficial fedegolf"
```

---

## Task 2: `findDuplicateRounds` (función pura)

**Files:**
- Modify: `src/golf/courses/course-dedup.ts`
- Test: `src/golf/courses/__tests__/course-dedup.test.ts`

Agrupa rondas por `(user_id, played_at, holes_played, total_gross, course_id)` y devuelve los `id` a borrar: todos menos el más antiguo por `created_at` de cada grupo con >1 fila.

- [ ] **Step 1: Write the failing test**

```typescript
import { findDuplicateRounds } from '../course-dedup'

describe('findDuplicateRounds', () => {
  it('marca para borrar las copias, conserva la más antigua', () => {
    const rounds = [
      { id: 'a', user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-03T10:00:00Z' },
      { id: 'b', user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-04T10:00:00Z' },
      { id: 'c', user_id: 'u1', played_at: '2026-05-02', holes_played: 18, total_gross: 90, course_id: 'c1', created_at: '2026-05-02T10:00:00Z' },
    ]
    expect(findDuplicateRounds(rounds)).toEqual(['b']) // 'a' es más antigua → se conserva
  })

  it('no marca nada si no hay duplicados', () => {
    const rounds = [
      { id: 'a', user_id: 'u1', played_at: '2026-05-03', holes_played: 18, total_gross: 96, course_id: 'c1', created_at: '2026-05-03T10:00:00Z' },
      { id: 'b', user_id: 'u1', played_at: '2026-05-03', holes_played: 9,  total_gross: 96, course_id: 'c1', created_at: '2026-05-04T10:00:00Z' },
    ]
    expect(findDuplicateRounds(rounds)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/golf/courses/__tests__/course-dedup.test.ts`
Expected: FAIL ("findDuplicateRounds is not a function").

- [ ] **Step 3: Implement** (append to `course-dedup.ts`)

```typescript
export interface DupRound {
  id: string
  user_id: string
  played_at: string
  holes_played: number | null
  total_gross: number | null
  course_id: string
  created_at: string
}

/** Devuelve los id de rondas exacto-duplicadas a borrar (conserva la más antigua de cada grupo). */
export function findDuplicateRounds(rounds: DupRound[]): string[] {
  const groups = new Map<string, DupRound[]>()
  for (const r of rounds) {
    const k = `${r.user_id}|${r.played_at}|${r.holes_played}|${r.total_gross}|${r.course_id}`
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }
  const toDelete: string[] = []
  for (const arr of groups.values()) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const r of sorted.slice(1)) toDelete.push(r.id)
  }
  return toDelete
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/golf/courses/__tests__/course-dedup.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/golf/courses/course-dedup.ts src/golf/courses/__tests__/course-dedup.test.ts
git commit -m "feat(dedup): findDuplicateRounds — detecta rondas exacto-duplicadas"
```

---

## Task 3: Capa de datos `course-dedup.ts` (aplicación idempotente)

**Files:**
- Create: `src/lib/data/course-dedup.ts`
- Test: `src/lib/data/__tests__/course-dedup.test.ts`

Funciones:
- `applyTeeCorrections(supabase, courseId, ups: TeeUpsert[])`: por cada upsert, busca el tee manual por `(course_id, nombre, genero)`; si existe → UPDATE, si no → INSERT (`fuente='dedup-oficial'`). Devuelve `{updated, inserted}`.
- `redirectCourse(supabase, fromId, toId)`: `UPDATE courses SET canonical_course_id=toId, activa=false WHERE id=fromId`.
- `repointRounds(supabase, fromCourseId, toCourseId)`: `UPDATE historical_rounds SET course_id=toId WHERE course_id=fromId`. Devuelve count.
- `deleteRounds(supabase, ids: string[])`: borra por id. Devuelve count.

- [ ] **Step 1: Write the failing test** (stub de supabase que captura ops)

```typescript
import { describe, it, expect } from 'vitest'
import { applyTeeCorrections } from '../course-dedup'
import type { TeeUpsert } from '@/golf/courses/course-dedup'

// Stub: 1 tee 'azul/M' existe (id t1); el resto no.
function stub(existing: { id: string; nombre: string; genero: string }[], ops: any[]) {
  return {
    from() {
      const b: any = {
        _sel: false, _eq: {} as Record<string, unknown>, _payload: null as any,
        select() { b._sel = true; return b },
        eq(col: string, val: unknown) { b._eq[col] = val; return b },
        update(p: any) { b._payload = { kind: 'update', p }; return b },
        insert(p: any) { ops.push({ kind: 'insert', p }); return Promise.resolve({ error: null }) },
        maybeSingle() {
          const hit = existing.find(e => e.nombre === b._eq.nombre && e.genero === b._eq.genero)
          return Promise.resolve({ data: hit ?? null })
        },
        then(res: any) { // resolución del update().eq()
          if (b._payload?.kind === 'update') ops.push({ kind: 'update', id: b._eq.id, p: b._payload.p })
          return Promise.resolve({ error: null }).then(res)
        },
      }
      return b
    },
  } as any
}

describe('applyTeeCorrections', () => {
  it('UPDATE si el tee existe, INSERT si no', async () => {
    const ops: any[] = []
    const sb = stub([{ id: 't1', nombre: 'azul', genero: 'M' }], ops)
    const ups: TeeUpsert[] = [
      { nombre: 'azul', genero: 'M', rating: 73.3, slope: 136, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null, action: 'update' },
      { nombre: 'dorado', genero: 'M', rating: 68.3, slope: 121, front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null, action: 'insert' },
    ]
    const res = await applyTeeCorrections(sb, 'course-x', ups)
    expect(res).toEqual({ updated: 1, inserted: 1 })
    expect(ops.find(o => o.kind === 'update')?.p.rating).toBe(73.3)
    expect(ops.find(o => o.kind === 'insert')?.p.nombre).toBe('dorado')
    expect(ops.find(o => o.kind === 'insert')?.p.course_id).toBe('course-x')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/data/__tests__/course-dedup.test.ts`
Expected: FAIL ("applyTeeCorrections is not a function").

- [ ] **Step 3: Implement**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeeUpsert } from '@/golf/courses/course-dedup'

export async function applyTeeCorrections(
  supabase: SupabaseClient,
  courseId: string,
  ups: TeeUpsert[],
): Promise<{ updated: number; inserted: number }> {
  let updated = 0, inserted = 0
  for (const u of ups) {
    const { data: existing } = await supabase
      .from('course_tees')
      .select('id')
      .eq('course_id', courseId)
      .eq('nombre', u.nombre)
      .eq('genero', u.genero)
      .maybeSingle()
    const fields = {
      rating: u.rating, slope: u.slope,
      front_course_rating: u.front_course_rating, front_slope_rating: u.front_slope_rating,
      back_course_rating: u.back_course_rating, back_slope_rating: u.back_slope_rating,
    }
    if (existing?.id) {
      await supabase.from('course_tees').update(fields).eq('id', existing.id)
      updated++
    } else {
      await supabase.from('course_tees').insert({ course_id: courseId, nombre: u.nombre, genero: u.genero, fuente: 'dedup-oficial', ...fields })
      inserted++
    }
  }
  return { updated, inserted }
}

export async function redirectCourse(supabase: SupabaseClient, fromId: string, toId: string): Promise<void> {
  await supabase.from('courses').update({ canonical_course_id: toId, activa: false }).eq('id', fromId)
}

export async function repointRounds(supabase: SupabaseClient, fromCourseId: string, toCourseId: string): Promise<number> {
  const { data } = await supabase.from('historical_rounds').update({ course_id: toCourseId }).eq('course_id', fromCourseId).select('id')
  return data?.length ?? 0
}

export async function deleteRounds(supabase: SupabaseClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { data } = await supabase.from('historical_rounds').delete().in('id', ids).select('id')
  return data?.length ?? 0
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/lib/data/__tests__/course-dedup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/course-dedup.ts src/lib/data/__tests__/course-dedup.test.ts
git commit -m "feat(dedup): capa de datos idempotente (corregir tees, redirigir, repointar, borrar dups)"
```

---

## Task 4: Config de clusters + script DRY-RUN (read-only, impacto por usuario)

**Files:**
- Create: `scripts/dedup-canchas-config.ts` (los 3 clusters, ids reales)
- Create: `scripts/dedup-canchas-dry-run.ts`

- [ ] **Step 1: Config** (sin test — son datos)

```typescript
// scripts/dedup-canchas-config.ts
export interface Cluster {
  slug: string
  nombre: string
  manualId: string       // canónica que GANA
  fedegolfIds: string[]  // se redirigen + desactivan
}
export const CLUSTERS: Cluster[] = [
  { slug: 'los-leones', nombre: 'Los Leones', manualId: '8f64cd3a-daed-4d97-98e9-7f8ef9552f2d',
    fedegolfIds: ['b1b6ba60-18f0-48a8-97c2-ef10e25fbe26', '348ce623-f548-4605-b050-5f8d1e02981b'] },
  { slug: 'la-dehesa',  nombre: 'La Dehesa',  manualId: '8fb8c2ce-a8ec-4938-bc05-e77e2dcb2281',
    fedegolfIds: ['01a0ec3f-5ce9-4eb8-8c40-f4e481ec871a', '785378dc-ec4f-4252-8e99-3b6a70e7a001'] },
  { slug: 'lomas',      nombre: 'Lomas de La Dehesa', manualId: 'dff847e1-34d9-4805-85a7-01ec3e554f65',
    fedegolfIds: ['b4bca060-49db-4a2a-924c-862754854a20', 'f076395b-0e08-453b-843e-ac1dbfa12af6'] },
]
```

UUIDs verificados contra prod 2026-06-10 (manual genero_norm=X; fedegolf V=VARONES, D=DAMAS).

- [ ] **Step 2: Dry-run script** — por cluster: carga tees manual + oficiales (fedegolf), corre `planTeeCorrections`, imprime diff de tees. Luego, para cada usuario con rondas en la manual, corre `recomputeRoundsFromCatalog(dryRun:true)` SOBRE UNA COPIA EN MEMORIA de los tees corregidos no es posible (el resolver lee la BD) → en su lugar estima el delta de índice mostrando los diferenciales 18h actuales vs los que darían con el rating oficial corregido (cálculo local con `calcularDiferencial`). Imprime tabla `usuario | índice antes | índice después (estimado) | delta`.

```typescript
// scripts/dedup-canchas-dry-run.ts — read-only, NO escribe
import { createClient } from '@supabase/supabase-js'
import { CLUSTERS } from './dedup-canchas-config'
import { getTeesForCourse } from '@/lib/data/course-tees'
import { planTeeCorrections } from '@/golf/courses/course-dedup'
import { resolveRatings } from '@/golf/courses/tee-resolver'
import { calcularDiferencial, calcularIndiceGolfersLocal } from '@/lib/indice-golfers'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const slug = process.argv[2] // opcional: un cluster

async function main() {
  for (const c of CLUSTERS) {
    if (slug && c.slug !== slug) continue
    console.log(`\n═══ ${c.nombre} (${c.slug}) ═══`)
    const manualTees = await getTeesForCourse(sb, c.manualId)
    const official: any[] = []
    for (const fid of c.fedegolfIds) official.push(...await getTeesForCourse(sb, fid))
    const ups = planTeeCorrections(manualTees, official)
    console.log('── Correcciones de tee ──')
    for (const u of ups) console.log(`  ${u.action.padEnd(6)} ${u.nombre}/${u.genero}: ${u.rating}/${u.slope} (front ${u.front_course_rating ?? '—'}/${u.front_slope_rating ?? '—'})`)

    // Impacto por usuario: re-derivar diferenciales con los tees corregidos (en memoria).
    const correctedTees = mergeCorrected(manualTees, ups) // helper local: aplica ups sobre manualTees
    const { data: rounds } = await sb.from('historical_rounds')
      .select('id, user_id, tee_color, holes_played, total_gross, diferencial, excluded_from_handicap, played_at')
      .eq('course_id', c.manualId).eq('excluded_from_handicap', false)
    const byUser = groupBy(rounds ?? [], r => r.user_id)
    console.log('── Impacto de índice por usuario ──')
    for (const [uid, rs] of byUser) {
      const { data: prof } = await sb.from('profiles').select('genero, indice_golfers').eq('id', uid).maybeSingle()
      // índice "después" = recomputar SOLO las rondas de esta cancha con los tees corregidos,
      //                    combinado con las rondas de OTRAS canchas (su diferencial actual).
      // (implementación detallada en el script; usa calcularDiferencial + calcularIndiceGolfersLocal sobre la ventana últimas-20 del usuario.)
      console.log(`  ${uid.slice(0,8)} idx ${prof?.indice_golfers ?? '—'} → (ver delta)`)
    }
  }
  console.log('\nNADA fue escrito. Dry-run.')
}
main().catch(e => { console.error(e); process.exit(1) })
```

> **NOTA:** El script debe calcular el índice "después" reuniendo, por usuario, sus últimas-20 rondas globales (no solo de esta cancha) y sustituyendo el diferencial de las rondas de la cancha-cluster por el recomputado con los tees corregidos. Helper `mergeCorrected` y `groupBy` se definen inline. Es read-only.

- [ ] **Step 3: Correr el dry-run de Los Leones**

Run: `node --env-file=.env.local --import tsx scripts/dedup-canchas-dry-run.ts los-leones`
Expected: tabla de correcciones de tee + tabla de impacto por usuario. **No escribe nada.**

- [ ] **Step 4: Commit**

```bash
git add scripts/dedup-canchas-config.ts scripts/dedup-canchas-dry-run.ts
git commit -m "feat(dedup): config de clusters + dry-run read-only con impacto por usuario"
```

---

## Task 5: Script APPLY por cluster (backup + apply + recompute)

**Files:**
- Create: `scripts/dedup-canchas-apply.ts`

Orden idempotente por cluster:
1. **Backup** a `%TEMP%/dedup-<slug>-backup.json`: filas de `courses` (manual + fedegolf), `course_tees` (manual), y `historical_rounds` (de la manual + de las fedegolf).
2. **Guardia:** abortar si alguna fedegolf a desactivar (excepto las listadas con ronda conocida) tiene rondas inesperadas.
3. `repointRounds(fedegolfConRondas → manual)` para las fedegolf que tengan rondas (Los Leones `b1b6ba60`: 1 ronda).
4. `applyTeeCorrections(manual, ups)`.
5. `redirectCourse(fedegolf → manual)` para cada fedegolf.
6. `recomputeRoundsFromCatalog(sb, userId, {dryRun:false, genero})` + RPC `calcular_indice_golfers` por cada usuario afectado.

- [ ] **Step 1: Implementar el script** (con flag `--apply`; sin el flag es dry-run de seguridad)

```typescript
// scripts/dedup-canchas-apply.ts
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'  // permitido en script Node, no en workflow
import { CLUSTERS } from './dedup-canchas-config'
import { getTeesForCourse } from '@/lib/data/course-tees'
import { planTeeCorrections } from '@/golf/courses/course-dedup'
import { applyTeeCorrections, redirectCourse, repointRounds } from '@/lib/data/course-dedup'
import { recomputeRoundsFromCatalog } from '@/lib/data/recompute-tee-rounds'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const slug = process.argv[2]
const APPLY = process.argv.includes('--apply')

async function main() {
  const c = CLUSTERS.find(x => x.slug === slug)
  if (!c) { console.error('cluster?'); process.exit(1) }

  // 1. Backup
  const backup: Record<string, unknown> = {}
  backup.courses = (await sb.from('courses').select('*').in('id', [c.manualId, ...c.fedegolfIds])).data
  backup.tees = (await sb.from('course_tees').select('*').eq('course_id', c.manualId)).data
  backup.rounds = (await sb.from('historical_rounds').select('*').in('course_id', [c.manualId, ...c.fedegolfIds])).data
  const path = `${process.env.TEMP}/dedup-${c.slug}-backup.json`
  writeFileSync(path, JSON.stringify(backup, null, 2))
  console.log(`Backup → ${path}`)

  if (!APPLY) { console.log('Sin --apply: no se escribió nada.'); return }

  // 3. Repointar rondas de fedegolf-con-rondas → manual
  for (const fid of c.fedegolfIds) {
    const n = await repointRounds(sb, fid, c.manualId)
    if (n) console.log(`  repointadas ${n} rondas ${fid} → ${c.manualId}`)
  }
  // 4. Corregir tees
  const manualTees = await getTeesForCourse(sb, c.manualId)
  const official: any[] = []
  for (const fid of c.fedegolfIds) official.push(...await getTeesForCourse(sb, fid))
  const res = await applyTeeCorrections(sb, c.manualId, planTeeCorrections(manualTees, official))
  console.log(`  tees: ${res.updated} updated, ${res.inserted} inserted`)
  // 5. Redirigir + desactivar fedegolf
  for (const fid of c.fedegolfIds) await redirectCourse(sb, fid, c.manualId)
  // 6. Recompute por usuario afectado
  const { data: users } = await sb.from('historical_rounds').select('user_id').eq('course_id', c.manualId)
  const uids = [...new Set((users ?? []).map(u => u.user_id))]
  for (const uid of uids) {
    const { data: prof } = await sb.from('profiles').select('genero').eq('id', uid).maybeSingle()
    await recomputeRoundsFromCatalog(sb, uid, { dryRun: false, genero: prof?.genero ?? null })
    await sb.rpc('calcular_indice_golfers', { p_user_id: uid })
  }
  console.log(`  recomputados ${uids.length} usuarios`)
  console.log('APPLY completo.')
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Correr el backup (sin --apply) de Los Leones**

Run: `node --env-file=.env.local --import tsx scripts/dedup-canchas-apply.ts los-leones`
Expected: escribe el backup JSON, NO aplica.

- [ ] **Step 3: Commit**

```bash
git add scripts/dedup-canchas-apply.ts
git commit -m "feat(dedup): script apply por cluster (backup + tees + redirect + recompute)"
```

---

## Task 6: Canario — el matcher devuelve la canónica, nunca una fedegolf desactivada

**Files:**
- Modify: `src/__tests__/course-matching.test.ts` (o crear `course-dedup-canary.test.ts` cerca)

- [ ] **Step 1: Write the test**

```typescript
import { findBestCourseMatch } from '@/golf/courses/matching'

it('canario: con canonical_course_id, el matcher devuelve la ficha manual canónica', () => {
  const candidates = [
    { id: 'manual-leones', nombre: 'Club de Golf Los Leones', fuente: 'manual', canonical_course_id: null, activa: true },
    { id: 'fedegolf-leones', nombre: 'C.G. Los Leones - Los Leones (VARONES)', fuente: 'fedegolf', canonical_course_id: 'manual-leones', activa: false },
  ]
  const m = findBestCourseMatch('Los Leones', candidates as any, 2)
  expect(m?.id).toBe('manual-leones')
})
```

- [ ] **Step 2: Run, verify PASS** (el matcher ya sigue `canonical_course_id`)

Run: `npx vitest run src/__tests__/course-matching.test.ts`
Expected: PASS. Si falla, revisar que `findBestCourseMatch` resuelve la identidad canónica (matching.ts:183-187).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/course-matching.test.ts
git commit -m "test(dedup): canario — matcher devuelve la canónica, no la fedegolf desactivada"
```

---

## Task 7: Ejecución contra prod (gates de data real) + verificación + PR

> Esta tarea NO es código: es la ejecución supervisada del protocolo. Un paso por cluster.

- [ ] **Step 1: Pre-push del código** — `npx tsc --noEmit` + `npx vitest run` + `npm run build` verdes en el worktree.
- [ ] **Step 2: Los Leones — dry-run** (`dedup-canchas-dry-run.ts los-leones`) → tabla de impacto por usuario.
- [ ] **Step 3: GATE — mostrar a Juanjo la tabla de impacto (índice antes/después por usuario). Esperar OK.** (Operación irreversible sobre 16 usuarios reales.)
- [ ] **Step 4: Backup** (`dedup-canchas-apply.ts los-leones` sin `--apply`).
- [ ] **Step 5: Apply** (`dedup-canchas-apply.ts los-leones --apply`).
- [ ] **Step 6: Verificar** — query: una sola ficha activa "Los Leones"; diferenciales mismo-score-mismo-tee consistentes; índices sanos; el modal muestra un solo nombre.
- [ ] **Step 7: Repetir Steps 2-6 para `la-dehesa` y `lomas`** (cada uno con su gate de OK).
- [ ] **Step 8: Barrido de rondas duplicadas** — script que corre `findDuplicateRounds` sobre toda la BD (o por usuario afectado), muestra los borrados, backup, GATE de OK, apply. Empezar por la ronda 03-may de Juanjo.
- [ ] **Step 9: code-reviewer** (motor matemático = doble revisión) sobre el diff completo vs main.
- [ ] **Step 10: Resolver findings → PR → merge → confirmar deploy Vercel success → smoke (modal de un usuario afectado muestra nombres unificados + índice sano).**
- [ ] **Step 11: Docs** — SPRINT_LOG, REORDENAMIENTO_TRACKING si aplica, actualizar memoria `project_cancha_duplicada_los_leones` + `project_indice_engine_fix` (dedup cerrado), poblar `canonical_course_id` follow-up de las ~180 sin rondas como tarea futura.

---

## Self-Review (cobertura del spec)

- §3 Opción A (manual gana + corregir tees) → Tasks 1, 3, 5. ✓
- §4.1/4.2/4.3 por cluster → Task 4 (config) + Task 5 (apply) + Task 7 (ejecución). ✓
- §4.4 recompute por usuario → Task 5 step 6. ✓
- §5 barrido rondas duplicadas → Task 2 + Task 7 step 8. ✓
- §6 edge cases (front/back preservado, género, idempotencia, fedegolf con rondas, guardia) → Task 1 (front/back pick), Task 5 (repoint + backup + guardia). ✓
- §7 protocolo dry-run/OK/backup/apply/recompute/code-reviewer → Task 4, 5, 7. ✓
- §8 testing (planTeeCorrections, findDuplicateRounds, integración, canario) → Tasks 1, 2, 3, 6. ✓
- §9 rollback (backup JSON) → Task 5 step 1. ✓

**Pendiente de completar en implementación:** el detalle del cálculo de índice "después" en el dry-run (Task 4 step 2 nota) — el algoritmo está descrito (ventana últimas-20 global del usuario sustituyendo el diferencial de las rondas del cluster por el recomputado), falta el código inline del helper. UUIDs ya completos y verificados.

---

## v2 — Tareas adicionales y cambios (post eng-review)

Ver spec §11-§13. Cambios sobre las tareas v1 + tareas nuevas. Orden de implementación: T1', T-MIG, T3', T-MATCH, T2, T4', T5', T6', T7.

### T1' — `planTeeCorrections` con match canónico + carry del nombre manual
- `key()` matchea por **color canonicalizado** (1er token de `nombre` lowercased, igual que `tee-resolver`) + género.
- El `TeeUpsert` de `action:'update'` incluye `manualNombre: string` (el nombre REAL del tee manual) para que el apply actualice ESA fila, no inserte un nombre canonicalizado.
- Test extra: tee manual `'Azul'` (capitalizado) + oficial `'azul'` → `action:'update'`, `manualNombre:'Azul'` (no genera insert). Test back-9: oficial con `back_course_rating` → se preserva.

### T-MIG — Migración: índice único de identidad de tee (idempotencia, spec §11 M3)
- Create: `supabase/migrations/2026061001_uq_course_tees_identity.sql`
- [ ] Verificar 0 violaciones: `select course_id, lower(nombre), coalesce(genero,''), count(*) from course_tees group by 1,2,3 having count(*)>1`. Si hay, limpiar primero (reportar a Juanjo).
- [ ] `CREATE UNIQUE INDEX uq_course_tees_identity ON course_tees (course_id, lower(nombre), coalesce(genero,''));`
- [ ] Aplicar vía `node --env-file=.env.local scripts/run-sql.mjs <migración>` y verificar en prod.

### T3' — `applyTeeCorrections` idempotente
- Para `action:'update'`: busca la fila manual por `(course_id, lower(nombre)=color-canónico, genero)` y UPDATE por su `id`. Usa `manualNombre` del upsert para el match exacto.
- Para `action:'insert'`: INSERT con el nombre oficial. Si el índice único rechaza (carrera) → re-leer y UPDATE.
- Test: correr 2 veces seguidas → 2da corrida 0 inserts, N updates (idempotente). Test con tee manual capitalizado → UPDATE, no INSERT.

### T-MATCH — Fixes del matcher (spec §12, código core, cambio mínimo)
- Modify: `src/golf/courses/matching.ts` (`findBestCourseMatch`): si `best.canonical_course_id` seteado y `candidates.find(canon)` es undefined → `return { id: best.canonical_course_id, nombre: best.nombre, score: best.score }` (C3).
- [ ] Test: candidato único = fedegolf con `canonical_course_id` a un id ausente del set → devuelve ese id.
- Modify: `src/app/api/historial/stats/route.ts` (~L99): `select('id, nombre')` → `select('id, nombre, fuente, canonical_course_id')` (C2).
- [ ] Auditar TODOS los call-sites: `grep -rn "findBestCourseMatch\|matchCourseInDB" src` → cada uno que arme candidatos debe incluir `canonical_course_id` en el select.
- Modify: `src/__tests__/course-matching.test.ts`: actualizar canario existente + agregar caso fedegolf→manual (C1).

### T4' — Dry-run con cálculo "índice después" EXACTO (spec §13) + abort género null
- El dry-run replica la ventana del RPC: rondas `excluded=false` con dif/slope/cr no-null, **ORDER BY played_at DESC LIMIT 20**, sustituye el dif de las rondas del cluster por el recomputado (con guard implausibilidad), ordena por dif ASC, best-N (`rondasUsadas`), ×0.96.
- [ ] **ABORT** si algún usuario afectado tiene `profiles.genero` null → listar y parar (spec §11 M2).
- Backup a `docs/backups/dedup-<slug>-<commit>.json` (NO %TEMP%).

### T5' — Apply con guardia de fedegolf-con-rondas-inesperadas
- [ ] Antes de redirigir: por cada fedegolfId contar rondas; si > las contempladas (Los Leones `b1b6ba60`=1, resto=0) → **ABORT** y reportar (spec §11 M4).
- [ ] La ronda repointada: verificar que su `tee_color` exista en los tees corregidos de la manual; si no → reportar, no dejar huérfana.
- [ ] Backup a ruta persistente. Verificar count de repoint con `select` independiente.

### T6' — Canario de stats/route + matcher
- [ ] Test de integración: tras setear `canonical_course_id`, `matchCourseInDB('Club de Golf Los Leones')` devuelve la manual canónica (no la fedegolf desactivada), incluso si el candidate-set trae solo la fedegolf.

### Self-review v2
- C1 → T-MATCH (canario). C2 → T-MATCH (stats select). C3 → T-MATCH (findBestCourseMatch fix). M1 → T4' (§13 calc). M2 → T4'/T5' (abort género null). M3 → T-MIG + T1' + T3'. M4 → T5' (guardia). Minors → T1' (back-9), T4'/T5' (backup persistente, count real). ✓
