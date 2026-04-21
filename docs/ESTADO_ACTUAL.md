# TU GOLF — ESTADO ACTUAL

> Auto-generado: 2026-04-21 | Commit: `fe3af49`

## Último deploy

- **Commit:** `fe3af49` — feat(push): soporte iOS Safari — detección de versión + gate PWA + mensajes específicos
- **Fecha:** 2026-04-21
- **Branch:** main (574 commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (43 páginas)

- `/admin/analytics`
- `/admin/finanzas`
- `/admin/golf-ops`
- `/admin`
- `/admin/sistema`
- `/admin/usuarios`
- `/admin/usuarios/[id]`
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
- `/perfil/historial/[id]`
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
- `/tarjeta/[id]`
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

## Sesión 21 Abr 2026 (madrugada) — Sprint 3 E completo (A1+A2+A3 en score-grupo)

**Fecha:** 21 Abr 2026 (00:00–01:00 CL)
**Estado:** ✅ DESPLEGADO en producción
**Alcance:** 3 mejoras UX del audit de score-grupo, cada una en commit separado.

### A1 — Anti-toque accidental (commit `f27ef03`, parte 1)
Captura inicial (hoyo vacío): 1 tap sin fricción. Cambio sobre un score ya existente: primer tap muestra "Tocá otra vez para cambiar el score" + haptic doble + botones +/− en estado dorado pulsante (reutiliza keyframe `livePulse`). Segundo tap dentro de 2s commitea; después de 2s se auto-resetea. Al cambiar de hoyo se limpia el pending. Evita que un toque con guante en pleno sol destruya silenciosamente un score ya guardado.

### A2 — Save inmediato por jugador con debounce (commit `f27ef03`, parte 2)
`saveSinglePlayer(jugadorId, scores)` con 3 retries + backoff 400/800/1200ms. Cada `handleScoreChange` agenda un save 500ms después del último tap (los spam de +/− colapsan en 1 sola llamada al final). `saveStatus` refleja saving → saved → idle con el indicador de 3px ya existente. `hasUnsaved` se limpia al completarse el save. `goToNextHole` conserva `saveAllScores` como safety net. Cleanup de timers al desmontar.

### A3 — Edit window de 3s (commit `67ce877`)
Tras un cambio confirmado, abre una ventana de 3s sobre ese mismo jugador/hoyo donde taps sucesivos commitean directamente sin re-pedir confirmación. Cada nuevo tap dentro del window renueva el timer. Pasados 3s sin taps, la siguiente modificación vuelve a exigir 2-tap. Resultado: correcciones iterativas (9 → 4) requieren 2 taps + 3 taps de ajuste (5 total), en lugar de 4 pares de confirmar+commit (8 total). Zero nuevas UI — solo refs internos.

### Foursome stableford — NO es un bug
El audit del 20-abr mencionó "foursome stableford con `handicap_equipo` null usa 0 strokes". Investigado: el bloque de render de equipos en score-grupo solo aplica a scramble/foursome (línea 857), y el check `formatoJuego === 'stableford'` dentro de ese bloque es dead code defensivo — stableford nunca coincide con un formato de equipo. En el CREATION flow, `scramble` calcula handicap vía fórmula USGA (35% lower + 15% higher) y `foursome` lo calcula como promedio; nunca quedan null. Best_ball es el único que deja null, pero no usa `handicap_equipo` (usa handicaps individuales). No hay bug que arreglar.

### Pendiente para futuras sesiones

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
