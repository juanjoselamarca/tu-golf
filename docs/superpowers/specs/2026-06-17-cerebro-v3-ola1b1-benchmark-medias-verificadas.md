# Spec — Cerebro V3 Ola 1b.1 — "Benchmark de medias verificadas (Shot Scope)"

**Fecha:** 2026-06-17
**Autor:** Claude (CTO)
**Estado:** En diseño
**Depende de:** Ola 1b (priors externos por capas, PR #173, en prod)
**Spec madre:** `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md` §5.2 (field_context)

---

## 1. Problema

Ola 1b dejó **field_context con 3 capas**:
- **Capa B (ranking poblacional del índice):** VIVA — distribución de índices USGA 2024 (GHIN, real).
- **Capa C (dificultad de cancha):** VIVA — slope vs banda WHS neutra (113).
- **Capa A (vs jugadores de tu hándicap en una sub-métrica):** **GATEADA** (`benchmarkVerified=false`).

La capa A se gateó porque el seed de `score_par3` era **provisional/inventado**: tenía percentiles `p10/p25/p50/p75/p90` que **nadie publica**. Tres investigaciones independientes (15-jun, 17-jun ×2) confirman: las **distribuciones/percentiles** de scoring por hándicap NO se publican (Broadie las dejó fuera del libro; DECADE las encierra en su app de pago; USGA no las da por hoyo). Ver memoria `reference_priors_percentiles_no_publicados`.

**Pero SÍ se publican las MEDIAS**, verificadas y citables: Shot Scope (N>100.000 golfistas) publica el promedio de score-to-par por par-type (par-3/4/5) y por bucket de hándicap, y las tasas de resultado por ronda (birdies, dobles-o-peor) por hándicap.

## 2. Realidad de datos (verificada en prod, 17-jun)

`historical_rounds`: 539 rondas, **20 user_id** — pero solo **2 jugadores reales con profundidad** (Nicolás 125, Juanjo 116) + 3 colas chicas. El resto (9 cuentas con 19-20 rondas exactas + Test/Smoke users) son **seeds de test**. ⇒ **No tenemos población propia** para computar percentiles. La data propia sirve como *posterior* (el promedio real del jugador), no como *prior poblacional*.

## 3. Decisión de diseño (CERO FALLOS)

1. **NO afirmamos percentiles de sub-métricas.** Un percentil exige conocer la forma de la distribución, que no está verificada. Derivarlo con un modelo (Hardy anclado a medias) sería *precisión de teatro* → prohibido.
2. **SÍ afirmamos delta-vs-promedio-de-tu-nivel**, con la media verificada de Shot Scope:
   > "En par-3 promedias 3.4. El típico de tu hándicap (15) hace 3.83 → vas **0.4 mejor** que tu nivel."
   Honesto, citable, específico, y calza con el estilo coach de 6 piezas (`feedback_estilo_coach_comunicacion`).
3. **El percentil del índice (capa B, GHIN) se queda.** Solo se gatean los percentiles de **sub-métricas**.
4. **El shrinkage empírico-Bayes sigue apagado** para estas métricas: necesita la varianza ENTRE jugadores (τ²) que tampoco está publicada. La media verificada NO habilita el shrinkage, solo el delta de field_context.

## 4. La arquitectura de 1b YA soporta esto

`field-context.ts` (en prod) ya tiene:
- `betterThanPct(points, value, lowerIsBetter)` → devuelve `null` si hay <2 puntos. **Con solo `p50`, no afirma percentil.** ✓
- `classifyVsNormal(value, median, lowerIsBetter, tolerance)` → veredicto cualitativo con **solo la mediana**. ✓
- `buildVsHandicap` ya maneja `mejor_que_pct: null` y saca `tu_valor` + `normal_para_tu_handicap` + `interpretacion`.

⇒ Poblar **solo `p50`** = la media verificada hace que el sistema, por construcción, dé delta-vs-media sin percentil. La cocina está lista.

## 5. Cambios (alcance Fase 1 — medias por par-type)

### 5.1 Datos
- Reemplazar `scripts/cerebro-v3/data/priors/amateur-benchmarks.json`: en vez de p10/25/75/90 inventados, **solo `percentile: 50, value: <media Shot Scope>`** para `score_par3`, `score_par4`, `score_par5`, por cada bucket que Shot Scope publique (0/5/10/15/20/[25]). `sample_size` real si está; `legal_basis: "shotscope_verified"` + URL por fila/fuente.
- Buckets sin media publicada → **no se siembran** (degradación honesta, no interpolar).
- Re-correr `ingest-priors.mjs` en prod (idempotente).

### 5.2 Partir el gate (única corrección de código real)
`benchmarkVerified` es hoy un booleano demasiado grueso (gatea media Y distribución juntas). Partir en:
- `meanVerified: boolean` — la **media** del bucket está verificada/citable ⇒ habilita la capa A de field_context (delta-vs-media). `true` para par-3/4/5.
- `distributionVerified: boolean` — los **percentiles/varianza** están verificados ⇒ habilita (a) el shrinkage en get-focus y (b) cualquier afirmación de percentil en field_context. `false` (sigue sin publicarse).

Tocar: `metric-map.ts` (el tipo + las entradas), `get-focus.ts` (shrinkage gatea por `distributionVerified`), el wiring de field_context (capa A consume si `meanVerified`; nunca pasa percentil si `!distributionVerified`).

### 5.3 Métricas
- `metric-map.ts`: agregar `par4_avg_vs_par` (`score_par4`, `v-4`) y `par5_avg_vs_par` (`score_par5`, `v-5`), `meanVerified:true`, `distributionVerified:false`. Mantener `par3_avg_vs_par`.
- Confirmar que el baseline del jugador (`computePlayerBaseline`) sabe medir par4/par5 avg vs par (mismo patrón que par3). Si no, agregarlo.

### 5.4 Tests (TDD)
- Con solo `p50`: `betterThanPct` → `null`; `buildVsHandicap.mejor_que_pct` → `null`; `interpretacion` correcta (mejor/peor/en línea).
- Gate: `meanVerified=true, distributionVerified=false` ⇒ field_context capa A disponible, shrinkage NO invocado, NUNCA percentil de sub-métrica.
- Degradación: bucket sin media ⇒ capa A `disponible:false` con motivo.
- Canario anti-huérfanos extendido: si hay media verificada en DB ⇒ field_context la consume.

## 6. Fase 2 (fast-follow, otro PR) — tasas de resultado por ronda

Métrica distinta (conteo por ronda, no vs-par por hoyo): **dobles-o-peor/ronda** y **birdies/ronda** por hándicap (Shot Scope). Señal de coaching fuerte ("haces 6 dobles/ronda; el típico de tu nivel, 4.7 → ahí está la fuga"). Requiere: estructura de benchmark por-ronda + computar la tasa propia del jugador desde `historical_rounds`. Se especifica aparte al cerrar Fase 1.

## 7. Fuera de alcance
- Activar el shrinkage (necesita varianza publicada — no existe).
- Modelo Hardy / percentiles derivados (precisión de teatro).
- Sub-olas 1a/1c/1d (este patrón las habilita, pero se hacen aparte).

## 8. Validación / gate de merge
- TDD verde + tsc 0 + `/pre-push` (build + 2700+ tests).
- **Demo regla #4** contra data real de Juanjo (índice 9.6): el coach REAL llama field_context y dice el delta-vs-media de par-3/4/5 en lenguaje humano, **sin percentil de sub-métrica, sin inventar**. Juanjo firma el framing.
- `superpowers:code-reviewer` (diff >100 LOC).
- Flag sigue por usuario.

## 9. Riesgos
- **Que Shot Scope publique pocos buckets** → buckets faltantes degradan honesto (capa A no disponible para ese hándicap). Aceptable.
- **Unidades:** Shot Scope da strokes absolutos; el baseline interno es vs-par. La conversión (`v - par`) ya existe para par-3; replicar exacto para par-4/5.
- **Mezcla 9h/18h:** las medias son por hoyo (vs-par por hoyo) ⇒ escala-neutral, no requiere separar 9h/18h como round_metrics. Confirmar en el baseline.
