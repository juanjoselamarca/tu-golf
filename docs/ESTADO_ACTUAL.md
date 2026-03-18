# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-18 | Commit: `3cc2da4`

## Último deploy

- **Commit:** `3cc2da4` — fix: QA total — BD flows, RLS, APIs, mobile 14 rutas premium
- **Fecha:** 2026-03-17
- **Branch:** main (43 commits total)
- **URL:** https://tu-golf.vercel.app

## Páginas en producción (32 páginas)

- `/admin/configuracion`
- `/admin/crecimiento`
- `/admin/geografia`
- `/admin/golf`
- `/admin/monetizacion`
- `/admin`
- `/admin/sistema`
- `/admin/taiger`
- `/admin/usuarios`
- `/auth/auth-code-error`
- `/coach/onboarding`
- `/coach`
- `/coach/sesion/nueva/chat`
- `/coach/sesion/nueva`
- `/coach/sesion/[id]`
- `/dashboard`
- `/leaderboard`
- `/login`
- `/organizador/nuevo`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/scoring`
- `/perfil/historial`
- `/perfil`
- `/perfil/stats`
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

## Sprint 10 — el tAIger v1 🐯
**Fecha:** 17 Mar 2026
**Estado:** ✅ COMPLETO

### Entregado
- @anthropic-ai/sdk integrado con modelo claude-sonnet-4-6
- src/lib/taiger-prompt.ts — system prompt v1.0 + context builder
- /api/taiger/chat — streaming SSE con Claude API
- /api/taiger/analyze-round — análisis post-ronda automático
- /coach/onboarding — 12 preguntas psicológicas, 1 a la vez
- /coach — dashboard con patrones, sesiones, freemium counter
- /coach/sesion/nueva — selector de tipo de sesión
- /coach/sesion/nueva/chat — chat streaming con follow-ups
- /coach/sesion/[id] — vista de sesión con seguimiento
- Integración automática post-ronda en scorecard
- "🐯 Mi Coach" en navbar desktop + mobile
- Health check Claude API corregido
- Freemium: 3 sesiones/mes, prevención duplicados
- Analytics: onboarding_completado, taiger_sesion_iniciada

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
