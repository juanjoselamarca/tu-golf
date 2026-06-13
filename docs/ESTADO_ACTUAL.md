# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-06-13 | Commit: `ed00d10`

## Último deploy

- **Commit:** `ed00d10` — feat(costos): PR-0 medición real de costo de IA por item (#161)
- **Fecha:** 2026-06-13
- **Branch:** docs/sprint-costos (1224 commits total)
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

## 2026-06-12 · PR-0 Medición real de costo de IA por item — EN PROD (PR #161)

Cierre del agujero de observabilidad que dejó el credit-out del 11-jun: el coach
llamaba a Anthropic **directo**, salteando el gateway que loguea en `ai_usage`. El
mayor consumidor de tokens de la app no se medía. Este PR-0 hace medible el
unit-economics ANTES de subir tokens/turno con el plan WOW del coach.

- **Migración aditiva a `ai_usage`** (`20260612_ai_usage_cost_tracking.sql`): `user_id`,
  `surface`, `session_id`, `cache_read_tokens`, `cache_write_tokens` (+índices).
  Backward-compatible, idempotente, **aplicada en prod** (columnas vivas).
- **`estimateCostUsd` cache-aware** (`src/lib/ai/costs.ts`): cache write 1.25×, read
  0.10× sobre la tarifa input; overload posicional legacy para el gateway. Sin esto el
  costo del coach (caching ephemeral agresivo) salía mal.
- **Coach instrumentado** (`chat-engine.ts` + `usage-accumulator.ts`): acumula
  `message.usage` sobre TODO el tool-loop + la regeneración aritmética y loguea 1
  row/turno `surface=coach_chat`. **Aditivo y fire-and-forget — no cambia ni bloquea
  el turno** (CERO FALLOS).
- **Surfaces tagueadas** vía `callLLM`: `import_insight`, `tournament_assistant`,
  `coach_chat` (fallback degradado), `eval` (judge → `ai_env=dev`, excluido de prod).

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
