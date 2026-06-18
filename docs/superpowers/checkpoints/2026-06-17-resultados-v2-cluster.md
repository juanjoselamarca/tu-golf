# Checkpoint — Job "Resultados ronda-libre v2 (equipos)"

**Fecha:** 2026-06-17
**Origen:** corrida `/inbox` del 17-jun. 2 reportes cerrados (PR #174 golpes-neto, PR #175 resumen-ronda). Este job agrupa los 4 reportes que caen en el mismo archivo monstruo + 1 feature ya diferida.
**Estado:** NO iniciado. Pendiente de sesión dedicada (decisión: no hacerlo apurado al final de una sesión larga; el código se ve en torneos reales → foco fresco + eng-review).

---

## Qué es el job

Refactorizar `src/app/ronda-libre/[codigo]/page.tsx` (**2038 LOC, archivo monstruo #2** de la lista "sucios") al estándar (hooks + components + capa de datos), y *sobre eso* meter 4 cambios. Aplica la regla "el que toca, ordena": refactor obligatorio ANTES de tocar.

## Los reportes del cluster (todos en `page.tsx`, status=`triaged` en `inbox_reports`)

| msg | tipo | qué |
|----|------|-----|
| **128** | bug correctitud | El cuadro **GANADOR** se arma con `leaderboard[0]` (ranking INDIVIDUAL) bajo la condición `formato_juego !== 'match_play'` (≈ línea 806). Esa condición incluye `best_ball`/`scramble`/`foursome` → muestra el jugador top en vez del **equipo ganador**. En la misma ronda el TeamLeaderboard de abajo (líneas ~1338-1480) SÍ rankea equipos. Fix: el cuadro ganador debe usar el ranking de equipos cuando la modalidad es por equipos. |
| **120** | visual | En el cuadro ganador, poner la **modalidad/formato arriba** (hoy está abajo en la sección CLUB/FECHA/JUGADORES/FORMATO) para simplificar la lectura. |
| **126** | feature | En best ball, **tocar "Equipo 1/2"** debe desplegar la **tarjeta del equipo** en el formato estándar (igual que al tocar nombres de jugadores, que hoy sí expanden individuales). Interacción nueva. |
| **124** | visual | Tarjeta **detalle match play** (≈ líneas 670-711 + componente `Scorecard`): ancho de columnas raro + quitar el "**P4/P3**" junto al número de hoyo (ensucia). |

**Aparte (NO es del cluster page.tsx):**
| 114 | feature | "**Abrir inscripciones**" de torneo (draft→open). Spec ya existe: `docs/superpowers/specs/2026-06-11-abrir-inscripciones-torneo-design.md`. Toca `JugadoresPanel.tsx` (1112 LOC, otro monstruo). Job independiente, no mezclar. |

## Piezas reutilizables (ya existen, no reinventar)

- Ranking de equipos: `src/lib/ronda/team-ranking.ts` → `rankTeams()` (ya importado en page.tsx línea 24).
- Best ball: `src/golf/formats/best-ball.ts` → `calcularBestBall`, `ordenarEquiposBestBall`.
- Patrón de refactor validado: `score/page.tsx` (1951→1025) en hooks/ + components/. Misma carpeta.

## Orden de arranque sugerido

1. `git pull origin main` + leer este checkpoint.
2. `plan-eng-review` del refactor de `page.tsx` al estándar (lockear arquitectura: qué hooks, qué componentes, qué va a `src/lib/data/` — ANTES de tocar).
3. Worktree dedicado (`node scripts/setup-worktree.mjs resultados-v2 feat`).
4. Refactor → commit aislado, validado (tsc + tests + build + smoke).
5. **128** (bug ganador-equipo, mayor valor) → commit.
6. **120** (layout) + **124** (columnas) → commits.
7. **126** (feature tarjeta de equipo) → commit (puede necesitar design-shotgun para el despliegue).
8. `superpowers:code-reviewer` (diff >100 LOC seguro) + demo a Juanjo + merge.

## Notas operativas

- ~19 directorios de worktree huérfanos con lock de OneDrive (branches ya borradas). Limpieza fuera de banda cuando OneDrive libere handles; no afecta git.
- Las notas completas de cada reporte están en `inbox_reports.notas` (match por `telegram_message_id`).
