# Spec — Examen a fidelidad-v3 (el gate mide lo que se shippea)

**Fecha:** 2026-06-22 · **Autor:** Claude (CTO) · **Estado:** aprobado para ejecución (auto-review CTO; pre-mortem con 3 agentes paralelos)
**Contexto vivo:** [[docs/cerebro-v3-estado.md]] · **Combo IA:** [[project_combo_ia_autonoma_coach]]

## Problema

El examen-máquina (Fase 0) **juzga al coach v2 sobre la rúbrica de 6 piezas, que solo el prompt v3 enseña**:
- `build-exam-system.ts` arma el prompt **v2** (sin `ENGAGEMENT`/`CONOCER`/`ONBOARDING`/`RAG`) y expone solo `TAIGER_TOOLS` (sin `get_focus`, la tool que produce *el foco* de las 6 piezas).
- El primer baseline honesto (correctness 71%, 6-piezas 3.83/6, commit `f712cf8d`) por lo tanto **subestima al coach v3**, que es el que apunta a "día-1-pro".

El gate "portón de todo" debe medir el coach que se va a shippear (v3), no el v2 que ni intenta las 6 piezas.

## Pre-mortem — 3 trampas de falso-verde (verificadas en código)

1. **Seeds sin scorecard.** `fixtures.ts` trae solo `total` por ronda, **0 `scores[]` por hoyo**. El motor de foco exige ≥3 rondas de 18h con scores por hoyo que crucen umbrales (back-9 collapse `back9−front9>2.5`; post-bogey spiral ≥10 bogeys y rate >0.4; etc.). Sin rediseñar seeds, `get_focus` siempre devuelve fallback → falso verde.
2. **Mismatch prompt-v3 / tools-v2.** `CONOCER` ordena usar `get_focus`/`set_target`/`get_progress`/`field_context`; el examen expone solo `TAIGER_TOOLS`. Hay que sumar las tools v3 en los DOS call sites (`exam.test.ts`, `run-coach-exam.ts`) junto con el prompt.
3. **No-determinismo.** El motor lee `cerebro_weights` + `pattern_definitions` vivos (mutables). El mismo seed daría otro foco entre corridas. `selectFocus` es puro (cero random/Date.now); la no-determinación viene del input de DB.

## Decisiones (no negociables)

| # | Decisión | Razón |
|---|---|---|
| D1 | **Builder compartido** `buildCoachSystem`/`buildCoachTools` usado por route Y examen, con test de paridad. | `route.ts` y `build-exam-system.ts` ya divergieron (11-jun). Una sola fuente de verdad o re-divergen. |
| D2 | `get_focus` en el examen corre el **motor REAL** (`getFocus`) con `GetFocusDeps` inyectadas: **pesos y catálogo CONGELADOS** en fixture (no DB), rondas del seed en memoria. | Honestidad (motor real, no foco hardcodeado) + determinismo. La inyección ya está soportada por diseño. |
| D3 | `set_target`/`remember_fact`/`get_progress` **mockeados** (success sin escribir). | Escriben con service_role → mutarían data real. El examen no debe mutar. |
| D4 | **Omitir RAG** del examen. Documentar: "examen mide coaching v3 SIN retrieval". | RAG = embeddings + reranker Gemini + corpus + key → no-determinismo, red, costo, routing partido (`handleToolUse`). Ortogonal a la calidad de 6-piezas/foco. |

> **Nota D4 (reconciliación P2, 23-jun):** el examen expone las tools vía el builder ÚNICO `buildCoachTools({cerebroV3Enabled:true})` (D1), que **incluye** `search_knowledge_chunks`. Antes que partir la fuente canónica de tools (re-divergencia, lo que P1 vino a matar), el `mock-executor` degrada RAG honesto (`ok:false`, sin corpus) → el coach usa su disclaimer anti-alucinación. Resultado neto idéntico a "RAG fuera": cero retrieval real, cero data fabricada. Mismo trato que `field_context`. El gate del examen mide coaching v3 **sin retrieval**, como pide D4.
| D5 | **Rediseñar seeds con scorecards por hoyo** que disparen patrones concretos y diversos. | Sin esto, todo lo demás es falso verde (trampa #1). El grueso del trabajo. |
| D6 | **Onboarding determinista**: el seed fija `onboarded` true/false explícito. | Su presencia cambia el system; cubrir ambas ramas. |
| D7 | **Re-baseline** (`--update-baseline`) recién con D1–D6 sanos y coach con correctness>0 razonable. | El guard solo detecta 0%, no un baseline mediocre. |

## Plan de ejecución (sub-olas)

- **P1 (este PR) — Builder compartido, refactor PURO comportamiento-cero.** Extraer `buildCoachSystem({contextString, cerebroV3Enabled, onboarded})` + `buildCoachTools({cerebroV3Enabled})`. `route.ts` y `build-exam-system.ts` lo usan. **El examen queda en `v3=false`** (comportamiento idéntico) hasta que P2–P3 estén listos. Test de paridad: builder == armado inline previo, para v2 y v3. CI-safe (la capa offline no usa `buildExamSystem`).
- **P2 — Tools v3 en el examen** + `mock-executor`: `get_focus`→`getFocus` real con deps congeladas; resto mockeado. Exponer `[...TAIGER_TOOLS, ...FOCUS_TOOLS, FIELD_CONTEXT_TOOL]` (RAG fuera, D4).
- **P3 — Rediseño de seeds** con scorecards realistas que disparen patrones (back-9 collapse, post-bogey, three-putt, etc.). Tests que pinean qué patrón dispara cada seed.
- **P4 — Flip a v3 + re-baseline.** Examen `v3=true`. Correr LIVE, validar correctness>0 razonable, `--update-baseline`, commitear. Ese es el número honesto del coach v3.
- **P5 — Hardening guiado por el examen.** Si las 6 piezas siguen flojas con el prompt v3 puesto, endurecer `CONOCER` y re-medir (loop measure→fix→re-measure). Antesala de GEPA (Fase 2).

## Garantías de no-regresión (CI)

- La capa offline por-PR NO usa `buildExamSystem` (lógica pura con LLMs scripteados) → inmune.
- El snapshot de `TAIGER_SYSTEM_PROMPT` no cubre `buildExamSystem` → no regenerar.
- Canarios grepean código de prod (route/tools) → inmunes.
- P1 verifica paridad exacta v2 y v3; `route.ts` (endpoint del coach) cambia solo a "delega el armado", sin cambio de string.
