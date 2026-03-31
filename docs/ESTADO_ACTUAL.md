# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-31 | Commit: `45f1ebd`

## Último deploy

- **Commit:** `45f1ebd` — feat: Fase 3 — save indicator visible, OUT/IN organizer, SI label
- **Fecha:** 2026-03-31
- **Branch:** main (269 commits total)
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

## Sesion 30 Mar 2026 (cont.) — Índice Dual + Sistema de Niveles + Estabilización

**Fecha:** 30 Mar 2026
**Estado:** COMPLETO — 11 commits

### Recuperación de sesión interrumpida
- Motor de notificaciones inteligente (shouldNotify)
- Celebraciones birdie/eagle integradas en score page
- Componentes con accesibilidad (ARIA, Escape key)

### Fixes de estabilización (del backlog 17 Mar)
- taiger/context filtra historical_rounds por user_id (P1)
- Middleware ya no logea datos sensibles en producción
- golf/coach/ completo: 7 pattern detectors + analyzeRound() real
- 45+ mensajes de error reescritos en español amigable (37 archivos)
- Eliminación de cuenta: de alert()/confirm() a UI branded con toasts

### Sprint Índice Dual + Niveles
- Migración SQL 010: indice_golfers, nivel, diferencial (con backfill)

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
