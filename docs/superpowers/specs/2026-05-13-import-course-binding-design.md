# Spec — Fix de import: vinculación de course_id + pares por hoyo

**Fecha:** 2026-05-13
**Autor:** Claude (CTO) — brainstorm con Juanjo
**Branch:** `fix/import-course-binding-claude`
**Prioridad:** P0 — bug en producción afectando confianza del usuario
**Trigger:** Juan Jose Ruiz (`a66d5071-250a-4f8b-a67b-9c6b00297d20`) reportó vía WhatsApp el 13-may-2026: birdies inventados en su tarjeta de Los Leones, tAIger pidiendo pares manualmente

---

## Resumen ejecutivo

El flujo de import de rondas históricas en `historical_rounds` está dejando filas con `course_id`, `par_per_hole`, `course_rating` y `slope_rating` en `null`. La UI defaultea a par=4 en todos los hoyos cuando faltan pares, generando birdies/bogeys/pares incorrectos visibles al usuario. tAIger detecta la inconsistencia y se niega a analizar, pero el mensaje resultante culpa al usuario en lugar de a la app.

Root cause: el endpoint `/api/import/confirm` (líneas 211-223 de `src/app/api/import/confirm/route.ts`) construye el `InsertRow` ignorando el campo `par_per_hole` aunque el OCR de Gemini lo extrae correctamente en el preview, y nunca llama al fuzzy lookup que existe en `src/lib/import-round.ts`.

Scope del bug: 158 rondas huérfanas (`course_id IS NULL`) en producción, distribuidas en 13 usuarios y 3 flujos de import (`photo_scan: 16`, `manual: 49`, `garmin_zip: 93`).

Este spec resuelve el problema definitivamente y enriquece la BD orgánicamente: cada import futuro que detecte una cancha no registrada (o una registrada sin `course_holes` poblados) la inserta/completa usando los pares extraídos del OCR.

---

## Out of scope (explícito)

Los siguientes temas **no** se abordan en este spec:

- **WHS / diferencial / Course Rating / Slope.** El tee de salida no afecta los pares, por tanto no es necesario para el bug visible (tarjeta + tAIger). Las rondas creadas dentro de la app (ronda libre, campeonato) ya capturan tee en su formulario. Los imports históricos quedan con `tee_color`, `course_rating`, `slope_rating` en `null`; el diferencial WHS de esa ronda específica no se calcula. Se podrá completar manualmente por el usuario en un feature futuro.
- **Consolidación VARONES/DAMAS en `courses`.** 136 de 137 records de fuente='fedegolf' tienen sufijo `(DAMAS)` o `(VARONES)`; los 69 clubes reales quedan duplicados. Es bug de seed que merece su propio spec/plan/migration con FK rewiring. Este spec **tolera** la duplicación con un matcher normalizador.
- **Constraint `NOT NULL` en `historical_rounds.course_id`.** Se admite `null` como caso edge legítimo (OCR falla, club no matcheable) con UI honesta.
- **Error de conexión en tAIger chat.** Sin logs no se puede confirmar root cause; issue separado.
- **UI cosméticos** (padding del input, mensajes cortados en bubbles del chat). Issues P2 separados.
- **System prompt de tAIger** que culpa al usuario ("registrá desde la app con la cancha seleccionada"). Spec separado: refinar tone para no transferir culpa cuando la app falla.
- **Stroke Index extraído del OCR.** Gemini no lo extrae hoy. Follow-up: ampliar schema del prompt + UI fallback.
- **Admin queue para revisar `courses` con `fuente='user_added'`.** Mitigación de typos OCR. Backlog futuro.

---

## Arquitectura

### Componentes

```
┌──────────────────────────────────────────────────────────────────┐
│                       Endpoints de import                         │
│  POST /api/import/confirm         (photo scan, batch confirm)     │
│  POST /api/rounds/import          (single manual import)          │
│  POST /api/import/garmin-zip      (garmin ZIP)                    │
└──────────────────────────┬───────────────────────────────────────┘
                           │ todos delegan a ↓
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│   src/lib/import-round.ts → importRound() (EXTENDIDO)             │
│                                                                   │
│   • Acepta parPerHole? como input nuevo                           │
│   • Llama resolveCourse() (submódulo nuevo)                       │
│   • Persiste par_per_hole en historical_rounds                    │
│   • Mantiene firma backward-compatible                            │
└──────────────────────────┬───────────────────────────────────────┘
                           │ depende de ↓
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│   src/lib/resolve-course.ts → resolveCourse() (NUEVO)             │
│                                                                   │
│   Input:  { courseName, parPerHole?, supabase }                   │
│   Output: { courseId, courseCreated, holesPopulated }             │
│                                                                   │
│   • Normaliza nombre (sin tildes, sin género, lowercase, trim)    │
│   • Fuzzy match con pg_trgm similarity > 0.8                      │
│   • Si match con holes vacío + parPerHole disponible → POBLAR     │
│   • Si no hay match razonable + parPerHole disponible → CREAR     │
│   • Idempotente, transaccional dentro del supabase tx             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│   scripts/backfill-historical-rounds.mjs (NUEVO, CLI)             │
│                                                                   │
│   • Procesa filas WHERE course_id IS NULL OR par_per_hole IS NULL │
│   • Usa el mismo resolveCourse()                                  │
│   • Modo --dry-run por default                                    │
│   • Reporta paths: A (metadata), B (lookup), C (unresolved)       │
└──────────────────────────────────────────────────────────────────┘
```

### Invariante post-fix

Toda fila nueva en `historical_rounds` cumple **al menos uno** de:

1. `par_per_hole IS NOT NULL` (OCR aportó pares directos)
2. `course_id IS NOT NULL` AND existe `course_holes` poblado para ese curso

→ La UI siempre puede renderizar pares reales por hoyo.

Solo quedan en estado degradado las filas que cumplen ninguna de las dos. Para esas la UI muestra "—" honestamente.

---

## Data flow

### Flujo nuevo: photo scan import (caso JJ Ruiz)

```
1. Usuario sube foto en /perfil/importar
   └─→ POST /api/import/screenshot (sin cambios — ya extrae par_per_hole)
       └─→ Gemini retorna { course_name, scores[18], par_per_hole{1..18}, ... }
       └─→ Frontend recibe preview con par_per_hole

2. Usuario confirma
   └─→ POST /api/import/confirm
       payload: { rounds: [{ ..., par_per_hole: {...}, course_name, scores, ... }] }

3. confirm/route.ts (REFACTOR):
   for round in rounds:
     await importRound(supabase, {
       userId: user.id,
       courseName: round.course_name,
       parPerHole: round.par_per_hole,        ← NUEVO
       scores: round.scores,
       playedAt: round.played_at,
       source: 'photo_scan',
       totalGross: round.total_gross,
       metadata: round.metadata ?? {},
       holesPlayed: round.holes_played,
     })

4. importRound() ejecuta:
   a. resolveCourse({ courseName, parPerHole, supabase })
      → { courseId, courseCreated, holesPopulated }
   b. Construye row {
        user_id, course_name, course_id,
        par_per_hole: parPerHole,             ← persistido siempre
        scores, total_gross, ...,
        formato_juego, modo_juego, ...
      }
   c. INSERT en historical_rounds
   d. Retorna { roundId, warnings: [...] }

5. UI de detalle (/perfil/historial/[id]) renderiza:
   • Para cada hoyo i:
     const par = row.par_per_hole?.[String(i+1)] ?? null
     if (par !== null):
        clase = computeHoleClass(scores[i], par)   // birdie/par/bogey/...
     else:
        muestra "—" con stats con asterisco "*"
```

### Flujo backfill (one-shot)

```
node scripts/backfill-historical-rounds.mjs [--dry-run] [--user-id <uuid>] [--limit N]

Por cada row WHERE (course_id IS NULL OR par_per_hole IS NULL):

  Path A — Tiene par_per_hole en metadata (data FUTURA, no aplica a las 158 actuales):
    → Mover a columna directa
    → resolveCourse(courseName, parPerHole)

  Path B — Lookup en BD por nombre:
    → resolveCourse(courseName, null) → courseId
    → Si courseId resuelto:
        Si course_holes existe → leer pares → escribir par_per_hole
        Si course_holes vacío → log "B-empty", queda null (course_id sí se setea)
    → Si courseId no resuelto → log "B-unresolved", queda null

  Path C — Caso degradado (irresoluble):
    → Log "unresolved", deja la fila intacta

Output JSON:
{
  total: 158,
  processed: { path_a: N, path_b: M, path_c: K },
  courses_created: X,
  courses_holes_populated: Y,
  errors: [...]
}
```

**Realidad del estado actual (verificado en DB 13-may-2026):** las 158 huérfanas reales tienen `par_per_hole` y `metadata.par_per_hole` ambos `null`. Por lo tanto el backfill iterará **0 vía Path A**, todo lo demás Path B o C. Estimación:

- Photo_scan (16): course_name extraído por OCR. Probable match con FedeGolf si la cancha está cubierta (>80%).
- Manual (49): course_name lo escribió el usuario. Probable match si está bien escrito; algunos typos esperables.
- Garmin_zip (93): course_name de Garmin (sintetizado por su sistema). Match probabilidad moderada — Garmin a veces usa nombres internos distintos.

Si Path B no resuelve para garmin_zip masivamente, evaluar agregar mapping curado Garmin→courses en una segunda pasada (no scope de este spec).

---

## Componente detallado: `resolveCourse()`

### Firma

```ts
// src/lib/resolve-course.ts

export interface ResolveCourseInput {
  supabase: SupabaseClient
  courseName: string
  parPerHole?: Record<string, number> | null  // del OCR si está disponible
  options?: {
    similarityThreshold?: number    // default 0.8
    createIfMissing?: boolean       // default true
    populateHolesIfEmpty?: boolean  // default true
  }
}

export interface ResolveCourseResult {
  courseId: string | null
  courseCreated: boolean
  holesPopulated: boolean
  matchScore: number | null       // 0..1, null si fue creado
  warnings: string[]
}

export async function resolveCourse(input: ResolveCourseInput): Promise<ResolveCourseResult>
```

### Algoritmo

```
1. Normalizar courseName:
   - lowercase
   - trim
   - sin tildes (unaccent)
   - sin sufijos " (DAMAS)" o " (VARONES)" (case insensitive)
   - colapsar espacios múltiples

2. Buscar candidatos en `courses` con pg_trgm:
   SELECT id, nombre, par_total, similarity(unaccent(lower(nombre)), $normalized) AS score
   FROM courses
   WHERE similarity(unaccent(lower(nombre)), $normalized) > 0.5
   ORDER BY score DESC
   LIMIT 5

3. Filtrar candidatos:
   - Tomar el de score más alto.
   - Si score > similarityThreshold (default 0.8) → match.
   - Si score <= threshold → no match.

4. Si HAY match:
   a. courseId = match.id
   b. Si populateHolesIfEmpty y parPerHole !== null:
        Verificar si course_holes existe para courseId.
        Si vacío → INSERT 18 filas con par del parPerHole.
        Setear holesPopulated = true.
   c. Retornar { courseId, matchScore: score, ... }

5. Si NO HAY match:
   a. Si !createIfMissing o !parPerHole → retornar { courseId: null, ... }
   b. INSERT en courses {
        nombre: courseName (original, no normalizado, para legibilidad),
        par_total: sum(values(parPerHole)),
        fuente: 'user_added',
        activa: true,
        pais: 'CL'  // default, puede refinarse
      }
   c. INSERT en course_holes 18 filas (numero, par desde parPerHole).
   d. Retornar { courseId: new.id, courseCreated: true, holesPopulated: true }
```

### Atomicidad

`resolveCourse()` debe ejecutarse dentro de la **misma transacción** que el insert en `historical_rounds`. Si el insert falla, los registros de `courses` / `course_holes` creados deben rollbackear.

Supabase JS no expone transacciones nativas explícitas para múltiples writes; **se usa una función RPC en Postgres** que encapsula la transacción:

```sql
CREATE OR REPLACE FUNCTION resolve_and_link_course(
  p_course_name text,
  p_par_per_hole jsonb,
  p_similarity_threshold real DEFAULT 0.8
) RETURNS jsonb AS $$
  -- lógica del algoritmo en plpgsql
  -- retorna { course_id, course_created, holes_populated, match_score }
$$ LANGUAGE plpgsql;
```

`resolveCourse()` JS llama a la función vía `supabase.rpc('resolve_and_link_course', ...)`. La función RPC garantiza atomicidad.

### Edge cases

- **`parPerHole` con menos de 18 entradas** (ronda de 9 hoyos): la función infiere `holes_played` desde el tamaño. Solo crea/puebla `course_holes` si recibe 18 hoyos completos. 9 hoyos no crea course nuevo (no es 18-hole layout completo, mejor diferir).
- **`courseName` vacío o `'Cancha desconocida'`**: retorna `{ courseId: null, ... }` sin intentar match ni create.
- **Race condition** entre dos imports concurrentes del mismo club nuevo: la RPC usa `INSERT ... ON CONFLICT (nombre) DO NOTHING RETURNING id`. Si dos usuarios crean al mismo tiempo, el segundo lee el ID del primero. Constraint `UNIQUE(nombre, fuente)` agregado.

---

## Migration

**Nota:** el SQL siguiente es un **draft accionable**. La fase de plan (writing-plans) va a ajustar:
- Tipos exactos de columnas (revisar `pais` que aparece como NULL en algunos courses existentes).
- Manejo de race conditions con `xmax = 0` para detectar inserts reales vs conflict-update.
- Permisos exactos del SECURITY DEFINER (debe correr como service_role para evitar RLS).
- Sintaxis precisa de `ON CONFLICT ... WHERE` con índice parcial expression-based.

```sql
-- 2026-05-13-import-course-binding.sql

-- 1. Habilitar pg_trgm si no está
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Índice GIN para fuzzy match rápido
CREATE INDEX IF NOT EXISTS idx_courses_nombre_trgm
  ON courses USING gin (unaccent(lower(nombre)) gin_trgm_ops);

-- 3. Constraint para evitar duplicados exactos de courses de user_added
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_user_added_nombre
  ON courses (lower(nombre))
  WHERE fuente = 'user_added';

-- 4. Función RPC resolve_and_link_course
CREATE OR REPLACE FUNCTION resolve_and_link_course(
  p_course_name text,
  p_par_per_hole jsonb DEFAULT NULL,
  p_similarity_threshold real DEFAULT 0.8
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_normalized text;
  v_match_id uuid;
  v_match_score real;
  v_holes_count int;
  v_par_total int;
  v_new_course_id uuid;
  v_created boolean := false;
  v_populated boolean := false;
BEGIN
  -- Normalizar nombre
  v_normalized := lower(unaccent(trim(regexp_replace(p_course_name, '\s*\((damas|varones)\)\s*', '', 'gi'))));
  v_normalized := regexp_replace(v_normalized, '\s+', ' ', 'g');

  -- Fuzzy match
  SELECT id, similarity(unaccent(lower(nombre)), v_normalized)
  INTO v_match_id, v_match_score
  FROM courses
  WHERE similarity(unaccent(lower(nombre)), v_normalized) > 0.5
  ORDER BY similarity(unaccent(lower(nombre)), v_normalized) DESC
  LIMIT 1;

  IF v_match_id IS NOT NULL AND v_match_score >= p_similarity_threshold THEN
    -- HAY match. ¿course_holes vacío y tenemos pares?
    IF p_par_per_hole IS NOT NULL THEN
      SELECT COUNT(*) INTO v_holes_count FROM course_holes WHERE course_id = v_match_id;
      IF v_holes_count = 0 THEN
        INSERT INTO course_holes (course_id, numero, par)
        SELECT v_match_id, (k::int), (val::int)
        FROM jsonb_each_text(p_par_per_hole) AS j(k, val);
        v_populated := true;
        -- Actualizar par_total del course matcheado
        UPDATE courses SET par_total = (SELECT SUM(par) FROM course_holes WHERE course_id = v_match_id)
        WHERE id = v_match_id;
      END IF;
    END IF;
    RETURN jsonb_build_object('course_id', v_match_id, 'course_created', false,
                              'holes_populated', v_populated, 'match_score', v_match_score);
  END IF;

  -- NO match. ¿Podemos crear?
  IF p_par_per_hole IS NULL THEN
    RETURN jsonb_build_object('course_id', null, 'course_created', false,
                              'holes_populated', false, 'match_score', v_match_score);
  END IF;

  -- Crear course + course_holes
  v_par_total := (SELECT SUM(val::int) FROM jsonb_each_text(p_par_per_hole) AS j(k, val));

  INSERT INTO courses (nombre, par_total, fuente, activa, pais)
  VALUES (p_course_name, v_par_total, 'user_added', true, 'CL')
  ON CONFLICT (lower(nombre)) WHERE fuente = 'user_added' DO UPDATE SET nombre = EXCLUDED.nombre
  RETURNING id INTO v_new_course_id;

  IF NOT FOUND THEN
    -- Race condition: otro proceso ya creó. Leer el ID.
    SELECT id INTO v_new_course_id FROM courses
    WHERE lower(nombre) = lower(p_course_name) AND fuente = 'user_added' LIMIT 1;
  ELSE
    v_created := true;
    INSERT INTO course_holes (course_id, numero, par)
    SELECT v_new_course_id, (k::int), (val::int)
    FROM jsonb_each_text(p_par_per_hole) AS j(k, val);
    v_populated := true;
  END IF;

  RETURN jsonb_build_object('course_id', v_new_course_id, 'course_created', v_created,
                            'holes_populated', v_populated, 'match_score', null);
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_and_link_course(text, jsonb, real) TO authenticated, service_role;
```

---

## Componente extendido: `importRound()`

### Cambios en firma

```ts
// src/lib/import-round.ts (DIFF)

export interface ImportRoundInput {
  userId: string
  courseName: string
  courseId?: string | null
  parPerHole?: Record<string, number> | null   // ← NUEVO
  teeColor?: string | null
  playedAt: string
  scores: number[]
  totalGross?: number | null
  notes?: string | null
  privacy?: 'public' | 'private'
  source: ImportSource
  metadata?: Record<string, unknown>
}
```

### Cambios en lógica

Reemplaza el bloque "Vincular course_id" (líneas 79-103) con:

```ts
// ── Resolver course (vincular + opcionalmente crear/enriquecer) ──
let courseId = input.courseId || null
let resolveResult: ResolveCourseResult | null = null
if (!courseId && input.courseName) {
  resolveResult = await resolveCourse({
    supabase,
    courseName: input.courseName,
    parPerHole: input.parPerHole ?? null,
  })
  courseId = resolveResult.courseId
  warnings.push(...resolveResult.warnings)
  if (resolveResult.courseCreated) {
    warnings.push(`Cancha creada: ${input.courseName}`)
  }
}

// ── Determinar par_per_hole final ──
// Prioridad: 1) input.parPerHole (OCR) → 2) course_holes lookup → 3) null
let finalParPerHole: Record<string, number> | null = input.parPerHole ?? null
if (!finalParPerHole && courseId) {
  const { data: holes } = await supabase
    .from('course_holes')
    .select('numero, par')
    .eq('course_id', courseId)
    .order('numero')
  if (holes && holes.length > 0) {
    finalParPerHole = Object.fromEntries(holes.map(h => [String(h.numero), h.par]))
  }
}
```

Y en el `.insert(...)` del row, agregar:

```ts
par_per_hole: finalParPerHole,
```

---

## Refactor de los 3 endpoints

### `/api/import/confirm/route.ts`

Reemplazar el bloque de `rowsToInsert.push(row)` (líneas 211-243) con un loop que llama a `importRound()` por cada round. Mantener:
- Detección de duplicados (línea 203-208)
- Manejo especial de Garmin (upsert por `garmin_scorecard_id`)
- Recálculo de CPI al final

### `/api/rounds/import/route.ts`

Ya usa `importRound()` (es el único que lo hace). Solo agregar `parPerHole` al payload aceptado por Zod.

### `/api/import/garmin-zip/route.ts`

Garmin ya hace lookup contra `course_holes` (línea 230-241) y tiene los pares por ronda en `holesByCourseId`. Refactor: en lugar de hacer `.insert()` directo a `historical_rounds`, construir el `parPerHole` jsonb desde `holesByCourseId.get(courseId)` (`{1: par, 2: par, ...}`) y pasarlo a `importRound()`. Si Garmin no reporta `course_id` matcheable, `importRound()` cae a `resolveCourse()` con el courseName como en los otros flujos.

---

## UI honesty

### Componentes: `src/app/perfil/historial/[id]/page.tsx` y `src/app/tarjeta/[id]/page.tsx`

Cuando renderiza la tarjeta:

```tsx
// Antes (asumido):
const par = HOLE_PARS[i] ?? 4  // ← defaultea a 4
const klass = computeHoleClass(score, par)

// Después:
const par = round.par_per_hole?.[String(i+1)] ?? null
const klass = par !== null ? computeHoleClass(score, par) : 'unknown'
```

Cuando `par === null` para uno o más hoyos:
- Renderiza "—" en la celda "Par"
- Stats agregados (`X Birdies, Y Pares, Z Bogeys`) con asterisco: `4 Bogeys*`
- Banner sutil: `* Pares por hoyo no confirmados. Editá la cancha para completar el análisis.`

### Componente: tarjeta del usuario (la screenshot que vimos hoy)

Mismo cambio. La función que dibuja los cuadrados de score (los rojos, azules) debe consumir `par_per_hole` desde la ronda, no asumir par=4.

---

## Backfill — `scripts/backfill-historical-rounds.mjs`

### Estructura

```javascript
#!/usr/bin/env node
// scripts/backfill-historical-rounds.mjs

import { createClient } from '@supabase/supabase-js'

const args = parseArgs(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const USER_ID = args.get('--user-id') || null
const LIMIT = parseInt(args.get('--limit') || '0', 10) || null

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  let query = supabase
    .from('historical_rounds')
    .select('id, user_id, course_id, course_name, par_per_hole, metadata, scores, holes_played')
    .or('course_id.is.null,par_per_hole.is.null')
    .order('played_at', { ascending: true })

  if (USER_ID) query = query.eq('user_id', USER_ID)
  if (LIMIT) query = query.limit(LIMIT)

  const { data: rows, error } = await query
  if (error) throw error

  const stats = { total: rows.length, path_a: 0, path_b: 0, path_c: 0, created: 0, populated: 0 }
  const errors = []

  for (const row of rows) {
    try {
      const path = await processRow(row, DRY_RUN)
      stats[path]++
    } catch (e) {
      errors.push({ rowId: row.id, error: e.message })
    }
  }

  console.log(JSON.stringify({ stats, errors, dry_run: DRY_RUN }, null, 2))
}

async function processRow(row, dryRun) {
  // Key canónica en metadata: `par_per_hole` (snake_case, matching DB column).
  // `parPerHole` (camelCase) se ignora — no se usa en el codebase actual.
  const metaPars = row.metadata?.par_per_hole || null
  let parPerHole = row.par_per_hole || metaPars || null

  // Path A: metadata.par_per_hole existe → mover a columna directa
  // Path B: no, solo lookup BD
  // Path C: nada funciona

  const result = await supabase.rpc('resolve_and_link_course', {
    p_course_name: row.course_name,
    p_par_per_hole: parPerHole,
    p_similarity_threshold: 0.8,
  })

  const { course_id, course_created, holes_populated, match_score } = result.data

  // Si no tenemos parPerHole pero ahora tenemos courseId, leer course_holes
  if (!parPerHole && course_id) {
    const { data: holes } = await supabase
      .from('course_holes')
      .select('numero, par')
      .eq('course_id', course_id)
    if (holes && holes.length > 0) {
      parPerHole = Object.fromEntries(holes.map(h => [String(h.numero), h.par]))
    }
  }

  if (!dryRun) {
    await supabase
      .from('historical_rounds')
      .update({
        course_id: course_id || row.course_id,
        par_per_hole: parPerHole || row.par_per_hole,
      })
      .eq('id', row.id)
  }

  // Clasificar path
  if (metaPars) return 'path_a'
  if (parPerHole) return 'path_b'
  return 'path_c'
}

main().catch(e => { console.error(e); process.exit(1) })
```

### Run plan

1. **Local dev:** `node scripts/backfill-historical-rounds.mjs --dry-run --limit 10` → revisar output.
2. **Single user (JJ Ruiz):** `--dry-run --user-id a66d5071-...`.
3. **Single user real:** sin `--dry-run`, mismo user.
4. **Full prod:** sin `--dry-run` ni filtros. Idempotente, safe.

---

## Error handling

| Caso | Comportamiento |
|------|----------------|
| OCR de Gemini falla en `par_per_hole` | Preview muestra advertencia "no detectamos los pares". Usuario puede ingresarlos manualmente o seguir → ronda queda con `par_per_hole: null`, UI honesta. |
| Matcher no encuentra cancha y no hay `parPerHole` | `course_id: null`, UI honesta. Ronda guardada igual. |
| RPC `resolve_and_link_course` falla | `importRound()` retorna error con warning específico. Frontend muestra mensaje y permite reintento. |
| Backfill encuentra fila con courseName vacío | Path C (unresolved), log y skip. |
| Constraint `UNIQUE(lower(nombre)) WHERE fuente='user_added'` violado | RPC maneja con re-read del id existente. Idempotente. |
| Course creado con typo OCR (ej: "Las Brizas") | Mitigación: threshold 0.8 estricto. Aceptamos riesgo residual. Backlog: admin review queue para `fuente='user_added'`. |

---

## Testing

### Unit tests

`src/__tests__/resolve-course.test.ts` (NUEVO):
- Normalización de nombre (acentos, género, casing).
- Match con score alto → vincula courseId.
- Match con score < threshold → no vincula.
- No match + parPerHole → crea course nuevo.
- No match + sin parPerHole → retorna null.
- Match con course_holes vacío + parPerHole → puebla holes.
- Race condition (dos creates simultáneos del mismo club).

`src/__tests__/import-round.test.ts` (EXTENDER):
- Persiste `par_per_hole` cuando viene en input.
- Llama a `resolveCourse()` y propaga warnings.
- Backward compat: input sin `parPerHole` sigue funcionando.

### Integration tests

`src/__tests__/audit/F9-import.test.ts` (EXTENDER):
- E2E: photo scan flow completo → verifica `par_per_hole` y `course_id` en la fila resultante.
- Caso: club no existe en BD → verifica que `courses` ahora tiene una nueva fila con `fuente='user_added'`.
- Caso: club existe sin holes → verifica que `course_holes` ahora tiene 18 filas.

### E2E test

`e2e/import-photo-scan.spec.ts` (NUEVO):
- Mock de Gemini response con par_per_hole.
- Subir foto → confirmar → ir a /perfil/historial/[id] → verificar pares mostrados ≠ todos 4.

### Backfill test

`scripts/backfill-historical-rounds.mjs` con `--dry-run` en staging/dev DB con fixtures:
- 1 row con metadata.par_per_hole → debe ir a path_a.
- 1 row con course_name matcheable y course_holes en BD → path_b.
- 1 row con course_name no matcheable → path_c.

---

## Rollout

### Fase 1 — Migration + RPC (no requiere deploy de app)

1. Aplicar `2026-05-13-import-course-binding.sql` en staging.
2. Smoke test de la RPC con queries manuales.
3. Aplicar en prod.

### Fase 2 — Deploy del fix de código

4. Merge PR a main con:
   - `src/lib/resolve-course.ts` (nuevo)
   - `src/lib/import-round.ts` (extendido)
   - 3 endpoints refactoreados
   - UI honesty changes
   - Tests
5. Verificar en preview deploy: hacer un photo scan real → confirmar pares correctos.
6. Promover a producción.

### Fase 3 — Backfill

7. Correr `node scripts/backfill-historical-rounds.mjs --dry-run` en prod (con service role key).
8. Revisar output. Si stats razonables → correr sin `--dry-run`.
9. Verificar manualmente la ronda de JJ Ruiz `bbcdec66-5181-445c-9b0f-1680ec55f153`: `par_per_hole` debe estar poblado.

### Fase 4 — Comunicación al usuario

10. Mensaje a JJ Ruiz por WhatsApp (Juanjo redacta usando el template propuesto en la conversación de brainstorm):
    > "Hola Juan Jose, identificamos el bug que reportaste. La app no estaba guardando los pares por hoyo de tus tarjetas importadas, por eso tAIger te decía que no tenía datos y la tarjeta marcaba birdies que no hiciste. Tu historial ya está corregido — los pares ahora son los reales de cada cancha. Disculpá la confusión, fue 100% culpa de la app, no tuya."

### Fase 5 — Monitoring

11. Dashboard simple: cuántos `historical_rounds` se crean por día con `course_id IS NULL` y `par_per_hole IS NULL` post-fix. Esperado: ~0.
12. Alerta si más de 5% de imports diarios resultan en course `fuente='user_added'` (señal de OCR mal leyendo nombres o de muchos clubes nuevos).

---

## Métricas de éxito

- **Inmediato (24h post-fix):**
  - Ronda 13-05 de JJ Ruiz muestra pares reales en su tarjeta.
  - tAIger analiza esa ronda sin pedir pares al usuario.
  - 158 → 0 (o muy cerca) rondas con `course_id IS NULL` y `par_per_hole IS NULL`.

- **Sostenido (7d post-fix):**
  - 0 rondas nuevas creadas con `par_per_hole IS NULL`.
  - 0 reports de usuarios sobre birdies/pares incorrectos en tarjetas.
  - `courses.fuente='user_added'` aumenta orgánicamente con cada club nuevo (esperado: 1-3 por semana).

- **Tech:**
  - F9-import.test.ts: 100% pass.
  - resolve-course.test.ts: 100% pass.
  - Cobertura de los 3 endpoints de import: ≥80%.

---

## Apéndice — Snapshot del estado actual (13-may-2026)

### Rondas afectadas (audit pre-fix)

```
import_source     | total | sin_pares | usuarios
------------------+-------+-----------+----------
photo_scan        |   16  |    16     |    2
manual            |   49  |    49     |   10
garmin_zip        |   93  |    93     |    1
TOTAL             |  158  |   158     |   13
```

### Ronda específica del incidente

```
id:                bbcdec66-5181-445c-9b0f-1680ec55f153
user_id:           a66d5071-250a-4f8b-a67b-9c6b00297d20 (Juan Jose Ruiz Muñoz)
course_name:       "Club De Golf Los Leones"
course_id:         null ← BUG
par_per_hole:      null ← BUG
played_at:         2026-05-13
scores:            [5,4,4,5,4,3,5,5,7,6,3,6,6,4,6,4,8,6] (total 91)
import_source:     photo_scan
import_confidence: 1.00
```

### Pares reales de Los Leones (varones) — confirmados en `course_holes`

```
H1:4  H2:4  H3:3  H4:5  H5:4  H6:3  H7:4  H8:4  H9:5  (Out: 36)
H10:4 H11:3 H12:4 H13:4 H14:3 H15:4 H16:4 H17:5 H18:5  (In: 36)
                                                       (Total: 72)
```

### Modelo `courses` — duplicación VARONES/DAMAS (out of scope, ver Spec B futuro)

```
137 records fuente='fedegolf'
136 con sufijo (DAMAS)/(VARONES)
69 clubes únicos
17 courses sin course_holes poblados (candidatos a enrichment por OCR)
```
