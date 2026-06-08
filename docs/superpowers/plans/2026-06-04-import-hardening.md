# Import Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer el pipeline de import para que ninguna ronda entre con cancha duplicada ni CR/slope equivocado, y dejar el histórico consistente.

**Architecture:** Tres capas de motor (identidad de cancha → resolución de tee/CR/slope → un solo `calcularDiferencial`) + un piso duro a nivel DB (índice único parcial + alias `canonical_course_id`) + un barrido único de datos en dos alcances (dedup base-wide sin tocar hándicaps; re-derivación del índice solo de Juanjo). El RPC `calcular_indice_golfers` NO se toca.

**Tech Stack:** Next.js 14 API routes, TypeScript puro en `src/golf/` y `src/lib/`, Supabase (Postgres), Vitest (pool `vmThreads` por OneDrive, ver [[feedback_vitest_onedrive]]), SQL vía `node --env-file=.env.local scripts/run-sql.mjs <archivo>`.

**Spec:** `docs/superpowers/specs/2026-06-03-import-hardening-design.md`

**Decisiones tomadas (CTO) antes de escribir el plan:**
- Identidad canónica = columna `canonical_course_id` (alias, no destructivo). No se colapsan filas.
- 9h usa ratings reales de `course_tees` (`back_*` para el back, `course_rating`/`slope_rating` para el front) cuando existan; fallback `cr/2` documentado si faltan.
- **Cap de net-double-bogey (adjusted gross): FUERA DE ESTE PLAN.** Follow-up documentado en la Tarea final. Razón: requiere course handicap por ronda que el histórico no guarda; no afecta el índice (best-8); es solo display.
- Barrido B (re-derivar índice) es solo cuenta de Juanjo (`98c5cb7a`) — único usuario con rondas que alimentan un índice.

**Pendiente de cierre en plan-eng-review (no bloquea empezar por Fase 1):** umbrales numéricos de confianza del matcher (Tarea 2), forma exacta de la llave del índice único parcial (Tarea 6).

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/golf/courses/matching.ts` | Matching robusto + resolución vía `canonical_course_id` + preferir FedeGolf | Modify |
| `src/golf/courses/tee-resolver.ts` | Resolver tee + CR/slope (9h/18h) desde `course_tees` por color+género | Create |
| `src/lib/indice-golfers.ts` | `calcularDiferencial` canónico (única implementación) | Modify |
| `src/golf/stats/cpi.ts` | Eliminar `calcularDiferencial` duplicado; usar el canónico; sin defaults | Modify |
| `src/app/api/import/confirm/route.ts` | Usar tee-resolver para CR/slope al guardar | Modify |
| `src/app/api/import/garmin-zip/route.ts` | Usar tee-resolver tras el match | Modify |
| `scripts/fedegolf-sync.ts` | `.insert` → upsert idempotente | Modify |
| `supabase/migrations/0XX_course_canonical.sql` | `canonical_course_id` + `nombre_canonico` generado + índice único parcial | Create |
| `scripts/barrido-dedup-canchas.mjs` | Barrido A: dedup + backfill course_id (con backup) | Create |
| `scripts/barrido-reindex-juanjo.mjs` | Barrido B: re-derivar rondas de Juanjo + reporte before/after | Create |
| Tests unit por archivo de lógica | Cobertura | Create/Modify |

---

## FASE 1 — Motor de diferencial (una sola fuente de verdad)

Arranca por acá: es el cambio de menor blast radius y desbloquea el barrido B.

### Task 1: Deduplicar `calcularDiferencial` — `cpi.ts` usa el canónico

**Files:**
- Modify: `src/golf/stats/cpi.ts` (líneas ~98-107: borrar `DEFAULT_COURSE_RATING`, `DEFAULT_SLOPE`, función privada `calcularDiferencial`; importar la canónica)
- Modify: `src/golf/stats/cpi.ts` (líneas ~170-172: usar la canónica con `holesPlayed`, omitir rondas sin CR/slope)
- Test: `src/golf/stats/cpi.test.ts`

- [ ] **Step 1: Escribir test que falla** — una ronda de 9h sin CR no debe producir diferencial absurdo

```typescript
// en cpi.test.ts
import { calcularCPI } from './cpi'

test('CPI omite rondas sin CR/slope en vez de usar default 72/113', () => {
  const rondas = [
    { total_gross: 42, played_at: '2026-05-01', course_rating: null, slope_rating: null, holes_played: 9 },
    { total_gross: 85, played_at: '2026-05-02', course_rating: 72, slope_rating: 130, holes_played: 18 },
    { total_gross: 88, played_at: '2026-05-03', course_rating: 72, slope_rating: 130, holes_played: 18 },
  ] as any
  const res = calcularCPI(rondas)
  // La ronda de 9h sin CR no debe inyectar un diferencial ~-30
  expect(res.diferenciales.every((d: number) => d > -5)).toBe(true)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- cpi.test.ts`
Expected: FAIL (hoy usa DEFAULT 72/113 y produce diferencial negativo grande para la 9h).

- [ ] **Step 3: Implementar** — borrar la función privada y los defaults, usar la canónica

```typescript
// cpi.ts — arriba
import { calcularDiferencial } from '@/lib/indice-golfers'

// BORRAR: const DEFAULT_COURSE_RATING = 72; const DEFAULT_SLOPE = 113;
// BORRAR: function calcularDiferencial(gross, cr, slope) { ... }

// En calcularCPI, donde hoy hace (líneas ~170):
//   const cr = r.course_rating ?? DEFAULT_COURSE_RATING
//   const slope = r.slope_rating ?? DEFAULT_SLOPE
//   return calcularDiferencial(r.total_gross, cr, slope)
// REEMPLAZAR por: omitir rondas sin CR/slope y pasar holesPlayed
const diferenciales = rondas
  .map(r => r.course_rating != null && r.slope_rating != null
    ? calcularDiferencial(r.total_gross, r.course_rating, r.slope_rating, r.holes_played)
    : null)
  .filter((d): d is number => d != null)
```

> Nota: si `RondaCPI` no incluye `holes_played`, agregarlo al tipo (`holes_played?: number | null`) y propagarlo desde los call-sites de `calcularCPI` (grep `calcularCPI(`).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- cpi.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que no quedó otro `calcularDiferencial`**

Run: `grep -rn "function calcularDiferencial\|DEFAULT_SLOPE\|DEFAULT_COURSE_RATING" src/`
Expected: solo aparece la canónica en `src/lib/indice-golfers.ts`.

- [ ] **Step 6: tsc + commit**

```bash
npx tsc --noEmit
git add src/golf/stats/cpi.ts src/golf/stats/cpi.test.ts
git commit -m "fix(cpi): eliminar calcularDiferencial duplicado, usar el canónico sin defaults"
```

---

## FASE 2 — Resolución de tee/CR/slope desde el catálogo

### Task 2: `tee-resolver.ts` — CR/slope reales por color + género + hoyos

**Files:**
- Create: `src/golf/courses/tee-resolver.ts`
- Test: `src/golf/courses/tee-resolver.test.ts`

- [ ] **Step 1: Confirmar columnas reales de `course_tees`** (no asumir)

Run:
```bash
node --env-file=.env.local scripts/run-sql.mjs <(echo "SELECT column_name FROM information_schema.columns WHERE table_name='course_tees' ORDER BY ordinal_position;")
```
Expected: incluye `course_id`, columna de color (confirmar nombre: `color`/`tee_color`/`nombre`), `course_rating`, `slope_rating`, `back_course_rating`, `back_slope_rating`. Anotar los nombres exactos y usarlos en el Step 3.

- [ ] **Step 2: Escribir test que falla**

```typescript
import { resolveRatings } from './tee-resolver'

const tees = [
  { color: 'blanco', course_rating: 71.6, slope_rating: 129, back_course_rating: 35.8, back_slope_rating: 128 },
  { color: 'azul', course_rating: 73.3, slope_rating: 136, back_course_rating: 36.6, back_slope_rating: 135 },
] as any

test('18h usa course_rating/slope_rating del color', () => {
  expect(resolveRatings(tees, 'blanco', 18)).toEqual({ cr: 71.6, slope: 129, nineHoleRatings: null })
})

test('9h front usa la mitad real cuando hay back rating (front = total - back)', () => {
  const r = resolveRatings(tees, 'blanco', 9)
  expect(r.nineHoleRatings).not.toBeNull()
})

test('color desconocido devuelve null (no inventa)', () => {
  expect(resolveRatings(tees, 'inexistente', 18)).toBeNull()
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npm run test -- tee-resolver.test.ts`
Expected: FAIL ("resolveRatings is not defined").

- [ ] **Step 4: Implementar**

```typescript
// src/golf/courses/tee-resolver.ts
export interface TeeRow {
  color: string
  course_rating: number | null
  slope_rating: number | null
  back_course_rating: number | null
  back_slope_rating: number | null
}
export interface ResolvedRatings {
  cr: number
  slope: number
  nineHoleRatings: { cr9h: number; slope9h: number } | null
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Resuelve CR/slope para un color de tee. Devuelve null si no hay match confiable. */
export function resolveRatings(
  tees: TeeRow[],
  teeColor: string | null | undefined,
  holesPlayed: number | null | undefined
): ResolvedRatings | null {
  if (!teeColor) return null
  const tee = tees.find(t => norm(t.color) === norm(teeColor))
  if (!tee || tee.course_rating == null || tee.slope_rating == null) return null

  const is9h = holesPlayed != null && holesPlayed <= 9
  let nineHoleRatings: ResolvedRatings['nineHoleRatings'] = null
  if (is9h && tee.back_course_rating != null && tee.back_slope_rating != null) {
    // front 9 = total 18h − back 9 (CR); slope del back como proxy del recorrido jugado
    nineHoleRatings = {
      cr9h: Number((tee.course_rating - tee.back_course_rating).toFixed(1)),
      slope9h: tee.back_slope_rating,
    }
  }
  return { cr: tee.course_rating, slope: tee.slope_rating, nineHoleRatings }
}
```

> Decisión 9h: se entrega `nineHoleRatings` al `calcularDiferencial` canónico (que ya lo soporta). Si no hay `back_*`, se devuelve `nineHoleRatings: null` y la canónica cae a su fallback `cr/2` documentado. El recorrido exacto (front vs back jugado) se afina en eng-review si hace falta; para el barrido B basta el front.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npm run test -- tee-resolver.test.ts`
Expected: PASS.

- [ ] **Step 6: tsc + commit**

```bash
npx tsc --noEmit
git add src/golf/courses/tee-resolver.ts src/golf/courses/tee-resolver.test.ts
git commit -m "feat(courses): tee-resolver — CR/slope reales por color+género+hoyos desde course_tees"
```

### Task 3: Import usa `tee-resolver` (confirm + garmin)

**Files:**
- Modify: `src/app/api/import/confirm/route.ts` (donde hoy toma `round.course_rating`/`slope_rating`, ~líneas 198-202)
- Modify: `src/app/api/import/garmin-zip/route.ts` (~líneas 437-438)

- [ ] **Step 1: confirm route — resolver CR/slope desde tees cuando hay `course_id`**

En `confirm/route.ts`, tras resolver `course_id` y antes de armar la fila: cargar tees del curso y resolver. El archivo es de 368 LOC (bajo el umbral de "sucios"), no requiere refactor previo.

```typescript
import { resolveRatings } from '@/golf/courses/tee-resolver'

// tras tener course_id (o el match):
let cr = round.course_rating ?? null
let slope = round.slope_rating ?? null
let nineHoleRatings: { cr9h: number; slope9h: number } | null = null
if (matchedCourseId) {
  const { data: tees } = await supabase
    .from('course_tees')
    .select('color, course_rating, slope_rating, back_course_rating, back_slope_rating')
    .eq('course_id', matchedCourseId)
  const resolved = tees ? resolveRatings(tees, round.tee_color ?? null, round.holes_played ?? null) : null
  if (resolved) { cr = resolved.cr; slope = resolved.slope; nineHoleRatings = resolved.nineHoleRatings }
}
// el diferencial sale de la canónica con holes + nineHoleRatings:
const diferencial = (cr != null && slope != null)
  ? calcularDiferencial(round.total_gross, cr, slope, round.holes_played ?? null, nineHoleRatings)
  : null
```

> Confirmar nombre exacto de la columna color en `course_tees` (Task 2 Step 1) y el nombre del campo de color en `ImportRoundData` (`tee_color`). Ajustar.

- [ ] **Step 2: garmin-zip route — igual, tras `findBestCourseMatch`**

En `garmin-zip/route.ts` reemplazar `course_rating: sc.teeBoxRating ?? null` por la resolución vía `resolveRatings` cuando `courseMatch` existe; el valor del archivo (`sc.teeBoxRating`) queda solo como fallback si no hay tees.

- [ ] **Step 3: Smoke local de tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/import/confirm/route.ts src/app/api/import/garmin-zip/route.ts
git commit -m "feat(import): resolver CR/slope desde course_tees (no del archivo) en confirm y garmin"
```

---

## FASE 3 — Identidad de cancha (matcher + DB)

### Task 4: Matcher robusto + resolución vía `canonical_course_id`

**Files:**
- Modify: `src/golf/courses/matching.ts`
- Test: `src/__tests__/course-matching.test.ts` (extender)

- [ ] **Step 1: Tests que fallan** — casos reales de prod

```typescript
import { findBestCourseMatch } from '@/golf/courses/matching'

const db = [
  { id: 'fede', nombre: 'C.G. Los Leones (VARONES)', fuente: 'fedegolf', canonical_course_id: null, activa: true },
  { id: 'man',  nombre: 'Club de Golf Los Leones',    fuente: 'manual',   canonical_course_id: null, activa: true },
] as any

test('matchea variantes de nombre muy distintas (Los Leones)', () => {
  expect(findBestCourseMatch('Los Leones', db)?.id).toBeTruthy()
})
test('prefiere la fila fedegolf ante empate', () => {
  expect(findBestCourseMatch('Los Leones', db)?.id).toBe('fede')
})
test('resuelve a través de canonical_course_id', () => {
  const db2 = [
    { id: 'dup', nombre: 'Club de Golf Marbella', fuente: 'manual', canonical_course_id: 'good', activa: false },
    { id: 'good', nombre: 'Club de Golf Marbella', fuente: 'fedegolf', canonical_course_id: null, activa: true },
  ] as any
  expect(findBestCourseMatch('Marbella', db2)?.id).toBe('good')
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test -- course-matching.test.ts`
Expected: FAIL (la firma actual no recibe `fuente`/`canonical_course_id`, no resuelve canónico).

- [ ] **Step 3: Implementar** — agregar edit-distance, preferencia fedegolf, resolución canónica

```typescript
// matching.ts — extender el tipo de candidato y la lógica
interface DbCourse { id: string; nombre: string; fuente?: string | null; canonical_course_id?: string | null; activa?: boolean }

// token-set ratio (Levenshtein normalizado sobre tokens ordenados)
function levenshtein(a: string, b: string): number { /* impl estándar iterativa */ }
function tokenSetRatio(a: string, b: string): number {
  const ta = getSignificantWords(a).sort().join(' ')
  const tb = getSignificantWords(b).sort().join(' ')
  if (!ta || !tb) return 0
  const dist = levenshtein(ta, tb)
  return 1 - dist / Math.max(ta.length, tb.length)
}

export function findBestCourseMatch(externalName: string, candidates: DbCourse[], minScore = 2): CourseMatch | null {
  let best: (CourseMatch & { fuente?: string | null }) | null = null
  for (const c of candidates) {
    const wordScore = matchScore(externalName, c.nombre)              // actual
    const ratio = tokenSetRatio(externalName, c.nombre)               // 0..1
    const score = wordScore + ratio * 5                              // peso fuzzy
    const preferFede = c.fuente === 'fedegolf' ? 0.5 : 0             // desempate
    const total = score + preferFede
    if (score >= minScore && (!best || total > (best as any)._total)) {
      best = { id: c.id, nombre: c.nombre, score, fuente: c.fuente } as any
      ;(best as any)._total = total
      ;(best as any)._canonical = c.canonical_course_id
    }
  }
  if (!best) return null
  // resolver canónico
  const canonicalId = (best as any)._canonical
  if (canonicalId) {
    const canon = candidates.find(c => c.id === canonicalId)
    if (canon) return { id: canon.id, nombre: canon.nombre, score: best.score }
  }
  return { id: best.id, nombre: best.nombre, score: best.score }
}
```

> Los umbrales exactos (`minScore`, peso fuzzy 5, preferFede 0.5) se afinan en eng-review contra el set de casos reales. Mantener `matchScore`/`getSignificantWords` existentes.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm run test -- course-matching.test.ts`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/golf/courses/matching.ts src/__tests__/course-matching.test.ts
git commit -m "feat(matching): fuzzy edit-distance + preferir fedegolf + resolver canonical_course_id"
```

### Task 5: `fedegolf-sync.ts` idempotente

**Files:**
- Modify: `scripts/fedegolf-sync.ts` (~línea 142)

- [ ] **Step 1: Cambiar `.insert(courseRow)` por upsert sobre la llave natural FedeGolf**

```typescript
// antes: .from('courses').insert(courseRow)
// después:
await supabase.from('courses')
  .upsert(courseRow, { onConflict: 'fuente_externa_id' }) // confirmar nombre de la col de id FedeGolf
```

> Step 0: confirmar qué columna identifica unívocamente la cancha FedeGolf (`fuente_externa_id`/`fedegolf_id`/etc.) via introspección. Si no existe, agregarla en la migración de la Task 6 y poblarla.

- [ ] **Step 2: Commit**

```bash
git add scripts/fedegolf-sync.ts
git commit -m "fix(fedegolf-sync): upsert idempotente para no duplicar canchas al re-sincronizar"
```

### Task 6: Migración — `canonical_course_id` + índice único parcial

**Files:**
- Create: `supabase/migrations/0XX_course_canonical.sql` (numerar según el último en `supabase/migrations/`)

- [ ] **Step 1: Confirmar el último número de migración**

Run: `ls supabase/migrations/ | sort | tail -3`

- [ ] **Step 2: Escribir la migración**

```sql
-- 0XX_course_canonical.sql
ALTER TABLE courses ADD COLUMN IF NOT EXISTS canonical_course_id uuid REFERENCES courses(id);

-- columna generada de nombre canónico (immutable-safe: lower + sin paréntesis de género)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS nombre_canonico text
  GENERATED ALWAYS AS (
    lower(regexp_replace(nombre, '\s*\((DAMAS|VARONES|CABALLEROS)\)\s*', '', 'gi'))
  ) STORED;

-- género derivado del sufijo (para no colapsar DAMAS/VARONES)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS genero_norm text
  GENERATED ALWAYS AS (
    CASE WHEN nombre ~* '\(DAMAS\)' THEN 'D'
         WHEN nombre ~* '\(VARONES\)|\(CABALLEROS\)' THEN 'V'
         ELSE 'X' END
  ) STORED;

-- piso duro: no dos canchas activas con mismo nombre canónico + género + fuente
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_canonico_genero_fuente
  ON courses (nombre_canonico, genero_norm, fuente)
  WHERE activa = true AND canonical_course_id IS NULL;
```

> El índice excluye filas que ya son alias (`canonical_course_id IS NOT NULL`) y desactivadas. La llave (nombre_canonico, genero, fuente) se valida en eng-review — en particular si conviene incluir `fuente` o unificar cross-fuente.

- [ ] **Step 3: Aplicar la migración (dry: primero sin el índice único para ver si hay choques)**

Run: `node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/0XX_course_canonical.sql`
Expected: si el `CREATE UNIQUE INDEX` falla por duplicados existentes, **es esperado** — significa que hay que correr el Barrido A (Task 7) ANTES de crear el índice. Dividir: aplicar columnas ahora, el índice único después del barrido.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0XX_course_canonical.sql
git commit -m "feat(db): canonical_course_id + nombre_canonico + índice único parcial anti-duplicados"
```

---

## FASE 4 — Barrido A: dedup de canchas (base-wide, sin tocar hándicaps)

### Task 7: Script `barrido-dedup-canchas.mjs`

**Files:**
- Create: `scripts/barrido-dedup-canchas.mjs`
- Backup: `scripts/backups/dedup-canchas-20260604.json` (gitignored)

- [ ] **Step 1: Backup previo** — dump de `courses` + `historical_rounds(course_id,course_name)` + `rondas_libres` afectadas a JSON.

- [ ] **Step 2: Detectar clusters** de duplicados reales (mismo `nombre_canonico` + `genero_norm`, **excluyendo** pares DAMAS/VARONES legítimos = cuando difieren solo en género NO se mergean). Elegir canónica: preferir `fuente='fedegolf'`; si no, la de más uso (más rondas/usuarios).

- [ ] **Step 3: Para cada cluster** — repuntar `historical_rounds.course_id` y `rondas_libres.course_id` (y cualquier FK) de las duplicadas → canónica; setear `canonical_course_id = <canónica>` + `activa=false` en las duplicadas.

- [ ] **Step 4: Backfill `course_id`** en las 129 rondas con texto libre que ahora matcheen con `findBestCourseMatch` y confianza alta (las de confianza media/baja se loguean, no se tocan).

- [ ] **Step 5: Verificación** — re-correr el diagnóstico (`scripts/import-hardening-diagnostic.sql` query 1): 0 clusters de duplicados reales activos; reportar cuántos `course_id` se backfillearon.

- [ ] **Step 6: Crear el índice único** (la parte que faltó de la Task 6 Step 3) ahora que no hay duplicados.

- [ ] **Step 7: Commit**

```bash
git add scripts/barrido-dedup-canchas.mjs
git commit -m "chore(barrido): dedup de canchas duplicadas + backfill course_id (base-wide, reversible)"
```

---

## FASE 5 — Barrido B: re-derivar el índice de Juanjo

### Task 8: Script `barrido-reindex-juanjo.mjs`

**Files:**
- Create: `scripts/barrido-reindex-juanjo.mjs`
- Backup: `scripts/backups/reindex-juanjo-20260604.json` (gitignored)

- [ ] **Step 1: Backup** de las rondas de `98c5cb7a` (todas las columnas).

- [ ] **Step 2: Reporte BEFORE** — índice actual + las 71 rondas que alimentan, ordenadas por diferencial (identificar la −10.14 y el 35.61).

- [ ] **Step 3: Re-derivar por ronda** — para cada ronda con `course_id`: cargar tees, `resolveRatings(tees, tee_color, holes_played)`, recomputar CR/slope/diferencial con la canónica. Clasificar:
  - Resuelta con confianza → actualizar CR/slope/diferencial.
  - Sin tee resoluble / cancha extranjera → `excluded_from_handicap = true` (no se inventa).

- [ ] **Step 4: Re-correr el RPC** — `SELECT calcular_indice_golfers('98c5cb7a-...')`.

- [ ] **Step 5: Reporte AFTER** — índice nuevo + diff por ronda. Entregable a Juanjo. **Checkpoint: mostrar a Juanjo antes de dar por cerrado** (toca su hándicap).

- [ ] **Step 6: Commit**

```bash
git add scripts/barrido-reindex-juanjo.mjs
git commit -m "chore(barrido): re-derivar índice de Juanjo desde course_tees + reporte before/after"
```

---

## FASE 6 — Validación y follow-up

### Task 9: Suite completa + pre-push

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errores
- [ ] **Step 2:** `npm run test` → todo verde (incluidos canarios)
- [ ] **Step 3:** `npm run build` → exitoso
- [ ] **Step 4:** Health check `GET /api/admin/health-check` → reportar passed/warn/failed
- [ ] **Step 5:** Smoke real: importar una ronda de prueba (cancha duplicada conocida + 9h) y verificar que linkea a la canónica con CR/slope correctos; limpiar después.

### Task 10: Documentar follow-up — cap de net-double-bogey

- [ ] **Step 1:** Crear `docs/superpowers/specs/follow-up-net-double-bogey.md` con: por qué quedó fuera (course handicap por ronda no se guarda; no afecta el índice; solo display), y el diseño propuesto (computar course handicap del índice vigente para imports NUEVOS, dejar histórico sin capar).
- [ ] **Step 2:** Entrada en `docs/SPRINT_LOG.md` + actualizar `docs/REORDENAMIENTO_TRACKING.md` si se tocó algún archivo "sucio".
- [ ] **Step 3:** Commit docs.

---

## Self-Review (cobertura del spec)

- Pieza 1 (identidad) → Tasks 4, 5, 6, 7 ✓
- Pieza 2 (tee/CR/slope) → Tasks 2, 3 ✓
- Pieza 3 (diferencial único) → Task 1 ✓
- Barrido A (base-wide) → Task 7 ✓
- Barrido B (Juanjo) → Task 8 ✓
- Net-double-bogey → explícitamente diferido (Task 10) con justificación ✓
- RPC no se toca → respetado (Task 8 solo lo re-ejecuta) ✓
- Tests por pieza + smoke + pre-push → Task 9 ✓
