# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-30 | Commit: `fa8c07c`

## Último deploy

- **Commit:** `fa8c07c` — ux: registro expandido, copy mas claro en landing/stats, confirm mejorado en historial
- **Fecha:** 2026-03-30
- **Branch:** main (237 commits total)
- **URL:** https://tu-golf.vercel.app

## Páginas en producción (37 páginas)

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
- `/recuperar`
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

## Sesion 30 Mar 2026 — Seguridad, Sentry, Auditoria de Calidad, UX para 60+

**Fecha:** 30 Mar 2026
**Estado:** COMPLETO

### Sprint 5 — Seguridad (items faltantes)
- X-XSS-Protection header agregado en next.config.js
- CORS restrictivo en /api/en-vivo (solo tu-golf.vercel.app en prod)

### Sentry activado en produccion
- DSN configurado en .env.local y Vercel production
- sentry.client.config.ts migrado a instrumentation-client.ts (Next.js moderno)
- global-error.tsx captura errores de React rendering
- onRouterTransitionStart para tracking de navegacion

### Auditoria de calidad MAESTRO
- Bug critico: /api/en-vivo filtraba por 'in_progress' (valor que no existe en BD)
- Corregido a 'en_curso' (valor real)
- Font Inter eliminada (no se usa), ESLint warnings resueltos

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
