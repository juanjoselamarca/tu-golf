# Estado Cerebro V3 — Actualizado 2026-05-27 12:42 GMT-4

> Este archivo es el dashboard vivo del proyecto cerebro v3. Se actualiza al cierre de cada sesión que toque el proyecto. Si lees esto al iniciar una sesión, sabés exactamente dónde retomar.
>
> Fuente única de verdad arquitectónica: `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`.

## Ola actual

- **Ola 0 — Limpiar el taller** — estado: `in_progress`
- Plan: `docs/superpowers/plans/2026-05-27-cerebro-v3-ola-0.md` (commit `1952ecd`)
- Progreso: **10/20 tasks (50%)**
- Worktree: `.claude/worktrees/cerebro-v3-ola-0` en branch `chore/cerebro-v3-ola-0-claude`.

### Tasks completadas (8 commits)

| # | Task | Commit |
|---|---|---|
| 1 | Setup worktree + baseline verde | `a350148` |
| 2 | Estructura v3/ + metrics/ + lib/cerebro/ | `61f57a9` |
| 3 | Snapshot system prompt v2 | `28297bc` |
| 4 | Snapshots regresión 6 métricas v2 sync | `c6bada7` |
| 5 | Migración `cerebro_weights` + trigger `pg_notify` | `d2070df` |
| 6 | Tablas `cerebro_events` + `cost_tracking` + `evaluation_runs` | `6c07364` |
| 7+8 | Tabla `llm_models` (5 roles seed) + flag `cerebro_v3_enabled` | `91dad18` |
| 9+11 | Sanity check pre-refactor (sin commit, solo verificación) | — |

### Estado de la app

- `npx tsc --noEmit`: 0 errores.
- `npm test`: 1778 passed | 21 skipped | 1 todo (1800 total).
- `npm run build`: OK.
- Supabase: 5 tablas nuevas + 1 columna en `profiles`, todas verificadas con smoke test.
- `cerebro_v3_enabled = true` activado para `juanjoselamarca@gmail.com`.

### Desviaciones del plan documentadas

1. **Naming de migración:** plan usaba `037_*` pero ya existen 2 migraciones con ese prefijo + convención vigente (24-may) es `YYYYMMDD_descripcion.sql`. Usé `20260527_cerebro_v3_observability.sql`.
2. **Firma de funciones de métricas:** plan asumía 7 funciones públicas `(hole_scores, par_per_hole)`. Realidad: 6 sync + 1 async, todas `(round: RoundData)`. Adapté tests, expuse 6 con marca `@internal`, dejé `computeTotalGrossCV` como `it.todo()` para Task 12.

## Próxima sesión arranca con

1. Verificar repo + worktree (protocolo de inicio del Apéndice de CLAUDE.md sección "Protocolo Cerebro V3").
2. `cd .claude/worktrees/cerebro-v3-ola-0` → `git pull origin main` (por si hubo merges externos).
3. **Task 10**: Refactor `prompts.ts` a 4 submódulos (`identidad`/`contexto`/`plantillas`/`anti_hallucination`). Snapshot test del Task 3 es la red de seguridad — si rompe, parar y diagnosticar.
4. **Task 12**: Refactor `compute-plan-outcome.ts` métricas a `metrics/<name>.ts`. Snapshots Task 4 son la red de seguridad. Incluye anclar `computeTotalGrossCV` (que quedó `it.todo()`).
5. **Tasks 13-20**: data layer + cache realtime + endpoints admin + página `/admin/cerebro/pesos` + harness baseline + pre-push completo + demo a Juanjo.

## Olas siguientes

| Ola | Nombre | Estado |
|---|---|---|
| 0 | Limpiar el taller | **in_progress** (10/20 done) |
| 1 | El coach estudia el mundo | bloqueada hasta merge de 0 |
| 2 | El coach te conoce | bloqueada hasta merge de 1 |
| 3 | El cerebro guarda y crece | bloqueada hasta merge de 2 |
| 4 | Preguntas que se adaptan | bloqueada hasta merge de 3 |
| 5 | El coach descubre solo | bloqueada hasta merge de 4 |
| 6 | El coach aprende a hablar a cada tipo | bloqueada hasta merge de 5 |

## Olas cerradas

(ninguna todavía)

## Decisiones tomadas en la sesión de diseño (2026-05-26)

- ✅ Spec maestro escrito, auditado con 28 correcciones, committeado (`d116fd3`) y pusheado a origin/main.
- ✅ Visión confirmada: 6 piezas del cerebro v3 (catálogo expansivo, multivariables, preguntas emergentes, loop de auto-mejora, nutrición externa, organismo cognitivo).
- ✅ Cerebro paramétrico vivo: 7 garantías técnicas + Supabase Realtime channels para invalidación cross-process.
- ✅ Memoria episódica del coach entra en Ola 2 (+2-3 días).
- ✅ Fine-tuning de Haiku reservado para V3 con opt-in explícito de cada usuario.
- ❌ Voice I/O y Vision multimodal: descartados (no entran en ningún roadmap previsto).
- ✅ Reglas oficiales del juego (USGA/R&A) como skill custom (única excepción a "no book-to-skill v1"), libros de instrucción vía RAG en `knowledge_chunks`.
- ✅ Memorias del proyecto creadas/actualizadas: `project_cerebro_v3_metricas_relativas`, `feedback_metodologia_cerebro_v3`, `feedback_cerebro_parametrico_vivo`, `reference_cerebro_v3_arquitectura`. Index en `MEMORY.md`.
- ✅ `CLAUDE.md` actualizado con sección "Protocolo Cerebro V3".

## Bloqueos / pendientes urgentes

(ninguno)

## Costos comprometidos esta semana

- Procesamiento inicial de embeddings (Ola 1): $20-50 USD una vez (Whisper para audio + chunks de PDFs/libros).
- Costos recurrentes: empiezan a contar desde Ola 1. Estimado <$10/mes para 10 usuarios activos con prompt caching activado.

## Histórico de sesiones

| Fecha | Sesión | Resultado |
|---|---|---|
| 2026-05-26 | Brainstorming + spec maestro + auditoría | Spec aprobado y pusheado (`d116fd3`). Memorias + CLAUDE.md + estado vivo creados. |
| 2026-05-27 (madrugada) | Cierre del diseño + plan de Ola 0 | Plan detallado de 20 tasks TDD escrito y pusheado (`1952ecd`). Worktree creado. Listo para arrancar Task 1. |
| 2026-05-27 (mediodía) | Ejecución Ola 0 — Tasks 1-9+11 | 10/20 tasks completas (50%). 8 commits desde `a350148` a `91dad18`. Infraestructura SQL del cerebro v3 100% creada y verificada en prod. Snapshots de regresión pre-refactor anclados. Próximo: refactor de `prompts.ts` y `compute-plan-outcome.ts`. |
