# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-06-18 | Commit: `3267d66`

## Último deploy

- **Commit:** `3267d66` — Resultados ronda-libre v2: refactor [codigo]/page.tsx (2038→275) + 4 fixes del cluster (128/120/124/126) (#178)
- **Fecha:** 2026-06-19
- **Branch:** main (1252 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (53 páginas)

- `/admin/analytics`
- `/admin/cerebro/fuentes`
- `/admin/cerebro/pesos`
- `/admin/costos`
- `/admin/e2e`
- `/admin/finanzas`
- `/admin/golf-ops`
- `/admin`
- `/admin/sistema`
- `/admin/sistema/taiger/dashboard`
- `/admin/sistema/taiger/live`
- `/admin/sistema/taiger`
- `/admin/sistema/taiger/playground`
- `/admin/sistema/taiger/[userId]`
- `/admin/usuarios`
- `/admin/usuarios/[id]`
- `/auth/auth-code-error`
- `/coach`
- `/coach/progreso`
- `/coach/sesion/[id]`
- `/dashboard`
- `/demo`
- `/demo/taiger`
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
- `/torneo/[slug]/en-vivo`
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

## 2026-06-18 · Resultados ronda-libre v2 — refactor monstruo #2 + cluster de 4 fixes (PR #178)

Job del cluster `/inbox`: refactor de `src/app/ronda-libre/[codigo]/page.tsx` (vista
pública del leaderboard en vivo, **monstruo #2**) al estándar, MÁS los 4 reportes que
caían en él. `2038 → 275 LOC`. Squash-merge `3267d66`, deploy prod success, fix 128
verificado en vivo.

- **Refactor (behavior-preserving):** capa de datos `lib/data/ronda-libre.ts`
  (`loadRondaLibre`, batch de `profiles` con `.in()` que elimina un N+1), hooks
  (`useRondaLibreLive`/`useGWI`/`useViewer`), cálculos puros testeados
  (`lib/ronda/leaderboard.ts` +test, `match.ts`, `share.ts`), ~17 componentes +
  `matchplay/`. 0 `supabase.from` directo, 0 `console.*`. Eliminado código muerto
  (modal de edición admin inalcanzable). Smoke visual before/after **pixel-idéntico**
  en stroke/stableford/match_play/best_ball.
- **128 (bug):** el cuadro GANADOR de modalidades por equipos usaba el ranking
  individual → mostraba al jugador top en vez del equipo. Ahora usa `rankTeams()`,
  consistente con el TeamLeaderboard.
- **120:** pill de modalidad arriba del cuadro ganador.
- **124:** tabla detalle match play con `tableLayout: fixed` + colgroup (anchos

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
