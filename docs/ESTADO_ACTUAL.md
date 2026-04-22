# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-04-22 | Commit: `0574af2`

## Último deploy

- **Commit:** `0574af2` — docs(plan): Última Ronda Express — plan de implementación task-by-task
- **Fecha:** 2026-04-21
- **Branch:** main (602 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (44 páginas)

- `/admin/analytics`
- `/admin/finanzas`
- `/admin/golf-ops`
- `/admin`
- `/admin/sistema`
- `/admin/usuarios`
- `/admin/usuarios/[id]`
- `/auth/auth-code-error`
- `/coach/onboarding`
- `/coach`
- `/coach/sesion/nueva/chat`
- `/coach/sesion/nueva`
- `/coach/sesion/[id]`
- `/dashboard`
- `/demo`
- `/en-vivo`
- `/importar`
- `/indices`
- `/leaderboard`
- `/login`
- `/organizador/nuevo`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/salida`
- `/organizador/[slug]/scoring`
- `/perfil/historial`
- `/perfil/historial/[id]`
- `/perfil`
- `/perfil/stats`
- `/privacidad`
- `/ranking`
- `/recuperar`
- `/reembolsos`
- `/register`
- `/ronda-libre/nueva`
- `/ronda-libre/[codigo]`
- `/ronda-libre/[codigo]/score`
- `/ronda-libre/[codigo]/score-grupo`
- `/tarjeta/[id]`
- `/terminos`
- `/torneo/[slug]`
- `/torneo/[slug]/score`
- `/torneo/[slug]/tv`
- `/torneo/[slug]/unirse`

## Documentación del proyecto

| Archivo | Contenido |
|---------|-----------|
| [SPRINT_LOG.md](./SPRINT_LOG.md) | Historial de sprints |
| [ROADMAP_COMPLETO.md](./ROADMAP_COMPLETO.md) | Sprints 9C→14 |
| [ARQUITECTURA.md](./ARQUITECTURA.md) | Schema BD + stack |
| [TAIGER_SYSTEM_PROMPT.md](./TAIGER_SYSTEM_PROMPT.md) | Coach IA |
| [GWI_MODELO.md](./GWI_MODELO.md) | Probabilidades de ganar |
| [SQL_PENDIENTE.md](./SQL_PENDIENTE.md) | SQL a ejecutar |

## Sprint Log reciente

# SPRINT LOG — TU GOLF

> Agregar nueva entrada AL INICIO después de cada sprint

---

## Sesión 21-22 Abr 2026 — Cierre técnico del roadmap pre-lanzamiento

**Fecha:** 21-22 Abr 2026 (sesión nocturna paralela a Mi Golf v2 de Juanjo)
**Estado:** COMPLETO — roadmap técnico cerrado salvo 2 acciones manuales pendientes de Juanjo
**Commits:** 20 en main (+ seed aplicado en prod vía Management API)

### Problema
El roadmap `docs/roadmap-camino-100.md` tenía 22 items P0/P1/P2/P3. A la mañana del 21-abr quedaban ~13 sin resolver cubriendo coach gate, offline resilience, visual consistency, imports, multi-loop correctness, iOS push, ranking real, y demo rebuild.

### Shipped (por categoría)

**P0/P1 funcionalidad core:**
- **Coach IA gate (3 rondas mínimo)** — `api/taiger/chat` 403 si <3 rondas; UI redirige con mensaje "Subí tus tarjetas". Defense-in-depth en 4 capas.
- **Offline resilience** (4 gaps cerrados) — patrón ronda-libre portado a `/torneo/score` + `/score-grupo`: localStorage backup + 3 retries + auto-sync on reconnect. Anti-race en finalizar: bloquea si `scoreSync.tienePendientes()`. OfflineBanner global con contador "N hoyos en cola".
- **Signup white theme + pro typography** — palette blanca coherente con NuevoTorneoForm. Playfair 30px, DM Mono labels uppercase, inputs con focus ring dorado.
- **Navbar ranking fix** — quitar link a `/leaderboard` demo; después re-linkearlo a nueva `/ranking` real.
- **Garmin palette unificada** (P1 #10) — +`getScoreColor` / `getScoreColorLight` helpers canónicos. Fix en `constants/golf.ts` SCORE_COLORS (4 de 5 valores estaban mal). Reemplazos en TeamLeaderboard, MobileLeaderboard, ronda-libre spectator.
- **Imports formato/modo** (P2 #13) — `ImportRoundData` acepta `formato_juego` y `modo_juego` opcionales. UI en StepReview con 2 selectores aplicados al batch. Stableford/Match Play fuerzan neto (regla R&A).
- **Multi-loop × per-player tees** (P2 #16) — 5 bugs identificados, 3 must-fix + 1 visual cerrados:

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
