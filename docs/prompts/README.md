# docs/prompts — prompts autónomos para Claude Code

Prompts endurecidos (recon + red-team, 2026-07-07) listos para pegar en una sesión
nueva de Claude Code. Cada uno despacha agentes y detecta faltantes con estándar CTO.

## Los dos prompts

| Archivo | Qué hace | Modo |
|---|---|---|
| [`auditoria-campeonato-padre-e-hijo-lb-2026.md`](./auditoria-campeonato-padre-e-hijo-lb-2026.md) | Audita E2E el ciclo completo (inscripción→cierre) de un campeonato **scramble parejas · neto · 9h · cancha "Norte"**. Detecta + arregla con higiene. | Detectar + arreglar, E2E real con limpieza |
| [`game-plan-spec-discovery.md`](./game-plan-spec-discovery.md) | Produce **spec + análisis de brechas** del feature "Game Plan" del coach tAIger+ (estrategia pre-ronda personalizada, visual-first). NO implementa. | Spec + brechas |

## Estado al 2026-07-07 (cierre de sesión)

- ✅ **P0 de neto en equipos YA arreglado y en prod** (PR #245): scramble/foursome a 9h
  sobre canchas con stroke_index 18h-impar (ej. "Norte") sub-asignaban golpes → neto peor.
  Fix: `normalizedStrokeIndexByHole()` en `src/golf/core/stroke-index.ts`, aplicado en
  `calcularScramble`/`calcularFoursome`. Canario: `src/__tests__/team-standings-si-norm.test.ts`.
- 🔴 **Follow-up P0 abierto — `best_ball`**: mismo bug + le falta el ajuste 9h
  (`best-ball.ts` pasa SI crudo sin `roundHoles`). Ver memoria `project_p0_bestball_si_norm_9h`.
- Ambos prompts ya incorporan estos hechos verificados (no los redescubren).

## Orden recomendado para la próxima sesión

1. **Cerrar el `best_ball` P0** (~30 min, mismo patrón que #245) — deja los 3 formatos de
   equipo neto correctos y consistentes.
2. **Correr `auditoria-campeonato-...`** — barre best_ball + los ~9 call-sites con SI crudo
   + prueba el ciclo inscripción→cierre contra prod.
3. **Correr `game-plan-spec-discovery`** — spec del feature nuevo.
