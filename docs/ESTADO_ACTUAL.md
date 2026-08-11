# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-08-11 | Commit: `2e2ca6d`

## Último deploy

- **Commit:** `2e2ca6d` — fix(scorer): cierra el PASS — el botón de deshacer no queda mudo y el dedupe no se come avisos ajenos
- **Fecha:** 2026-08-10
- **Branch:**  (1409 commits total)
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

## 2026-08-09 · Los cuatro caminos que escriben score repartían handicaps distintos (PR #302)

El torneo tiene **cuatro** rutas que calculan el neto de un hoyo. Tres repartían con
el **índice crudo** en vez del course handicap del gate: el scorer del jugador (el que
se usa en cancha), el fallback del servidor en `upsert_score`, y el GWI. Las tres
primeras **persisten** `net_score` y `points` — no era display, el número equivocado
quedaba en la base.

Con datos reales de prod (**Club de Golf Los Leones, slope 142 / CR 75.1, par 72**) un
índice 12 recibe **18** golpes. Se repartían 12: **seis golpes por jugador** en un
torneo neto.

El peor de los tres era el del servidor. Dos call sites del scorer **del organizador**
mandan `upsert_score` sin neto —el "deshacer" y `saveHoleStat` (putts/fairway/GIR)—,
así que el organizador scoreaba bien, alguien marcaba *"2 putts"* en ese hoyo, y el
servidor **reescribía el neto correcto con el índice**. El dato bueno se corrompía
solo, sin tocar el scorer del jugador y sin ninguna señal en pantalla.

**Por qué dejó de ser latente:** el bug dormía mientras todos los torneos eran

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
