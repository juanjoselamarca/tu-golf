# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-03-29 | Commit: `f8f99c5`

## Último deploy

- **Commit:** `f8f99c5` — legal: terminos, privacidad, reembolsos (Ley 19.628 y 19.496 Chile) + checkbox registro
- **Fecha:** 2026-03-29
- **Branch:** main (220 commits total)
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

## Sesion 25-26 Mar 2026 — Restauracion + Seguridad + Features

**Fecha:** 25-26 Mar 2026
**Estado:** COMPLETO

### Incidente y restauracion
- App caida por refactor del Navbar (async en onAuthStateChange)
- Causa raiz identificada, Navbar restaurado con fix minimo
- Funcionalidades perdidas re-aplicadas (admin al login, limite 500, ?add=true)
- Post-mortem documentado en docs/POSTMORTEM_2026-03-25.md

### Barreras anti-caida
- Pre-push hook: bloquea push si tsc/tests/build fallan
- 15 tests canario: detectan patrones peligrosos en archivos criticos
- Protocolo de archivos protegidos en CLAUDE.md
- Ya salvo un push con error de ESLint en esta misma sesion

### Monitoreo Fase 1
- /api/health: endpoint publico para monitoreo externo

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
