# Estado Cerebro V3 — Actualizado 2026-05-28 15:25 GMT-4

> Este archivo es el dashboard vivo del proyecto cerebro v3. Se actualiza al cierre de cada sesión que toque el proyecto. Si lees esto al iniciar una sesión, sabés exactamente dónde retomar.
>
> Fuente única de verdad arquitectónica: `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`.

## Ola activa — EN EJECUCIÓN

- **Ola 1 — El coach estudia el mundo** — estado: `in_progress`
- **Sub-ola activa:** 1e — Reglas oficiales en `knowledge_chunks` (USGA/R&A/WHS/FedeGolf)
- **Spec sub-ola 1e:** `docs/superpowers/specs/2026-05-28-cerebro-v3-ola-1e-design.md` (commit `2fad0bc`)
- **Plan sub-ola 1e:** `docs/superpowers/plans/2026-05-28-cerebro-v3-ola-1e.md` (commit `de6b54b`) — 29 tasks TDD en 7 fases (A: schema → G: close)
- **Worktree:** `.claude/worktrees/cerebro-v3-ola-1e/` en branch `chore/cerebro-v3-ola-1e-claude`
- **Modo de ejecución:** subagent-driven (decisión Juanjo 2026-05-28)
- **Decisiones arquitectónicas tomadas en brainstorming 2026-05-28:**
  - 5 PRs por sub-ola (1a-1e), no un PR gigante por toda la Ola 1.
  - Sub-ola 1e primero (reglas oficiales): dataset acotado, valida infra RAG completa.
  - RAG completo desde 1e: hybrid search (vector + BM25) + contextual retrieval (Anthropic 2024) + bge-reranker-v2-m3 local (ONNX vía `@xenova/transformers`).
  - 6 fuentes oficiales con jurisdicción + priority_rank para resolver conflictos USGA vs FedeGolf Chile.
  - Admin UI `/admin/cerebro/fuentes` con re-indexado manual.

### Progreso sub-ola 1e

| # | Task | Commit | Tests | Estado |
|---|---|---|---|---|
| 1 | Setup worktree + @xenova/transformers | `3f24f53` + `cef5368` | — | ✅ |
| 2 | sources.config.json + verify-sources con 5 PDFs verificados | `04f2840` | URLs OK | ✅ |
| 3 | Migration knowledge_sources + RLS | `5537e74` | 6/6 | ✅ |
| 4 | Migration knowledge_chunks (pgvector + tsvector + CASCADE) | `cc11172` | 5/5 | ✅ |
| 5 | Migration rag_query_log (observabilidad) | `9adea47` | 4/4 | ✅ |
| 6 | RPC search_chunks_hybrid (vector + BM25) | `bd600c0` | 5/5 | ✅ |
| 7 | lib/download-pdf.mjs (sha256 + cache + retry + UA) | `047d0c6` | 5/5 | ✅ |
| 8 | lib/parse-structural.mjs (Rule→Sub→Para + fallback) | `3f07252` | 7/7 | ✅ |
| 9 | lib/contextual-prefix.mjs (Haiku 4.5) | `2987550` | 4/4 | ✅ |
| 10 | lib/embed-openai.mjs (batched + retry) | `5fc1a39` | 6/6 | ✅ |
| 11 | lib/upsert-supabase.mjs (idempotente batched) | `67ce663` | 4/4 | ✅ |
| 12 | ingest-rules.mjs orchestrator (validado dry-run con PDF real 16MB) | `2629528` | 235 chunks | ✅ |
| 13 | retrieval/types + embed-query LRU cache | `7b76e5a` | 5/5 | ✅ |
| 14 | retrieval/hybrid-search wrapper RPC | `f0043d5` | 5/5 | ✅ |
| 15 | retrieval/contextual-rerank bge-reranker + fallback | `bc71007` | 5/5 | ✅ |
| 16 | retrieval/weighted-scoring + query-logger | `b6292d8` | 8/8 | ✅ |
| 17 | retrieval/index orchestrator end-to-end | `4d3397a` | 4/4 | ✅ |
| 18-20 | Fase D — Coach integration (tool + RAG prompt + smoke) | `a773fcd`/`97071bc`/`b6e3bd2` | 11 | ✅ |
| 21-23 | Fase E — Admin UI (endpoints + page) | `f7f6c94`/`e97192f`/`003b2c4` | 18 | ✅ |
| 24 | Fase F — eval-rag-bench | `973a886` | — | ✅ |
| 28 | Fase G — code review + fixes C1/C2/I1-I4 | `39202ca`/`dc53a2e` | +5 | ✅ |
| 25-26 | Ingesta real + validación (Gemini) | `b83742a` | 372 chunks | ✅ |
| 27 | Skill golf-rules-official (book-to-skill) | — | — | ⏸️ no crítico |
| 29 | Demo Juanjo + merge | — | — | ⏸️ gate demo |

**PR abierto:** #79 (`chore/cerebro-v3-ola-1e-claude` → main). NO mergeado.

**Pivote arquitectónico (29-may):** sin `OPENAI_API_KEY` (billing), Juanjo eligió
**Gemini embeddings**. `gemini-embedding-001` dim=1536 → mantiene `vector(1536)`
sin migración. `taskType` RETRIEVAL_QUERY/DOCUMENT subió el banco 17→20/20.

**Bloqueo abierto para merge:** precisión anti-hallucination (hybrid-only no
separa limpio relevante de ruido). Fix = **reranker hosted** — decisión de
provider pendiente (Cohere `rerank-multilingual-v3.0` ya en llm_models seed, o
re-scoring con Gemini). El bge-reranker ONNX local quedó descartado (incompatible
con Vercel read-only FS). + mejorar cobertura FedeGolf (Q8 devolvió 0 chunks).
Eval completa: `docs/cerebro-v3-ola1e-evaluacion-rag.md`.

### Estado app en worktree (post Fase A+B+C)

- 4 migraciones aplicadas a Supabase prod: `knowledge_sources` + `knowledge_chunks` + `rag_query_log` + RPC `search_chunks_hybrid`.
- Pipeline de ingesta validado end-to-end con PDF real (Rules of Golf 2023, 16MB → 260 páginas → 235 chunks).
- Retrieval engine completo: hybrid search + bge-reranker-v2-m3 fallback + weighted scoring + query logger.
- 5 PDFs oficiales verificados (URLs reales con magic bytes %PDF):
  - usga-rules-of-golf-2023 (libro completo)
  - usga-clarifications-2026
  - usga-local-rules-2023 (sustituye Committee Procedures — no había PDF completo)
  - whs-rules-of-handicapping-2024
  - fedegolf-chile-rno
- Player's Edition removido del catálogo (no existe como PDF público — USGA solo lo distribuye via web/app).
- **54 tests TDD nuevos pasando** (20 BD integration + 34 unit con mocks).
- `npx tsc --noEmit`: 0 errores.

### Desviaciones del spec maestro

- 5 fuentes en lugar de 6 (Player's Edition no disponible como PDF).
- `set_updated_at()` → reutiliza `update_updated_at()` existente en el proyecto.
- `pdf-parse v2` requiere API nueva `new PDFParse({data}).getText()` (no `pdfParse(buf)`).
- Tests usan `describe.skipIf` + `beforeAll(60_000)` para timeout con embeddings grandes.

**Próxima sesión arranca con:** decisión de Juanjo sobre el **reranker hosted**
(Cohere vs Gemini re-scoring) para cerrar la precisión anti-hallucination, luego
implementarlo, mejorar cobertura FedeGolf, demo en vivo y merge del PR #79.
Tasks 18-28 + ingesta/eval ya cerradas (ver tabla arriba). Eval RAG completa en
`docs/cerebro-v3-ola1e-evaluacion-rag.md` (este doc vive en el branch del PR #79).

## Sub-olas restantes de Ola 1 (post-1e)

| Sub-ola | Días | Estado |
|---|---|---|
| 1b — Distribuciones (USGA/R&A reports, Course DB, Stagner) | 3-4 | bloqueada hasta merge de 1e |
| 1c — Estrategia (Decade, Broadie, podcasts) | 3-4 | bloqueada hasta merge de 1e |
| 1d — Psicología (Rotella, Nilsson, Parent, McCabe, Valiante) | 3-4 | bloqueada hasta merge de 1e |
| 1a — Datos PGA + amateurs (scraping responsable) | 8-10 | bloqueada hasta merge de 1e |

## Ola anterior — CERRADA

## Ola anterior — CERRADA

- **Ola 0 — Limpiar el taller** — estado: `✅ merged 2026-05-27 via PR #67 (merge commit `0e7e56d`)`
- Branch `chore/cerebro-v3-ola-0-claude` borrada del remote + worktree limpio.
- Plan: `docs/superpowers/plans/2026-05-27-cerebro-v3-ola-0.md` (commit `1952ecd`)
- Progreso: **20/20 tasks (100%)** + code review aplicado.
- Worktree: `.claude/worktrees/cerebro-v3-ola-0` en branch `chore/cerebro-v3-ola-0-claude`.

### Tasks completadas

| # | Task | Commit |
|---|---|---|
| 1 | Setup worktree + baseline verde | `a350148` |
| 2 | Estructura v3/ + metrics/ + lib/cerebro/ | `61f57a9` |
| 3 | Snapshot system prompt v2 | `28297bc` |
| 4 | Snapshots regresión 6 métricas v2 sync | `c6bada7` |
| 5 | Migración `cerebro_weights` + trigger `pg_notify` | `d2070df` |
| 6 | Tablas `cerebro_events` + `cost_tracking` + `evaluation_runs` | `6c07364` |
| 7+8 | Tabla `llm_models` (5 roles seed) + flag `cerebro_v3_enabled` | `91dad18` |
| 9+11 | Baseline verde pre-refactor | (sin commit) |
| 10 | Refactor `prompts.ts` a 4 submódulos | `d6b1794` |
| 12 | Extracción de 7 métricas a `metrics/<name>.ts` | `b21184c` |
| 13 | Capa `cerebro_weights` (getAll/get/setWeight) TDD | `dd323dc` |
| 14 | Cache distribuido con TTL + Realtime | `2f66354` |
| 15 | Capa `llm_models` con resolveFallbackChain | `b157b2d` |
| — | Fix colisión `__setClient` en barrel | `196a454` |
| 16+17 | Endpoints admin `weights` GET/PUT + `test-now` POST | `7b5f02f` |
| 18 | Página admin `/admin/cerebro/pesos` con sliders | `6907645` |
| 19 | Harness baseline `evaluate-cerebro.mjs` | `21f08f9` |
| 20 | Push + PR #67 + code review por superpowers:code-reviewer | (PR) |
| — | Merge `origin/main` para no revertir PR #66/#68 | `962e792` |
| — | Code review fixes C1 + I1 (auth SSR, LF en prompt) | `6d4bea7` |
| — | Code review fixes I3 + I4 + I5 + I6 (RLS, race comment, cleanup) | `9b218b9` |

### Estado de la app

- `npx tsc --noEmit`: 0 errores.
- `npm test`: **1800 passed** | 29 skipped | (1829 total).
- `npm run build`: OK.
- Supabase: 5 tablas + 1 columna + migración re-aplicada con RLS WITH CHECK reforzado.
- `cerebro_v3_enabled = true` activado para `juanjoselamarca@gmail.com`.
- **Baseline harness: 26/40 PASS (65%)**. Failures principales: `sg-no-data` 5/5 fail, `shot-by-shot` 5/5 fail (coach v2 alucina pese al anti-hallucination block).
- 5 pesos seed en `cerebro_weights`: pga_data 0.35, distributions 0.15, strategy 0.20, psychology 0.20, rules 0.10.

### Code review resultado

`superpowers:code-reviewer` agent corrió contra el PR #67. Marcó:
- **2 críticos** (C1 auth cookie incorrecto, C2 branch atrás de main): ✅ ambos resueltos.
- **6 importantes** (I1 CRLF injection, I3 RLS WITH CHECK, I4 race condition, I5 channel cleanup, I6 dead code, I2 snapshot weakness documented): ✅ todos resueltos o documentados explícitamente.
- 8 sugerencias menores (S1-S8): follow-ups para olas siguientes.

Comentario completo en PR #67 con resumen.

### Lo que falta para mergear

1. **Demo en vivo con Juanjo** (Rule 4 del protocolo Cerebro V3 — "Cada ola termina con demo en vivo a Juanjo antes de mergear. Sin OK no merge aunque tests pasen."). Mostrar:
   - `/admin/cerebro/pesos` cargado con los 5 sliders.
   - Mover un slider, ver que persiste y `version` incrementa.
   - "Test ahora" muestra los pesos vigentes vía POST.
   - Output del harness baseline (`node --env-file=.env.local scripts/evaluate-cerebro.mjs`).
2. **Si OK de Juanjo** → `gh pr merge --merge --delete-branch` → actualizar este doc con cierre + apuntar próximo paso a Ola 1.

### Desviaciones del plan documentadas

1. **Naming migración:** `YYYYMMDD_*` en vez de `037_*` (colisión + convención vigente).
2. **Firmas de métricas:** 6 sync + 1 async con `(round: RoundData)` reales, no las 7 separadas asumidas.
3. **Cache channel:** `postgres_changes` en vez de `broadcast` (pg_notify no dispara broadcasts).
4. **Harness:** Anthropic SDK directo en vez de `/api/taiger/chat` (sin profile_override y requiere auth).

## Olas siguientes

| Ola | Nombre | Estado |
|---|---|---|
| 0 | Limpiar el taller | **awaiting_demo_and_merge** |
| 1 | El coach estudia el mundo | bloqueada hasta merge de 0 |
| 2 | El coach te conoce | bloqueada hasta merge de 1 |
| 3 | El cerebro guarda y crece | bloqueada hasta merge de 2 |
| 4 | Preguntas que se adaptan | bloqueada hasta merge de 3 |
| 5 | El coach descubre solo | bloqueada hasta merge de 4 |
| 6 | El coach aprende a hablar a cada tipo | bloqueada hasta merge de 5 |

## Decisiones tomadas en la sesión de diseño (2026-05-26)

- ✅ Spec maestro escrito, auditado con 28 correcciones, committeado (`d116fd3`) y pusheado a origin/main.
- ✅ Visión confirmada: 6 piezas del cerebro v3 (catálogo expansivo, multivariables, preguntas emergentes, loop de auto-mejora, nutrición externa, organismo cognitivo).
- ✅ Cerebro paramétrico vivo: 7 garantías técnicas + Supabase Realtime channels para invalidación cross-process.
- ✅ Memoria episódica del coach entra en Ola 2 (+2-3 días).
- ✅ Fine-tuning de Haiku reservado para V3 con opt-in explícito de cada usuario.
- ❌ Voice I/O y Vision multimodal: descartados (no entran en ningún roadmap previsto).
- ✅ Reglas oficiales del juego (USGA/R&A) como skill custom (única excepción a "no book-to-skill v1"), libros de instrucción vía RAG en `knowledge_chunks`.

## Bloqueos / pendientes urgentes

Sólo demo + OK de Juanjo para mergear PR #67.

## Costos comprometidos esta semana

- Baseline harness corrido: ~$0.04 USD.
- Procesamiento inicial de embeddings (Ola 1): $20-50 USD una vez.
- Costos recurrentes: empiezan a contar desde Ola 1. Estimado <$10/mes para 10 usuarios activos con prompt caching activado.

## Histórico de sesiones

| Fecha | Sesión | Resultado |
|---|---|---|
| 2026-05-26 | Brainstorming + spec maestro + auditoría | Spec aprobado y pusheado (`d116fd3`). Memorias + CLAUDE.md + estado vivo creados. |
| 2026-05-27 (madrugada) | Cierre del diseño + plan de Ola 0 | Plan detallado de 20 tasks TDD escrito y pusheado (`1952ecd`). Worktree creado. |
| 2026-05-27 (mediodía + tarde) | **Ejecución Ola 0 completa (20/20)** | Todos los tasks ejecutados, 1800 tests PASS, build OK, baseline harness corrido (26/40), PR #67 abierto con code review aplicado. Espera demo + merge. |
