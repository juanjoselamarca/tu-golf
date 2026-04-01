# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-04-01 | Commit: `0d49d90`

## Último deploy

- **Commit:** `0d49d90` — feat: bloques 9-13 — espectador, stats, landing, onboarding, patterns auto
- **Fecha:** 2026-04-01
- **Branch:** main (298 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (39 páginas)

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
- `/indices`
- `/leaderboard`
- `/login`
- `/organizador/nuevo`
- `/organizador/[slug]/editar`
- `/organizador/[slug]/jugadores`
- `/organizador/[slug]/salida`
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

## Sesion 31 Mar – 1 Apr 2026 — Arquitectura de Torneos + Testing Exhaustivo

**Fecha:** 31 Mar – 1 Apr 2026
**Estado:** COMPLETO — 45 commits, 36 tests, 21+ páginas verificadas
**Bloques:** 8 bloques ejecutados (sesión de ~8h)

### Bloque 1-2: Diseño y Fase 1 de Torneos
- Arquitectura completa documentada en 4 fases (arch/diseño)
- Fase 1: scoring organizer mejorado, score max, net_score bug fix, terminología
- CHECK constraint violations al inscribir jugadores corregidas
- /ronda-libre/nueva protegida por middleware

### Bloque 3: Fase 2 — Inscripción y Grupos
- tournament_groups + afecta_estadisticas + código de inscripción
- Leaderboard de torneo con scores desde rondas libres vinculadas
- Inscripción por código visible en gestión de jugadores
- Fase 2 estabilización: dark mode, OUT/IN en grupo, confirmación finalizar

### Bloque 4: Fase 3 — Reglas de Golf BD + Countback

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
