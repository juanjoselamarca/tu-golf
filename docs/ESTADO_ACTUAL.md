# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-09-25 | Commit: `982ac4f`

## Último deploy

- **Commit:** `982ac4f` — fix(handicap): el tee de una jugadora sale de la fila DAMAS aunque el torneo apunte a la VARONES
- **Fecha:** 2026-09-25
- **Branch:** fix/rondas-por-cancha-juanjo (1663 commits total)
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

## 2026-09-25 · Un torneo de 2+ rondas no se podía crear — y el motor asumía una sola cancha

**Problema.** Inbox 652707d2: "rounds: Could not find the 'course_id' column of 'rounds'".
El wizard guardaba la cancha/fecha de las rondas 2..N en `rounds`, que es la tabla de
TARJETAS por jugador. No existía dónde guardar la configuración de cada ronda, y todo el
motor (scoring, leaderboard, TV, en vivo, historial) daba por hecho la cancha de la ronda 1.
Decisión PM: cada ronda puede jugarse en cancha y fecha distintas.

**Solución.**
- `tournament_rounds` (migración aditiva aplicada a prod, RLS igual que `categories`).
  La ronda 1 sigue en `tournaments.*`; la regla vive en `src/golf/tournament-rounds.ts`.
- `buildLeaderboardFromLegacy` puntúa cada ronda con SU cancha (`ctx.rounds`): par, SI y
  course handicap WHS. `upsert_score`, `finalizeRound`, el scorer del organizador y las
  cuatro pantallas de board leen la cancha de la ronda desde la misma fuente.
- Fechas absurdas (inbox 891b0199/f83156b1: 01-01-0001): `src/golf/tournament-fechas.ts`,
  una regla para el footer del wizard, `create-tournament`, el camino legacy y los
  `min`/`max` de los inputs. Margen −365/+730 días, ronda 1 = inicio, rondas en orden.
- Ronda nueva precarga la cancha de la ronda 1 y la sigue hasta que se cambie a mano.
- Categorías: `gender` y `default_tee_color` ya no se descartan al publicar (la columna

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
