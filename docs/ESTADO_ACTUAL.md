# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-17 | Commit: `f73964b`

## Último deploy

- **Commit:** `f73964b` — feat: Sprint 9B — scoring gross/neto/stableford + GWI probabilidades de ganar
- **Fecha:** 2026-03-16
- **Branch:** main (24 commits total)
- **URL:** https://tu-golf.vercel.app

## Páginas en producción (17 páginas)

- `/auth/auth-code-error`
- `/dashboard`
- `/leaderboard`
- `/login`
- `/organizador/nuevo`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/scoring`
- `/perfil/historial`
- `/perfil`
- `/register`
- `/ronda-libre/nueva`
- `/ronda-libre/[codigo]`
- `/ronda-libre/[codigo]/score`
- `/torneo/[slug]`
- `/torneo/[slug]/score`
- `/torneo/[slug]/tv`

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

## Sprint 9C — Fixes urgentes
**Fecha:** 17 Mar 2026
**Estado:** 🔧 EN CURSO

### Pendiente
- Fix PGA widget invisible en mobile
- Fix error modo_juego
- Historial siempre gross
- SQL idempotente

---

## Sprint 9B — GWI + Gross/Neto/Stableford
**Fecha:** 17 Mar 2026
**Commit:** f73964b
**Estado:** ✅ COMPLETO

### Entregado
- src/lib/scoring.ts — matemáticas golf completas

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
