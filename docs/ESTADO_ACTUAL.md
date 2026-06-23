# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-06-23 | Commit: `231d292`

## Último deploy

- **Commit:** `231d292` — Coach chat PR2 — fundación UX mobile (teclado, voseo/Shift+Enter, 👍/👎, degradación honesta) (#185)
- **Fecha:** 2026-06-23
- **Branch:** main (1262 commits total)
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

## 2026-06-22 · Coach chat PR2 — fundación UX mobile (#185)

Primer cambio **visible** del rediseño del chat del coach tAIger+ (plan
`docs/superpowers/plans/2026-06-18-coach-chat-redesign-build.md`). Enfocado a uso
real en cancha: una mano, guante, apuro. PR1 (refactor base) ya estaba en prod (#179).

- **Teclado mobile (D7/E6):** `useVisualViewport` sube el input sobre el teclado
  (visualViewport), con cleanup de listeners en unmount y guard contra doble offset
  con `safe-area-inset-bottom`. `computeKeyboardInset` pura + testeada. Autoscroll en
  streaming `behavior:'auto'` + throttle por frame (no smooth por token).
- **Input:** `textarea` voseo ("Escribí tu mensaje…"), Enter envía / Shift+Enter salto
  (`isSendKey` pura), font 16px (sin zoom iOS), auto-grow, touch 48px.
- **👍/👎 por mensaje (D9/E2):** tabla nueva `taiger_message_feedback` + endpoint
  `/api/taiger/message-feedback`. NO reusa el rating de estrellas (CHECK 1-5 por sesión).
  Anclado a **hash de contenido** (`message_key`), NO a índice posicional — el
  code-reviewer cazó que el backend reordena el array persistido (slice -20 + shift del
  opener) y el voto se perdía al recargar. Verificado con recarga en smoke. Estrellas
  retiradas de la UI; columna histórica intacta.
- **Degradación honesta (D6):** distingue "no me pude conectar" de "la respuesta se

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
