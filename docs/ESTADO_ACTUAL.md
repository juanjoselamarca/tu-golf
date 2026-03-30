# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-30 | Commit: `1a5e37b`

## Último deploy

- **Commit:** `1a5e37b` — security: Sprint 5 completado — X-XSS-Protection, CORS restrictivo en /api/en-vivo + Sentry instrumentation.ts
- **Fecha:** 2026-03-30
- **Branch:** main (225 commits total)
- **URL:** https://tu-golf.vercel.app

## Páginas en producción (36 páginas)

- `/admin/analytics`
- `/admin/finanzas`
- `/admin/golf-ops`
- `/admin`
- `/admin/sistema`
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
- `/leaderboard`
- `/login`
- `/organizador/nuevo`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/scoring`
- `/perfil/historial`
- `/perfil`
- `/perfil/stats`
- `/privacidad`
- `/reembolsos`
- `/register`
- `/ronda-libre/nueva`
- `/ronda-libre/[codigo]`
- `/ronda-libre/[codigo]/score`
- `/ronda-libre/[codigo]/score-grupo`
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

## Sesion 30 Mar 2026 — Sprint 5 completado + Sentry instrumentation

**Fecha:** 30 Mar 2026
**Estado:** COMPLETO

### Sprint 5 — Seguridad (items faltantes)
- X-XSS-Protection header agregado en next.config.js
- CORS restrictivo en /api/en-vivo (solo tu-golf.vercel.app en prod)
- Items previamente completados: admin/health auth (403), push/preferences auth

### Sentry instrumentation.ts
- Migrado de sentry.*.config.ts standalone a instrumentation.ts (Next.js moderno)
- onRequestError hook configurado para captura automatica de errores server-side
- Elimina deprecation warnings de @sentry/nextjs

### Sprint log sesion 29 Mar (retroactivo)
- 9 sprints del MAESTRO implementados (1,9,2,6,3,4,7,8)
- Sentry condicional (solo con DSN), cron Vercel ajustado a diario
- Commits: e886eba, e633524, 1949b03, f8f99c5, c56e5ba, 6bc3583, ca97faa, 44836cf

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
