# Plan — Cerebro V3 Ola 3 chunk 2: observaciones + runner + validador anti-fantasía + pesos por patrón

> Diseño de ingeniería producido por subagente Fable (arquitecto), 2026-06-11. Implementación en Opus con TDD.
> Convierte el catálogo declarativo (chunk 1, en prod) en un **loop de evidencia**: cada ronda produce observaciones por patrón → validador estadístico puro decide si el patrón es REAL para el usuario → el veredicto gatea el motor de foco en runtime.

## Decisiones de arquitectura

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Fila de `pattern_observations` | (patrón, ronda, valor crudo per-ronda). El outcome (diferencial) NO se denormaliza: join en el loader. |
| D2 | FK | `historical_rounds(id) ON DELETE CASCADE` (gotcha Ola 2 — NUNCA `rounds`). |
| D3 | Disparo del runner | Backfill lazy idempotente en `getProgress` (espeja `backfillRoundMetrics`) + script batch. SIN endpoint nuevo (decoración). |
| D4 | Cobertura | 8/9 patrones (6 con math per-ronda + 2 métricas nuevas chicas: `short_game_gap`, `three_putt_rate`). `driving_inconsistency` (cross_round) fuera. |
| D5 | Effect size | Cohen's d con median split, CON signo (no \|d\|). |
| D6 | R² | OLS simple diferencial~valor; R²=r² Pearson + gate de dirección r>0. |
| D7 | Consumo del veredicto | Gate por tiers en `selectFocus`: negativo-con-datos excluye SIEMPRE; `insufficient_n`/`serie_vacia` excluye solo a NO-seed (gen-0 conserva su gate de detect → sin regresión UX Ola 2). |
| D8 | Persistencia del veredicto | NO se persiste. On-the-fly en `getFocus` (siempre fresco, auto-corrige al crecer N). |
| D9 | Pesos por patrón | `cerebro_weights('pattern',key).current_weight` → `pattern_definitions.weight` → `DEFAULT_PATTERN_WEIGHT=0.5`. Seed de 9 filas `pattern` en `cerebro_weights` (sliders admin). |

## Schema verificado en prod (11-jun)
- `pattern_definitions`: id, pattern_key, name, description, generation, formula_kind, formula_payload, applicable_when, **weight (numeric)**, **version (int)**, source, **status (text)**, validation_metadata, created_at, updated_at.
- `cerebro_weights`: UNIQUE (parameter_type, parameter_key, user_cluster_id); columna de peso = **`current_weight`**.
- `historical_rounds`: id, diferencial, course_rating, excluded_from_handicap, holes_played, scores, par_per_hole, total_gross, played_at, metadata, user_id — todas presentes.

## Migración `supabase/migrations/20260611_cerebro_v3_ola3_pattern_observations.sql`
- Tabla `pattern_observations`: id bigint IDENTITY PK; pattern_id uuid FK pattern_definitions CASCADE; pattern_key text (denormalizado, binding por key); pattern_version int; round_id uuid FK **historical_rounds** CASCADE; user_id uuid FK profiles CASCADE; value numeric NOT NULL (orientación: más alto = peor); metadata jsonb; computed_at timestamptz default now(); UNIQUE(pattern_id, round_id) (idempotencia).
- Índices: (user_id, pattern_key, computed_at DESC); (round_id).
- RLS: owner-read (auth.uid()=user_id), service_role write (espejo round_metrics).
- Seed idempotente `cerebro_weights`: 1 fila `('pattern', pattern_key, weight, 'seed')` por patrón gen-0 vía `NOT EXISTS` (evita NULL-distinct de la UNIQUE).

## Validador `src/golf/coach/v3/pattern-validator.ts` (PURA, sin I/O/Date/random)
Pregunta: ¿la variación entre rondas del patrón explica variación real del diferencial WHS del usuario?
- x_i = `pattern_observations.value` (más alto = peor). y_i = `historical_rounds.diferencial` (descartes de `computeRoundMetric`: excluded_from_handicap, diferencial null, 9h legacy CR<55 = `MIN_18H_COURSE_RATING`).
- **N** = pares completos (x,y). Gate N≥10.
- **Cohen's d (median split, con signo):** m=mediana(x); H={x>m}, L={x≤m} (empates a L); guard |H|<3 o |L|<3 → degenerate_split; d=(mean(y_H)−mean(y_L))/s_pooled; s_pooled=sqrt(((n_H−1)s_H²+(n_L−1)s_L²)/(n_H+n_L−2)); guard s_pooled=0 → degenerate_variance. Gate **d≥0.3 con signo** (rondas con patrón fuerte deben ser PEORES).
- **R² (OLS):** r=Σ(x−x̄)(y−ȳ)/sqrt(Σ(x−x̄)²·Σ(y−ȳ)²); R²=r². Guards Var(x)=0/Var(y)=0 → degenerate_variance. Gate **R²≥0.15 Y r>0** (else wrong_direction).
- **p-value** (Fisher z = atanh(r)·sqrt(N−3), Φ vía erf Abramowitz-Stegun) — metadata, NO gate.
- **meanDeltaStrokes** = mean(y_H)−mean(y_L) — costo en strokes citable por el coach.
- Contrato: `validatePattern(pairs, thresholds=DEFAULT_THRESHOLDS{minN:10,minEffectSize:0.3,minR2:0.15}) → PatternVerdict{valido,n,effectSize,r2,pValue,meanDeltaStrokes,razon}`. TOTAL: sin NaN/Infinity/throw para cualquier input. Razones: serie_vacia→insufficient_n→degenerate_split→degenerate_variance→wrong_direction→effect_too_small→r2_too_low→passed.
- 10 casos TDD (ver §3.4 del diseño): real fuerte, N insuficiente, efecto chico, R² bajo+d alto, dirección invertida, serie vacía, 3 degeneradas, totalidad/propiedad (50 datasets seed fija), umbrales paramétricos, empates deterministas.

## Consumo runtime (sin esto = decoración)
- `catalog.ts FocusCandidate` +`source?:string` +`defaultWeight?:number`. `catalog-db.ts` mapea `source`,`weight`. `types.ts SelectFocusInput` +`validation?:Record<string,PatternVerdict>`; `Focus` +`validacion?`.
- **Gate por tiers en `selectFocus`** (D7): verdict válido→elegible; verdict inválido con datos (effect_too_small/r2_too_low/wrong_direction/degenerate_*)→EXCLUIDO siempre; ausente o serie_vacia/insufficient_n → seed elegible (gate detect), no-seed EXCLUIDO.
- Peso 3 niveles (D9). `impacto=confianza×peso` sin cambio.
- `getFocus` +dep `loadValidation(userId)` → `loadObservationPairs` + `validatePattern` por key; falla → `{}` (degradación conservadora). 5ª promesa en Promise.all.
- `loadObservationPairs` en `src/lib/data/pattern-observations.ts` (join en memoria con diferencial elegible).

## Runner `src/golf/coach/v3/pattern-runner.ts`
- `OBSERVE_BY_KEY` (8 keys, ligado por pattern_key; `negate()` para front_nine_struggles invierte signo → invariante "más alto = peor").
- 2 métricas nuevas en `metrics/`: `short-game-gap.ts` (mean(par4 over)−mean(par5 over), min 5 par4 + 2 par5), `three-putt-rate.ts` (count(putts≥3)/count, min 9 greens, lee metadata.putts).
- `computeObservationsForRound(round,userId,defs)` PURA → inserts; salta sin observador / value null; nunca lanza. `pattern_version` congelado al cómputo.
- `backfillPatternObservations(admin,userId)` idempotente (espeja backfillRoundMetrics): defs status IN active/validating; rondas del user; set de ya-observados; computa faltantes; INSERT batch ignoreDuplicates.
- Disparo: en `getProgress` (focus-tools.ts) junto al backfillRoundMetrics existente (mismo try best-effort) + script `scripts/cerebro-v3/backfill-pattern-observations.ts`.

## Canarios anti-decoración (canary-cerebro-wiring.test.ts ENFORCED)
- pattern_observations se ESCRIBE (focus-tools → backfillPatternObservations).
- runner consulta pattern_definitions + escribe pattern_observations.
- get-focus → loadValidation. select-focus → PatternVerdict.
- + canario de COMPORTAMIENTO en select-focus tests: no-validado nunca es foco; seed con r2_too_low excluido; seed con insufficient_n sigue elegible (no-regresión).

## Tareas TDD (orden)
1. Migración + tests integración (tabla/FK historical_rounds/UNIQUE/RLS/seed idempotente).
2. `computeShortGameGap` + test. 3. `computeThreePuttRate` + test. 4. `OBSERVE_BY_KEY` + `negate`. 5. `computeObservationsForRound` puro. 6. `backfillPatternObservations` (mock supabase, idempotencia). 7. **`validatePattern` (10 casos)**. 8. `loadObservationPairs`. 9. `selectFocus` gate+peso 3 niveles + comportamiento. 10. `loadFocusCatalog` source/weight + regresión chunk 1. 11. `getFocus` +loadValidation degradado. 12. canarios wiring + hook en getProgress. 13. script + corrida real contra Juanjo (gate demo).
Cierre: tsc 0 · suite · build · code-reviewer · demo Juanjo (regla #4) → merge.

## Escepticismo estadístico (Fable, honesto)
- min_N=10 es BAJO para R² confiable (r crítico α=.05 con N=10 ≈ 0.632; gate R²=.15 → r=.387 → p≈.27: nulo pasa ~1/4). El AND con d≥0.3 direccional baja la tasa conjunta. Mantener pisos del spec (constitución) pero reportar pValue y anotar subir minN a 15-20 vía thresholds en chunk 3.
- Comparaciones múltiples (8 patrones) inflan FWER — mitigado porque el veredicto solo co-elige el foco con detect+confianza+peso, no es claim científico.
- Peeking secuencial aceptado (gates fijos simétricos → auto-corrige en ambas direcciones).
- Circularidad x↔y en métricas de NIVEL (post_bogey, first_hole): acople aritmético chico (1-4 hoyos/18) vs gate; parcialización diferida a chunk 3.

## Frontera chunk 3 (solo seam)
`OBSERVE_BY_KEY[key] ?? interpretObserver(formula_payload) ?? skip` (interpretObserver no existe aún). cross_round/driving_inconsistency, recomputo por version bump, parcialización, ajuste nocturno de pesos, minN por patrón en DB.
