# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-17 | Commit: `ae07373`

## Último deploy

- **Commit:** `ae07373` — fix: Sprint 9C — fixes urgentes + sistema docs auto-actualizable
- **Fecha:** 2026-03-17
- **Branch:** main (25 commits total)
- **URL:** https://tu-golf.vercel.app

## Páginas en producción (26 páginas)

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

## Admin Dashboard — 9 pestañas operacionales
**Fecha:** 17 Mar 2026
**Estado:** ✅ COMPLETO

### Entregado
- src/lib/admin.ts — seguridad por email
- src/lib/analytics.ts — tracking de eventos
- src/lib/supabaseAdmin.ts — cliente service-role
- ADMIN_SUPABASE.sql — analytics_events + vista admin_daily_metrics
- APIs: /api/admin/overview, users, activity, health
- Layout admin con sidebar responsive + header
- /admin — Overview con KPIs, gráfico actividad, health panel
- /admin/usuarios — tabla paginada con búsqueda y drawer lateral
- /admin/crecimiento — funnel activación + KPIs growth
- /admin/golf — métricas torneos, rondas, tarjetas, distribución HCP
- /admin/taiger — sesiones, patrones, costo API, system prompt
- /admin/monetizacion — MRR/ARR, proyecciones con slider, costos
- /admin/geografia — distribución países, canchas
- /admin/sistema — health check, BD metrics, env vars, errores

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
