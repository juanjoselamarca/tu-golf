# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-06-08 | Commit: `1e2f661`

## Último deploy

- **Commit:** `1e2f661` — import-hardening: prevención (CR/slope del catálogo + matcher + DB) (#122)
- **Fecha:** 2026-06-08
- **Branch:** chore/equipos-e2e-cleanup-claude (1183 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (52 páginas)

- `/admin/analytics`
- `/admin/cerebro/fuentes`
- `/admin/cerebro/pesos`
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

## 2026-06-07 · Equipos E2E — cierre del plan wizard-equipos + limpieza modelo muerto

Cierre formal del plan `2026-05-24-wizard-equipos-e2e`. Al retomarlo se descubrió
que la feature ya está **en producción**: la UI de asignación (modelo "grupo =
equipo", decisión PM 2026-06-02), la validación de tamaño golf-correcta y la
materialización a `ronda_equipos` se construyeron en el refactor de `JugadoresPanel`
y están cubiertas por `useTournamentLifecycle.test.ts`. El plan original apuntaba a
`tournament_teams`, modelo que el equipo abandonó.

- **Test del seam faltante** (`src/__tests__/integration/team-leaderboard.test.ts`):
  integration contra el schema REAL de `fetchScrambleTeams` / `fetchBestBallTeams`
  (lo único del flujo de equipos sin test). Se eligió integration determinista sobre
  browser E2E (CERO FALLOS: cero flakiness, atrapa drift de schema). Con esto los 3
  seams del flujo quedan testeados: materialización (lifecycle) → fetch (este) →
  motor (`team-standings`). 4 tests verdes contra prod, fixture se autolimpia.
- **Fixture reutilizable** (`e2e/helpers/tournament-team-fixture.ts`): siembra el
  grafo completo torneo→grupos→ronda→equipos→membresía con admin client + cleanup
  FK-safe. Reusable para futuros tests de equipos.
- **Modelo muerto eliminado**: `src/lib/data/tournaments/teams.ts` (+ test) y

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
