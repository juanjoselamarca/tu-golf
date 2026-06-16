# Cerebro V3 — Sub-ola 1b: Priors externos por capas (diseño)

**Fecha:** 2026-06-15
**Estado:** diseño aprobado en brainstorming + self-review CTO aplicado, pendiente review de Juanjo → writing-plans
**Spec maestro:** `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md` (§8.2 migraciones Ola 1, §schema `external_priors_*`)
**Estado vivo:** `docs/cerebro-v3-estado.md`
**Pieza de la visión:** #5 "nutrición externa" + mitigación de cold-start (§riesgos del spec maestro)

---

## 1. Problema y objetivo

El cerebro v3 hoy solo sabe lo que el jugador le mostró con sus propias rondas. Dos consecuencias:

1. **Cold-start:** con pocas rondas (2-5) el motor de foco no tiene base estadística y puede afirmar patrones que son ruido — viola CERO FALLOS (el coach asegurando algo falso es peor que no decir nada).
2. **Sin marco de referencia:** el coach no puede decir "lo tuyo es normal / mejor / peor para tu nivel", ni ubicar al jugador en la población, ni ajustar por dificultad de cancha.

**Objetivo de 1b:** dar al cerebro tres capas de "conocimiento del mundo" sobre una infraestructura común de priors externos, y consumirlas de verdad en runtime (no decoración).

Las tres capas (decisión de producto de Juanjo: "las tres por capas"):

| Capa | Pregunta que responde para el jugador | Tabla destino |
|---|---|---|
| **A — Benchmark por skill** | "¿Qué anota normalmente un hándicap 15 en par 3? ¿Cuántos putts promedia?" | `external_priors_amateur_benchmarks` |
| **B — Distribución poblacional** | "¿Dónde rankeo entre los golfistas?" | `external_priors_handicap_dist` |
| **C — Normas de cancha** | "¿Qué tan dura es esta cancha vs el estándar?" | `external_priors_course_norms` |

**Adelanto de scope justificado:** la capa A (`amateur_benchmarks`) figuraba nominalmente en sub-ola 1a en el roadmap. Se adelanta a 1b porque es la única de las tres que habilita **tanto** "calibrar al novato" (shrinkage real) **como** "ranking por skill". B y C solas son contexto; A es el motor estadístico. Sin A, "las tres por capas" queda coja.

---

## 2. Alcance

### En scope
- Migración con las 3 tablas `external_priors_*` (A, B, C) + extensión de uso de `knowledge_sources` (catálogo ya existente de 1e) + RLS lectura pública / escritura admin.
- Pipeline de ingesta idempotente, escalable y cron-ready, con **fetcher pluggable** (archivo curado hoy → fetch automático futuro sin reescribir).
- Seed curado y versionado en el repo de las tres capas (datos publicados, extraídos una vez).
- Helper de **shrinkage bayesiano empírico** ("que decida el dato") consumido por el motor de foco.
- **Tool del coach `field_context`** que expone las tres capas en una respuesta real.
- Canario anti-huérfanos en CI (tablas con data ⇒ consumo cableado, o falla).

### Fuera de scope (YAGNI explícito)
- Scrapers / PDF-parsers / RSS vivos. Diferidos detrás del fetcher pluggable; se activan cuando una fuente lo amerite.
- Distribución poblacional **chilena** computada desde nuestra data + FedeGolf. Se deja `region` en las tablas y el punto de extensión listo; es feature aparte.
- Sub-olas 1c (estrategia) y 1d (psicología). Ahí se retoma la decisión sobre "libros de instrucción vía RAG" (ver memoria `feedback_taiger_no_book_to_skill_v1`).
- Re-importar ratings de canchas chilenas: ya están en FedeGolf (137 canchas). La capa C se seedea **delgada** (bandas de referencia globales como fallback para canchas sin match).

---

## 3. Modelo de datos

Esquemas tomados del spec maestro (§`external_priors_*`). No se inventan columnas; se respetan las definidas.

### A — `external_priors_amateur_benchmarks`
```
id bigserial PK
source_id uuid REFERENCES knowledge_sources(id)
handicap_bucket text NOT NULL    -- ej '10-14', '15-19', 'scratch'
metric_key text NOT NULL          -- ej 'score_par3', 'putts_per_round', 'gir_pct'
percentile integer                -- 10,25,50,75,90
value numeric NOT NULL
sample_size integer
created_at timestamptz
```
**Requisito de seed:** múltiples percentiles por (handicap_bucket, metric_key) — al menos p10/p25/p50/p75/p90 — para poder estimar media **y varianza** del prior (`τ²`). Solo la mediana NO alcanza para el shrinkage.

### B — `external_priors_handicap_dist`
```
id bigserial PK
source_id uuid REFERENCES knowledge_sources(id)
region text NOT NULL              -- 'GLOBAL' hoy; 'CL' reservado para futuro
gender text
age_bucket text
handicap_bin text NOT NULL
proportion numeric NOT NULL       -- fracción de la población en ese bin (suma ~1.0 por corte)
year integer
created_at timestamptz
```

### C — `external_priors_course_norms`
```
id bigserial PK
source_id uuid REFERENCES knowledge_sources(id)
course_external_id text           -- bandas de referencia: clave sintética 'BAND:<region>:<par>' (nunca NULL, ver §4)
course_name text
region text
par integer
slope_rating integer
course_rating numeric
metadata jsonb
created_at timestamptz
```
Seed delgado: bandas de referencia (slope/rating típicos por tipo de cancha) como fallback. No duplica FedeGolf.

### RLS
Las tres son datos agregados, no personales → lectura pública, escritura admin (mismo patrón que `pattern_definitions` / `knowledge_chunks`). Confirmar `relrowsecurity` vivo en prod tras aplicar (ver `reference_migraciones_repo_no_garantizan_prod`).

---

## 4. Ingesta — escalable y automática sin fragilidad

Estructura (mirror del pipeline de 1e, reusa `scripts/cerebro-v3/lib/`):

```
scripts/cerebro-v3/
  priors.config.json          # catálogo declarativo: por fuente {source_key, name, author,
                              #   url, legal_basis, confidence_level, layer:A|B|C, fetcher:"file"|"http"|"rss", path}
  data/priors/
    amateur-benchmarks.json   # datos curados versionados (capa A)
    handicap-dist.json        # capa B
    course-norms.json         # capa C
  ingest-priors.mjs           # orquestador idempotente (mirror de ingest-rules.mjs)
  lib/                        # REUSADO de 1e: upsert-supabase.mjs, etc.
```

### Contrato del pipeline (interfaces aisladas)
1. **Fetcher** `(sourceConfig) → rawBuffer|rawJson`. Hoy `file` (lee `data/priors/*.json`). Mañana `http`/`rss` se enchufan **sin tocar** las etapas siguientes. Eso es "automático hacia adelante".
2. **Normalizer** `(raw, layer) → Row[]` tipado por capa. Valida forma (Zod), rechaza filas malas con error claro.
3. **Loader** `upsertRows(table, rows, conflictKey)` idempotente (reusa `upsert-supabase.mjs`). Clave natural por capa:
   - A: `(source_id, handicap_bucket, metric_key, percentile)`
   - B: `(source_id, region, gender, age_bucket, handicap_bin, year)`
   - C: `(source_id, course_external_id)` — **OJO (review 2026-06-15):** las bandas de referencia no tienen `course_external_id` real → un NULL en la clave de conflicto reproduce el bug 42P10 (`reference_partial_index_onconflict_42p10`: en Postgres los NULL son distintos y `ON CONFLICT` no agrupa). Solución: clave sintética NO-NULL `course_external_id = 'BAND:<region>:<par>'` para las bandas. Nunca NULL en columna de conflicto.
4. **Source registrar:** upsert en `knowledge_sources` por `source_key` antes de cargar filas; cada fila referencia `source_id`.

**Bucketing canónico (review 2026-06-15):** capa A usa `handicap_bucket`, capa B usa `handicap_bin` (nombres del spec maestro, no se cambian). Para evitar deriva, una **única** función `handicapToBucket(index)` en `src/golf/coach/v3/priors/buckets.ts` define los cortes y la usan ingesta, readers y shrinkage. Un solo lugar de verdad.

**Mapeo métrica-externa ↔ métrica-del-jugador (review 2026-06-15):** el shrinkage y `field_context` mezclan el valor del jugador con el prior — deben ser la **misma métrica en las mismas unidades**. Registro explícito `METRIC_PRIOR_MAP` (patrón `MEASURE_BY_KEY` de Ola 3) que liga cada `metric_key` externo a cómo se computa esa métrica desde las rondas del jugador, con sus unidades. Si una métrica externa no tiene equivalente computable del jugador, NO se usa para shrinkage (solo para contexto informativo en `field_context`). Sin esto, se mezclan peras con manzanas.

### Propiedades
- **Idempotente:** re-correr no duplica (upsert por clave natural).
- **Cron-ready:** un entrypoint `node --env-file=.env.local scripts/cerebro-v3/ingest-priors.mjs`. Se puede colgar de un cron de Vercel el día que un fetcher `http`/`rss` exista.
- **Auditable:** datos versionados en git; el diff muestra exactamente qué número cambió y cuándo.
- **Degradación honesta:** si una fuente falla, se marca `confidence_level` bajo en `knowledge_sources` y el consumo degrada el peso de esa capa (spec maestro §117), no rompe.

### Fuentes curadas (extraídas una vez, documentadas con URL + fecha)
- **Capa A:** distribuciones por hándicap publicadas (GIR%, putts, score por tipo de par, percentiles).
- **Capa B:** distribución de hándicaps USGA/R&A (agregados poblacionales publicados), `region='GLOBAL'`.
- **Capa C:** bandas de slope/rating de referencia.

**Filtro de aceptación de datos (decisión PM 2026-06-15):** toda fuente confiable de la red que pase el filtro de la app sirve como data. "Pasa el filtro" es un gate concreto y enforced, no criterio subjetivo:
1. **Trazabilidad:** autor/institución + URL + fecha registrados en `knowledge_sources` (nada anónimo o sin origen).
2. **Consistencia interna:** percentiles monótonos, proporciones de capa B suman ~1.0, `sample_size` presente y razonable, sin valores imposibles (el normalizer Zod rechaza lo que no cumple).
3. **Compatibilidad metodológica:** la métrica externa mapea a una métrica que computamos **igual** (`METRIC_PRIOR_MAP`). Si la definición o las unidades difieren, no entra al shrinkage — solo a contexto informativo en `field_context`. Esto es lo que evita envenenar el motor.
4. **Umbral de confianza:** cada fuente lleva `confidence_level`; shrinkage y `field_context` consumen solo data sobre un piso, y por debajo degradan el peso de la capa (no rompen).

> Decisión de población: las fuentes externas son globales/por-skill, no chilenas. "Top X% del mundo" es honesto pero genérico para un usuario chileno. Se conserva `region` y el punto de extensión para computar la distribución chilena real desde nuestra data + FedeGolf más adelante (feature aparte).

---

## 5. Consumo en runtime (regla anti-decoración)

Ninguna pieza se declara completa sin prueba de consumo. Dos puntos:

### 5.1 Shrinkage bayesiano empírico — "que decida el dato"
`src/golf/coach/v3/priors/shrinkage.ts`

Formulación empirical-Bayes (sin corte fijo de N):
```
posterior = λ · media_jugador + (1 − λ) · media_prior
λ = (n / σ²_within) / (n / σ²_within + 1 / τ²_between)
```

**Corrección crítica (review 2026-06-15) — usar varianzas POBLACIONALES, no las del jugador:**

La trampa: "que decida el dato" NO puede significar estimar `σ²` de las 2-3 rondas del jugador. Con N=2 la varianza propia es ruido (1 grado de libertad) y rompe la fórmula justo en el cold-start que queremos resolver. La formulación correcta usa varianzas **conocidas de la población**:

- `σ²_within` = varianza ronda-a-ronda **típica del bucket de hándicap** (cuánto varía un jugador de ese nivel entre rondas). Conocida, de la población. NO se estima por jugador.
- `τ²_between` = varianza **entre jugadores** del mismo bucket = `Var_total_población − σ²_within`. Los percentiles publicados de capa A describen la dispersión **total** (entre-jugadores + ruido ronda-a-ronda); hay que **restar** `σ²_within` o `τ²_between` queda sobreestimada y λ se va alto demasiado pronto (el prior se suelta antes de tiempo). Clamp `τ²_between ≥ ε` (nunca negativa).
- `media_jugador`, `n`: del jugador (`round_metrics` / `pattern_observations`). Solo la media y el conteo salen del jugador; ambas varianzas son poblacionales.
- A medida que `n` crece, `λ → 1` y la media del jugador manda. Sin umbral arbitrario, pero numéricamente estable desde N=1.

**Fallback de fuentes sin percentiles:** si una fuente publica solo la media (caso común), se asume una dispersión paramétrica por coeficiente de variación documentado por métrica (en `priors.config.json`), marcada con `confidence_level` menor. El shrinkage degrada, no se cae.

**Selección de bucket en cold-start (review 2026-06-15) — huevo y gallina:** elegimos el prior por bucket de hándicap, pero el índice del jugador con pocas rondas es justo el menos confiable. Cascada: (1) índice WHS si existe (la app ya lo tiene para imports Garmin/FedeGolf aun con pocas rondas en la app); (2) si no, la meta de onboarding (`set_target` de Ola 2); (3) si no, un bucket ancho por defecto (medio-alto, conservador). Nunca se bloquea por falta de índice.

**Punto de enchufe:** `src/golf/coach/v3/focus/select-focus.ts`. Antes de que el motor saque conclusiones, las métricas del jugador con baja precisión se reemplazan por su posterior. Un patrón solo "muerde" si sobrevive al shrinkage.

**TDD:** N=1 (prior domina, sin NaN), N=2 varianza-alta, N=30 (jugador domina), prior ausente (degrada a solo-jugador), `τ²_between` tras restar `σ²_within` nunca negativa (clamp ≥ ε). **Regresión obligatoria:** para un jugador high-N (Juanjo), `posterior ≈ media_jugador` y su foco actual de Ola 2/3 **no cambia** — 1b no debe regresar el comportamiento de usuarios flag-on existentes.

### 5.2 Tool del coach `field_context`
`src/golf/coach/v3/tools/field-context-tool.ts` (patrón de `search-knowledge-chunks-tool.ts`, registrado en `handle-tool-use.ts`).

El LLM lo invoca y recibe, para una métrica/cancha dadas:
- **Capa A:** "lo normal para tu hándicap" (percentil del valor del jugador dentro del bucket).
- **Capa B:** percentil poblacional del índice del jugador ("top X%").
- **Capa C:** dificultad relativa de la cancha vs la banda de referencia.

**Anti-alucinación (review 2026-06-15):** el tool lee el índice y la cancha del **usuario autenticado server-side** (mismo patrón que `get_playing_handicap` de Fase 0), NO de argumentos del LLM. El LLM solo pasa *qué métrica* quiere contextualizar. Así el coach no puede inventar el hándicap ni el percentil.

Salida en claves legibles (sin keys crudas), lista para que el coach la verbalice en las 6 piezas (`feedback_estilo_coach_comunicacion`).

### 5.3 Canario anti-huérfanos (CI)
Test que falla si: las tablas tienen filas pero `field_context` no está registrado en el dispatcher, o `shrinkage` no se invoca desde `select-focus`. Mismo patrón que cazó las piezas desconectadas el 2-jun (`feedback_anti_decoracion_wiring`).

---

## 6. Arquitectura — unidades y responsabilidades

| Unidad | Qué hace | Depende de |
|---|---|---|
| `supabase/migrations/20260615_cerebro_v3_ola1b_external_priors.sql` | crea 3 tablas + índices + RLS | `knowledge_sources` (existe) |
| `scripts/cerebro-v3/priors.config.json` | catálogo declarativo de fuentes | — |
| `scripts/cerebro-v3/data/priors/*.json` | datos curados versionados | — |
| `scripts/cerebro-v3/ingest-priors.mjs` | orquesta fetch→normalize→load idempotente | `lib/upsert-supabase.mjs` |
| `src/golf/coach/v3/priors/buckets.ts` | `handicapToBucket()` canónico (un solo lugar) | — |
| `src/golf/coach/v3/priors/readers.ts` | lecturas tipadas (percentil, prior por bucket, norma de cancha) | Supabase, buckets |
| `src/golf/coach/v3/priors/shrinkage.ts` | shrinkage empirical-Bayes puro (función sin I/O, testeable) | — |
| `src/golf/coach/v3/priors/metric-map.ts` | `METRIC_PRIOR_MAP` (métrica externa ↔ métrica jugador + unidades) | — |
| `src/golf/coach/v3/tools/field-context-tool.ts` | tool del coach que expone A+B+C (índice server-side) | readers, metric-map |
| `src/golf/coach/v3/focus/select-focus.ts` (mod) | aplica shrinkage antes de elegir foco | shrinkage, readers, metric-map |

`shrinkage.ts` y `buckets.ts` son funciones puras (entra data, sale número) → testeables en aislamiento sin DB.

---

## 7. Testing

- **Unit `shrinkage.ts`:** N=1 (prior domina sin NaN), N=2/varianza-alta, N=30 (jugador domina), prior ausente (degrada a solo-jugador), `τ²_between` clamp ≥ ε, **regresión high-N (foco de Juanjo sin cambios)**.
- **Unit `buckets.ts`:** cortes correctos, índice negativo (scratch/+), índice fuera de rango.
- **Unit `readers.ts`:** percentil correcto, interpolación entre percentiles seedeados, métrica/bucket inexistente.
- **Unit normalizer:** rechaza filas malformadas, valida suma de proporciones de capa B, clave sintética de bandas no-NULL.
- **Integration ingesta:** correr `ingest-priors.mjs` dos veces ⇒ mismo conteo (idempotencia).
- **Tool `field_context`:** devuelve las tres capas con claves legibles; ignora un hándicap pasado por el LLM (usa el server-side).
- **Canario anti-huérfanos:** descrito en §5.3.
- **Banco de pruebas cerebro v3:** correr contra los 5 perfiles sintéticos + Juanjo (regla #10). Un perfil con pocas rondas debe mostrar el coach apoyándose en el prior; Juanjo (muchas rondas) debe mostrar su data dominando.

---

## 8. Plan de entrega (orden sugerido para writing-plans)

1. Migración 3 tablas + índices únicos (claves naturales) + RLS + verificación `relrowsecurity` viva en prod.
2. `buckets.ts` canónico (TDD) + `priors.config.json` + esquema Zod de las 3 capas + normalizer (TDD).
3. Seed curado capa A (con percentiles + fuentes públicas verificadas) + ingesta idempotente + registrar fuentes.
4. Seed capas B y C (bandas con clave sintética) + ingesta.
5. `readers.ts` + `metric-map.ts` (TDD).
6. `shrinkage.ts` empirical-Bayes con varianzas poblacionales (TDD) + enchufe en `select-focus.ts` + regresión high-N.
7. Tool `field_context` (índice server-side) + registro en dispatcher (TDD).
8. Canario anti-huérfanos.
9. Banco de pruebas + demo a Juanjo (gate regla #4) + `/pre-push` + code-reviewer (>100 LOC) + merge. Flag sigue por usuario.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Coach asegura patrón falso a novato (CERO FALLOS) | Shrinkage empírico con varianzas poblacionales: con baja precisión el prior domina y el coach habla en condicional. |
| Shrinkage estimado con varianza del propio jugador (N=2 = ruido) | **Corregido:** `σ²_within` y `τ²_between` son poblacionales, no del jugador. Solo media y `n` salen del jugador. |
| `τ²_between` sobreestimada (percentiles incluyen ruido ronda-a-ronda) | **Corregido:** `τ²_between = Var_total − σ²_within`, clamp ≥ ε. |
| Mezclar métrica externa con métrica del jugador en distintas unidades | `METRIC_PRIOR_MAP` explícito; métrica sin equivalente computable no entra al shrinkage. |
| `ON CONFLICT` con `course_external_id` NULL (bug 42P10) | Clave sintética `BAND:<region>:<par>`, nunca NULL en columna de conflicto. |
| Coach alucina hándicap/percentil | `field_context` lee índice y cancha server-side, no de args del LLM. |
| Cold-start: índice inestable para elegir bucket | Cascada WHS → meta onboarding → bucket ancho por defecto. |
| 1b regresa el foco de usuarios flag-on existentes | Test de regresión: high-N ⇒ `posterior ≈ media_jugador`, foco sin cambios. |
| Priors globales poco relevantes para chilenos | `region` + hook a distribución chilena propia (feature futura). Honestidad en el copy ("a nivel mundial"). |
| Migración en repo ≠ aplicada en prod | Verificar `pg_class.relrowsecurity` vivo (`reference_migraciones_repo_no_garantizan_prod`). |
| Piezas construidas pero desconectadas | Canario anti-huérfanos en CI. |
| `field_context` infla tokens/costo del coach | Ya instrumentado en PR-0 (`surface:'coach_chat'`); vigilar `/admin/costos` tras merge. |
| Seed con números mal extraídos | Datos versionados + `sample_size` + `confidence_level` por fuente; auditables en el diff. |
| Vitest en OneDrive | pool `vmThreads` (`feedback_vitest_onedrive`). |

**Esfuerzo (review 2026-06-15):** el roadmap estimaba 1b en 3-4 días para "distribuciones". Con la capa A adelantada + shrinkage empírico hecho bien (descomposición de varianzas + mapeo de métricas + fallback de bucket), la estimación honesta sube a **5-7 días**. No quiero pagar esa deuda con un parche: el shrinkage mal hecho es peor que no tenerlo.

---

## 10. Decisiones tomadas en brainstorming (2026-06-15)

- ✅ Payoff: "las tres por capas" (ranking + calibración + dificultad).
- ✅ Adelantar capa A (`amateur_benchmarks`, nominalmente 1a) porque es el motor estadístico de las otras dos.
- ✅ Ingesta: seed curado versionado **con fetcher pluggable** (escalable/automático hacia adelante sin scrapers frágiles hoy). Autonomía CTO.
- ✅ Shrinkage: empirical-Bayes "que decida el dato" (sin corte fijo de N).
- ✅ Población: externa global hoy, `region` + hook para distribución chilena propia después.
- ✅ Capa C delgada (no duplica FedeGolf).
- ✅ Consumo probado en runtime (tool + shrinkage) con canario anti-huérfanos.

### Correcciones del self-review CTO (2026-06-15)
7 errores anticipados y corregidos en el spec antes de planificar:
1. **Shrinkage con varianza del jugador** → varianzas poblacionales (`σ²_within`, `τ²_between`); rompía justo en cold-start.
2. **`τ²_between` sobreestimada** → restar `σ²_within` de la dispersión total + clamp.
3. **Sin mapeo de métricas** → `METRIC_PRIOR_MAP` (unidades reconciliadas).
4. **`ON CONFLICT` NULL en capa C** → clave sintética `BAND:<region>:<par>` (bug 42P10).
5. **`field_context` confía el hándicap al LLM** → lectura server-side (anti-alucinación).
6. **Bucket de cold-start huevo-gallina** → cascada WHS → onboarding → default.
7. **Sin regresión de usuarios existentes** → test high-N (foco de Juanjo sin cambios).
Además: bucketing canónico único; costo `field_context` vigilado; esfuerzo re-estimado a 5-7 días.
