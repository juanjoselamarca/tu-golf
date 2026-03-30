# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-30 | Commit: `1fd3bde`

## Último deploy

- **Commit:** `1fd3bde` — feat: UI índice dual + niveles en perfil
- **Fecha:** 2026-03-30
- **Branch:** main (261 commits total)
- **URL:** https://golfersplus.vercel.app

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

## Sesion 30 Mar 2026 — Sesion masiva: seguridad, Sentry, PostHog, UX, rebrand, golf module

**Fecha:** 30 Mar 2026
**Estado:** COMPLETO — 20+ commits

### Sprint 5 — Seguridad completado
- X-XSS-Protection header, CORS restrictivo en /api/en-vivo

### Sentry + PostHog activados en produccion
- Sentry: DSN configurado, instrumentation-client.ts, global-error.tsx
- PostHog: autocapture pageviews/clicks, respect DNT, sin IP tracking

### Bug critico corregido
- /api/en-vivo filtraba por 'in_progress' (no existe en BD) → corregido a 'en_curso'

### 10 mejoras UX para usuarios 60+
- Toast en errores (crear ronda, score, torneo) — antes: console.error invisible
- Pagina /recuperar contraseña nueva
- Tipografia Navbar mas legible (10→11px)

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
