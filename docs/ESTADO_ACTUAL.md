# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-08-11 | Commit: `3caa754`

## Último deploy

- **Commit:** `3caa754` — fix(scorer): el par hoyo por hoyo no llegaba a los clubes de 27 hoyos, y nada lo chequeaba (#303)
- **Fecha:** 2026-08-09
- **Branch:** chore/cierre-catalogo-docs-claude (1402 commits total)
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

## 2026-08-09 · El par hoyo por hoyo no llegaba a los clubes de 27 hoyos (PR #303)

Sesión que empezó auditando el catálogo de canchas y terminó cerrando un bug de
correctitud vivo en tres clubes reales.

**Lo que se encontró.** El guardarrail de cancha contestaba si el *rating* mentía,
pero nunca si el par de cada hoyo EXISTE — y sólo corría en modo neto. Por ese
hueco quedaron 4 rondas libres finalizadas (mar-abr 2026, 12 jugadores) apuntando
al club padre de un complejo de 27 hoyos sin recorridos elegidos.

**Lo que había debajo.** El code review destapó que era peor: había dos formas
incompatibles de contestar "¿cuáles son los hoyos de esta ronda?". El motor de
handicap leía los recorridos HIJOS (correcto); el de par por hoyo, escrito inline
en cuatro pantallas, buscaba en el club PADRE — que tiene 0 filas en
`course_holes`. Resultado: Brisas, Rocas y Marbella puntuaban con **18 hoyos par 4
y stroke index inventado 1..18**.

Nadie lo reportó en meses porque 18 × par 4 = 72, que es exactamente el par real de
esas canchas. El agregado cerraba; lo que estaba mal era la distribución.

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
