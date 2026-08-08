# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-08-08 | Commit: `02a197e`

## Último deploy

- **Commit:** `02a197e` — fix(guardarrail): el gate de recorridos deriva los hoyos igual que el motor
- **Fecha:** 2026-08-08
- **Branch:** fix/guardarrail-rating-9h-claude (1411 commits total)
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


## 2026-08-06 · Una cancha de 9 hoyos en un torneo de 18 son DOS VUELTAS (PR #292)

El motor pedía 18 hoyos a un catálogo de 9, no encontraba los hoyos 10-18 y los
completaba a par 4 con stroke index inventado. Todo en silencio: el par de la ronda
salía 72 en vez de 70, ese 72 entraba a la fórmula WHS contra un Course Rating de 9
hoyos —`(CR − par)` corrido ~36 golpes— y media vuelta se puntuaba contra par 4.
Ahora la segunda vuelta se modela de verdad: los hoyos 10-18 son los 1-9 otra vez,
con su par real y el stroke index de la tarjeta de 18 que imprime un club de 9.

- **`src/golf/courses/vueltas.ts` — fuente única** de tres conceptos que estaban
  re-derivados inline en cinco lugares: en qué escala está el dato, cuántas vueltas
  da la ronda, y qué hoyos se juegan. Course Rating y par son aditivos por vuelta;
  el slope no se escala. Cada hoyo declara de qué hoyo del catálogo salió (`origen`),
  así nadie tiene que re-derivar la correspondencia para los yardajes.
- **Guardarrail de rating (A1-A5).** Un rating que no cierra en ninguna escala ya no
  produce handicaps absurdos: el motor anula el término `(CR − par)` y el organizador
  se entera ANTES de crear el torneo, no en el hoyo 7.
- **Reconciliación con el #293.** Ese PR aterrizó en `main` 18 horas después y cambió

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
