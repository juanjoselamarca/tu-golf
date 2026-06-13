# Cerebro V3 — Ola 3 chunk 3: formula declarativa + minN + PoC

**Fecha:** 2026-06-12
**Autor:** Claude (CTO)
**Prereqs:** chunk 1 (catálogo en DB) y chunk 2 (validador + runner + observations) en prod.

---

## Objetivo

Agregar un patrón nuevo al catálogo con un solo `INSERT INTO pattern_definitions` — sin merge de código. Para eso se necesita un intérprete declarativo que lea `formula_payload` y produzca la función observadora que hoy vive hardcodeada en `OBSERVE_BY_KEY`.

---

## 1. Schema de `formula_payload` para patrones declarativos

### 1.1 Decisión de diseño: "metric recipe" (opción B)

Se descarta el mini-DSL con operadores genéricos (opción A). Razones:

- **Predecible:** cada `recipe_type` tiene semántica cerrada y testeada. No hay composición libre que pueda producir valores sin sentido.
- **Validable:** se puede validar el JSON contra un schema tipado en TS antes de interpretar.
- **Suficiente:** los 3 recipe types cubren los patrones que sabemos que van a llegar (filtrar hoyos, comparar subconjuntos, extraer de metadata).
- **Extensible:** agregar un recipe type nuevo es un `case` en un switch, no un evaluador de expresiones.

### 1.2 Schema de `formula_payload` (extensión del actual)

El `formula_payload` actual de los gen-0 ya tiene campos de binding del foco (`metric_key`, `accion`, `min_confidence`, `min_sample`). Para patrones declarativos se agrega un campo `recipe` que describe la computación per-ronda:

```typescript
/** formula_payload completo (los campos del foco + la receta de observación). */
interface FormulaPayload {
  // ── Campos de binding del foco (ya existen en los seed gen-0) ──
  metric_key: string
  accion: string
  min_confidence: number
  min_sample: number

  // ── Receta de observación (chunk 3, opcional para gen-0 que usan OBSERVE_BY_KEY) ──
  recipe?: HoleFilterAggRecipe | MetadataExtractRecipe
}
```

#### Recipe type 1: `hole_filter_agg`

Filtra hoyos de una ronda por condición, agrega con una función, opcionalmente compara contra el complemento.

```typescript
interface HoleFilterAggRecipe {
  type: 'hole_filter_agg'

  /**
   * Filtro de hoyos. Cada condición opera sobre el hoyo individual.
   * - field: 'score' | 'par' | 'over_par' (score - par)
   * - op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
   * - value: number
   */
  filter: {
    field: 'score' | 'par' | 'over_par'
    op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
    value: number
  }

  /**
   * Scope del filtro dentro de la ronda.
   * - 'all': todos los hoyos que matchean el filtro.
   * - 'after_first': los hoyos POSTERIORES al primer hoyo que matchea
   *   (el hoyo disparador NO se incluye en el set computado).
   * - 'before_first': los hoyos ANTERIORES al primer hoyo que matchea.
   */
  scope: 'all' | 'after_first' | 'before_first'

  /**
   * Qué computar sobre los hoyos seleccionados.
   * - metric: 'score' | 'over_par' | 'count'
   * - aggregate: 'avg' | 'sum' | 'pct' (count matcheados / total hoyos)
   */
  compute: {
    metric: 'score' | 'over_par' | 'count'
    aggregate: 'avg' | 'sum' | 'pct'
  }

  /** Mínimo de hoyos seleccionados para que el value no sea null. Default: 1. */
  min_holes?: number
}
```

#### Recipe type 2: `metadata_extract`

Extrae un valor numérico de `round.metadata` (e.g., putts, fairways).

```typescript
interface MetadataExtractRecipe {
  type: 'metadata_extract'

  /** Ruta dot-notation en metadata. Ej: 'putts' para metadata.putts. */
  path: string

  /**
   * Cómo procesar el valor extraído:
   * - 'scalar': metadata[path] ya es un número, usarlo directo.
   * - 'array_filter_pct': metadata[path] es number[], contar cuántos
   *   matchean filter / total. Ej: three-putt rate.
   */
  mode: 'scalar' | 'array_filter_pct'

  /** Solo para mode='array_filter_pct'. */
  filter?: {
    op: 'gte' | 'gt' | 'lte' | 'lt' | 'eq'
    value: number
  }

  /** Mínimo de elementos válidos en el array. Default: 9. */
  min_count?: number
}
```

### 1.3 Ejemplo concreto: `scoring_after_first_double`

Promedio de score en los hoyos posteriores al primer double-bogey-or-worse:

```json
{
  "metric_key": "post_double_score_avg",
  "accion": "Después del primer double, haz un reset completo: camina despacio al siguiente tee, respira 4 veces, y comprométete a un plan conservador.",
  "min_confidence": 0.5,
  "min_sample": 3,
  "recipe": {
    "type": "hole_filter_agg",
    "filter": { "field": "over_par", "op": "gte", "value": 2 },
    "scope": "after_first",
    "compute": { "metric": "score", "aggregate": "avg" },
    "min_holes": 2
  }
}
```

Lectura: "filtra los hoyos donde over_par >= 2 (double bogey+), toma los hoyos AFTER_FIRST (posteriores al primero que matchea), computa el avg de score sobre esos hoyos, requiere al menos 2 hoyos para no devolver null."

---

## 2. `interpretObserver` — firma y comportamiento

### 2.1 Ubicación

Nuevo archivo: `src/golf/coach/v3/formula-interpreter.ts`

### 2.2 Firma

```typescript
import type { ComputedMetric, RoundData } from '@/golf/coach/metrics'
import type { RunnablePatternDef } from './pattern-runner'

/**
 * Dado un pattern_definitions con formula_payload.recipe, produce la función
 * observadora equivalente a las hardcodeadas en OBSERVE_BY_KEY.
 * Devuelve null si formula_payload no tiene recipe o el recipe.type no es
 * soportado — el caller sigue con `continue` como hoy.
 */
export function interpretObserver(
  def: RunnablePatternDefWithPayload,
): ((round: RoundData) => ComputedMetric) | null
```

### 2.3 Tipo extendido de `RunnablePatternDef`

```typescript
export interface RunnablePatternDefWithPayload extends RunnablePatternDef {
  formula_payload: Record<string, unknown>
}
```

El `backfillPatternObservations` ya hace `select('id, pattern_key, version, formula_kind, status')` — se agrega `formula_payload` al select. Los gen-0 lo tienen pero sin `recipe`, así que `interpretObserver` devuelve null y el fallback a `OBSERVE_BY_KEY` sigue funcionando.

### 2.4 Lógica interna

```
interpretObserver(def):
  payload = def.formula_payload
  recipe = payload.recipe
  if (!recipe) return null

  switch (recipe.type):
    case 'hole_filter_agg':
      return buildHoleFilterAggObserver(recipe)
    case 'metadata_extract':
      return buildMetadataExtractObserver(recipe)
    default:
      return null  // recipe type desconocido → skip (CERO FALLOS)
```

#### `buildHoleFilterAggObserver(recipe) → (round: RoundData) => ComputedMetric`

```
1. const v = validScores(round)
   if (!v) return { value: null, reason: 'incomplete_18_holes' }

2. Evaluar el filter contra cada hoyo i:
   - field='score' → v.scores[i]
   - field='par' → v.pars[i]
   - field='over_par' → v.scores[i] - v.pars[i]
   Comparar con op y value.

3. Aplicar scope:
   - 'all': los hoyos que matchean directamente.
   - 'after_first': encontrar el primer i que matchea,
     luego tomar hoyos i+1..17 (todos, no solo los que matchean).
   - 'before_first': hoyos 0..i-1 antes del primer match.

4. Si |selected| < (recipe.min_holes ?? 1): return { value: null, reason: 'insufficient_holes' }

5. Computar:
   - metric='score': v.scores[i] de cada hoyo seleccionado.
   - metric='over_par': v.scores[i] - v.pars[i].
   - metric='count': 1 por cada hoyo (length del set).
   aggregate='avg': sum / count
   aggregate='sum': sum
   aggregate='pct': length / 18

6. return { value, reason: 'computed', metadata: { matched_count, scope, ... } }
```

**Decisión clave en `after_first` scope:** los hoyos computados son TODOS los posteriores al primer trigger, no solo los que matchean el filtro. Esto es lo que queremos para `scoring_after_first_double`: "cómo juegas DESPUÉS de tu primer desastre", no "cómo juegas los desastres". Si en el futuro se necesita "solo los que matchean después del primero", se agrega un scope `'all_after_first'`.

#### `buildMetadataExtractObserver(recipe) → (round: RoundData) => ComputedMetric`

```
1. Extraer metadata[recipe.path]
   if undefined/null → { value: null, reason: 'no_metadata_field' }

2. mode='scalar': debe ser number. return { value, reason: 'computed' }

3. mode='array_filter_pct':
   debe ser number[]. Filtrar nulls.
   count = total de números válidos
   if count < (recipe.min_count ?? 9) → { value: null, reason: 'insufficient_data' }
   matched = cuántos pasan recipe.filter (op + value)
   return { value: matched / count, reason: 'computed', metadata: { matched, total: count } }
```

---

## 3. Punto de integración en pattern-runner.ts

### 3.1 Cambio exacto (line 90-91)

```typescript
// ANTES (chunk 2):
const observe = OBSERVE_BY_KEY[def.pattern_key]
if (!observe) continue

// DESPUÉS (chunk 3):
const observe = OBSERVE_BY_KEY[def.pattern_key]
  ?? interpretObserver(def as RunnablePatternDefWithPayload)
if (!observe) continue
```

### 3.2 Cambios en `RunnablePatternDef`

Opción elegida: NO cambiar la interfaz base. El cast `as RunnablePatternDefWithPayload` es seguro porque el `select` ya trae `formula_payload` (se agrega al query). Los gen-0 que matchean en `OBSERVE_BY_KEY` nunca llegan al `interpretObserver`.

Alternativa considerada y descartada: hacer `RunnablePatternDef` llevar `formula_payload?: Record<string,unknown>`. Descartada porque infla la interfaz para los tests existentes que construyen defs sin payload.

### 3.3 Cambio en el select del backfill (line 138)

```typescript
// ANTES:
.select('id, pattern_key, version, formula_kind, status')

// DESPUÉS:
.select('id, pattern_key, version, formula_kind, status, formula_payload')
```

---

## 4. Decisión minN: 15

### 4.1 Análisis

| minN | Falso positivo R²≥0.15 (patrón nulo) | Rondas necesarias | Impacto en usuarios |
|------|---------------------------------------|-------------------|---------------------|
| 10   | ~25% (doc actual del validador)       | ~10               | Muy accesible       |
| 15   | ~12%                                  | ~15               | Razonable           |
| 20   | ~6%                                   | ~20               | Puede ser alto para usuarios nuevos |

El AND gate (d ≥ 0.3 + R² ≥ 0.15 + dirección correcta) ya baja el falso positivo compuesto. A N=10, la probabilidad de que un patrón nulo pase los 3 gates es ~6-8% (25% R² × ~30% d dirección correcta). A N=15 baja a ~2-3%.

**Decisión: minN = 15.** Razones:
1. La demo real (chunk 2) mostró 515 observaciones para 113 rondas. Con 15+ rondas por usuario, la validación prende en ~2 semanas de juego activo — razonable.
2. N=20 excluiría a usuarios casuales (~1 ronda/semana) por meses. El coach no puede ser inútil durante ese período.
3. N=15 reduce el falso positivo a ~2-3% (vs ~7% a N=10). Suficiente para que el validador no sea teatro.
4. Es reversible: si en producción vemos demasiados falsos positivos, subir a 20 es un cambio de 1 línea.

### 4.2 Impacto en tests

El test de `pattern-validator.test.ts` usa datasets de N=10 para el caso base exitoso (línea 10: `lin(20, ...)`) y N=9 para el caso insuficiente. Solo el test "umbral inyectable" (línea 77-83) usa N=6 con override.

**Cambios necesarios:**
- El test `N insuficiente (9 pares)` sigue pasando (9 < 15).
- El test de empates (N=10) fallará si no se ajusta: 10 < 15. Subir a 16 pares.
- El test `d alto pero R² bajo` (N=16 hoy) sigue OK.
- Los 50 datasets de totalidad: algunos tendrán N < 15 y ahora serán `insufficient_n` en vez de otro veredicto. La assertion (`v.valido === (v.razon === 'passed')`) sigue siendo válida.

---

## 5. PoC: INSERT de `scoring_after_first_double`

### 5.1 Migración SQL

```sql
-- 20260612_poc_scoring_after_first_double.sql
-- PoC chunk 3: patrón declarativo sin código.
-- El motor lo computa vía interpretObserver(formula_payload.recipe).

INSERT INTO pattern_definitions (
  pattern_key, name, description, generation, formula_kind, source, status,
  weight, formula_payload
) VALUES (
  'scoring_after_first_double',
  'Caída post-double',
  'Promedio de score en los hoyos posteriores al primer double-bogey o peor. Mide la capacidad de recuperación mental tras un desastre.',
  1,
  'intra_round',
  'admin',
  'validating',
  0.4,
  jsonb_build_object(
    'metric_key', 'post_double_score_avg',
    'accion', 'Después del primer double, haz un reset completo: camina despacio al siguiente tee, respira 4 veces, y comprométete a un plan conservador.',
    'min_confidence', 0.5,
    'min_sample', 3,
    'recipe', jsonb_build_object(
      'type', 'hole_filter_agg',
      'filter', jsonb_build_object('field', 'over_par', 'op', 'gte', 'value', 2),
      'scope', 'after_first',
      'compute', jsonb_build_object('metric', 'score', 'aggregate', 'avg'),
      'min_holes', 2
    )
  )
) ON CONFLICT (pattern_key) DO NOTHING;

-- Sync peso al paramétrico vivo (mismo patrón que la migración de observations).
INSERT INTO cerebro_weights (parameter_type, parameter_key, current_weight, source)
SELECT 'pattern', 'scoring_after_first_double', 0.4, 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM cerebro_weights
  WHERE parameter_type = 'pattern'
    AND parameter_key = 'scoring_after_first_double'
    AND user_cluster_id IS NULL
);
```

### 5.2 Validación del PoC

Después de aplicar la migración + deployar el código:
1. Correr `backfillPatternObservations` para Juanjo.
2. Verificar que `pattern_observations` tiene filas con `pattern_key = 'scoring_after_first_double'`.
3. El patrón arranca en `status: 'validating'` — acumula evidencia pero no entra en el ranking del foco hasta que un admin lo active (o el validador lo confirme y se active automáticamente en un futuro chunk).

---

## 6. Plan de tests

### 6.1 Tests unitarios nuevos (`formula-interpreter.test.ts`)

| Test | Input | Esperado |
|------|-------|----------|
| `hole_filter_agg scope=all, avg de score en par 3` | Ronda con 4 par 3, scores [3,4,5,3] | value = 3.75 |
| `hole_filter_agg scope=after_first, double-bogey trigger` | Ronda donde hoyo 5 es +2, hoyos 6-18 tienen scores | avg de scores[6..17] |
| `hole_filter_agg scope=after_first, sin trigger en la ronda` | Ronda sin double bogey | value = null, reason = insufficient_holes |
| `hole_filter_agg scope=after_first, trigger en hoyo 18` | Double en el 18, 0 hoyos after | value = null |
| `hole_filter_agg scope=before_first` | Trigger en hoyo 10 | avg de scores[0..8] |
| `hole_filter_agg min_holes no alcanzado` | Solo 1 hoyo after del trigger, min_holes=2 | value = null |
| `metadata_extract scalar` | metadata.driving_accuracy = 0.72 | value = 0.72 |
| `metadata_extract array_filter_pct (three-putt equivalente)` | putts = [2,2,3,2,2,2,3,2,2,2,2,2,2,2,2,2,2,2] | value = 2/18 |
| `metadata_extract array con min_count insuficiente` | putts = [2,3] (2 elementos) | value = null |
| `recipe ausente en payload → null` | def con formula_payload sin recipe | interpretObserver returns null |
| `recipe.type desconocido → null` | type = 'quantum' | interpretObserver returns null |
| `scores null → value null` | round.scores = null | value = null |
| `scores con 9 hoyos → value null` | round.scores.length = 9 | value = null |
| `TOTALIDAD: nunca NaN/Infinity/throw` | 20 datasets variados | Siempre ComputedMetric bien formado |

### 6.2 Tests de integración (extensión de `pattern-runner.test.ts`)

| Test | Escenario |
|------|-----------|
| `computeObservationsForRound resuelve patrón declarativo vía interpretObserver` | Def con recipe + sin entrada en OBSERVE_BY_KEY → produce observación |
| `OBSERVE_BY_KEY tiene precedencia sobre interpretObserver` | Def con pattern_key='post_bogey_spiral' (existe en OBSERVE) + recipe en payload → usa OBSERVE, ignora recipe |
| `backfill incluye patrones declarativos en el scan` | Admin mock con def declarativa → inserta observaciones |

### 6.3 Test de minN (ajuste de `pattern-validator.test.ts`)

| Test existente | Cambio |
|----------------|--------|
| `empates en la mediana (N=10)` | Subir a N=16. Regenerar snapshot de effectSize. |
| `umbral inyectable (N=6)` | Sin cambio (usa override explícito de minN). |
| Nuevo: `N=14 con correlación perfecta → insufficient_n` | Verificar que 14 < 15 falla. |
| Nuevo: `N=15 con correlación perfecta → passed` | Verificar que 15 es el mínimo exacto. |

### 6.4 Canary wiring (extensión de `canary-cerebro-wiring.test.ts`)

Agregar a `ENFORCED`:

```typescript
{
  piece: 'interpretObserver consumido como fallback en pattern-runner (chunk 3)',
  consumer: 'golf/coach/v3/pattern-runner.ts',
  needles: ['interpretObserver'],
},
{
  piece: 'formula-interpreter importa validScores de metrics/helpers',
  consumer: 'golf/coach/v3/formula-interpreter.ts',
  needles: ['validScores'],
},
```

---

## 7. Orden de tareas

| # | Tarea | Dependencia | Estimación |
|---|-------|-------------|------------|
| 1 | Crear `formula-interpreter.ts` con `interpretObserver` + los 2 recipe builders | Ninguna | 45 min |
| 2 | Tests unitarios de `formula-interpreter.test.ts` | Tarea 1 | 30 min |
| 3 | Integrar en `pattern-runner.ts` (cambio de 2 líneas + import + select ampliado) | Tarea 1 | 10 min |
| 4 | Tests de integración en `pattern-runner.test.ts` | Tareas 1, 3 | 20 min |
| 5 | Cambiar `DEFAULT_THRESHOLDS.minN` a 15 + ajustar tests del validador | Ninguna (parallelizable con 1-4) | 15 min |
| 6 | Canary wiring nuevos contracts | Tareas 1, 3 | 5 min |
| 7 | `tsc --noEmit` + `npm run test` + `npm run build` | Todo lo anterior | 5 min |
| 8 | Migración SQL del PoC (`scoring_after_first_double`) | Tarea 7 verde | 5 min |
| 9 | Deploy a preview + smoke: backfill de Juanjo + verificar observations nuevas | Tarea 8 | 15 min |

**Total estimado:** ~2.5 horas.

**Paralelización posible:** tareas 1-4 y tarea 5 son independientes. Si hay 2 agentes, se puede hacer en paralelo.

---

## 8. Assessment de riesgos

### 8.1 Riesgo: formula_payload corrupto en BD

**Probabilidad:** baja (solo admin/seed escribe). **Impacto:** medio (patrón silenciosamente sin observaciones).

**Mitigación:** `interpretObserver` NUNCA lanza. Si el payload es malformado, devuelve null. El `try/catch` del runner (line 93-97) es cinturón adicional. Log warning (via `captureError` con severity=warning, no console) cuando un recipe.type es desconocido para detectar inserts rotos.

### 8.2 Riesgo: scope `after_first` en ronda sin trigger

**Probabilidad:** alta (muchas rondas no tienen double bogey). **Impacto:** cero.

**Mitigación:** devuelve `{ value: null, reason: 'insufficient_holes' }`. El runner salta nulls (line 98). La observación no se inserta. El validador no cuenta la ronda. Comportamiento correcto.

### 8.3 Riesgo: minN=15 deja a usuarios nuevos sin validación por semanas

**Probabilidad:** alta para usuarios casuales. **Impacto:** bajo — el foco sigue funcionando vía detect + confianza + peso; el validador solo CO-elige (no es gate único). Usuarios con 10-14 rondas ven `insufficient_n` en la evidencia de validación, pero el coach sigue recomendando acciones basado en los otros factores.

**Mitigación:** documentar en la UI de progreso que "se necesitan ~15 rondas para confirmar estadísticamente un patrón" (copy futuro, no de este chunk).

### 8.4 Riesgo: recipe schema insuficiente para patrones futuros

**Probabilidad:** media. **Impacto:** bajo.

**Mitigación:** el diseño permite agregar recipe types sin romper los existentes. Si llega un patrón que no encaja en `hole_filter_agg` ni `metadata_extract`, se agrega un tercer type al switch. No hay presión de backwards-compatibility porque el recipe vive dentro de un JSONB libre.

### 8.5 Riesgo: performance del intérprete vs hardcoded

**Probabilidad:** baja. **Impacto:** cero.

Las funciones hardcodeadas iteran 18 hoyos. El intérprete itera 18 hoyos con un switch extra por op. Diferencia: nanosegundos. El backfill corre offline, no en el request path del usuario.

---

## 9. Lo que NO entra en chunk 3

- **Activación automática de patrones `validating` → `active`:** eso es lógica de lifecycle, va en un chunk posterior.
- **UI para crear patrones declarativos:** el admin inserta vía SQL por ahora.
- **Recipe type para `cross_round`:** `driving_inconsistency` sigue siendo cross_round sin observador per-ronda. Requiere un recipe distinto que opere sobre la serie, no sobre una ronda. Futuro.
- **Recipe type `multivariate`:** futuro, spec lo declara para Ola 5+.
- **Refactor de `OBSERVE_BY_KEY` para usar recipes:** los gen-0 siguen hardcodeados. Migrar a declarativo es opcional y no mejora nada (el código ya funciona y está testeado).
