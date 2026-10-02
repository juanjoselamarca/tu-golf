# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-10-02 | Commit: `9776dbb`

## Último deploy

- **Commit:** `9776dbb` — fix(ceo): hallazgos de la revisión de Fable — candado por identidad, retoma vencida, cupo viejo, rescate de ramas, revert por PR, guard con pull_request_target, prompt por stdin
- **Fecha:** 2026-10-01
- **Branch:** chore/scheduler-v4-juanjo-claude (1711 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (56 páginas)

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
- `/organizador`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/salida`
- `/organizador/[slug]/scoring`
- `/perfil/historial`
- `/perfil/historial/[id]`
- `/perfil`
- `/perfil/stats`
- `/planes`
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
- `/torneo/unirme`
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

## 2026-10-01 · Scheduler nocturno v4: trabaja hasta que se acaba el cupo y después retoma

**Problema.** La noche del 29→30-sep los 4 agentes fallaron por el límite de 5 h (16 lanzamientos
quemados) y el deadman informó "4/4 OK". El 01-oct a las 05:26 un agente aplicó a prod migraciones
de un PR sin mergear (#468 → hotfix #470). Además se descubrió que node resolvía `claude` a una copia
WinGet congelada en 2.1.86: los agentes corrían con un CLI de marzo.

**Solución.**
- Cola persistente por noche (`scripts/ceo/state.mjs`). Límite de 5 h → el trabajo queda en pausa,
  se registra una tarea de Windows con WakeToRun para el reset y el proceso termina (sobrevive a
  suspensión y reinicios). Retoma sin tope fijo; "atascado" si se pausa 2 veces sin avanzar.
- Cupo medido con `unifiedWindows` del CLI ≥2.1.286 (5 h y semanal exactos). Techo semanal
  dinámico: 1 − 0,08 × días al reset (0,60 a 0,97), calibrado después con el uso real de Juanjo.
  Semanal agotado → cola congelada; la noche siguiente retoma lo pausado primero.
- Candados mecánicos: los agentes no reciben `SUPABASE_ACCESS_TOKEN`; `run-sql.mjs` pasa por un
  proxy de solo lectura (`supabase_read_only_user`). El scheduler detiene en caliente
  `--no-verify`, `--admin`, merge por API, auto-label `fable-reviewed`, cambios a la protección de
  main, edición del guard y lectura del `.env.local` principal.
- Guard `critical-zone-guard.yml` (pull_request_target) + lista única `.github/critical-zone-paths.txt`.

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
