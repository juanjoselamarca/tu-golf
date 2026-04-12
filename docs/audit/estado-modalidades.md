# Estado de Auditoría de Modalidades

**Fecha:** 2026-04-10
**Branch:** `feat/redesign-scorecards`

## Resumen

| Modalidad   | Spec | Helper | Canary | Checklist | Manual | Estado |
|-------------|------|--------|--------|-----------|--------|--------|
| Stroke Play | ✅    | ✅      | 8/8 ✅  | ✅         | ⏳     | En QA manual |
| Stableford  | ✅    | ✅ nuevo | 13/13 ✅ | ✅        | ⏳     | En QA manual |
| Match Play  | ✅    | ✅ nuevo | 10/10 ✅ | ✅        | ⏳     | En QA manual |
| Best Ball   | ✅    | ✅ existente | 5/5 ✅ | ✅       | ⏳     | En QA manual |
| Scramble    | ✅    | ✅ existente | 4/4 ✅ | ✅       | ⏳     | En QA manual |
| Foursome    | ✅    | ✅ existente | 5/5 ✅ | ✅       | ⏳     | En QA manual |

**Leyenda:**
- **Spec:** documentación formal en `docs/specs/formato-*.md`
- **Helper:** fuente única de verdad en `src/golf/core/*-score.ts` o `src/golf/formats/*.ts`
- **Canary:** tests de regresión en `src/__tests__/canary/*.canary.test.ts`
- **Checklist:** procedimiento manual E2E en `docs/audit/checklist-*.md`
- **Manual:** ejecutado en producción (requiere juego real)

## Helpers centralizados creados

1. `src/golf/core/round-score.ts` — `calcularScoreRonda`, `parTotalEstandar` (pre-existente)
2. `src/golf/core/stableford-score.ts` — `calcularStableford`, `puntosStablefordHoyo`, `strokesRecibidosEnHoyo`
3. `src/golf/core/match-play-state.ts` — `describirMatchState`, `capitalizarNombre`

## Tests canario por bug reportado

| Bug histórico | Canary que lo previene |
|---------------|-----------------------|
| 9 vs 18 hoyos (cuñado, 9 abr) | `stroke-play.canary.test.ts` |
| Nombres sin capitalizar (match play) | `match-play.canary.test.ts` |
| Texto dormie confuso | `match-play.canary.test.ts` |
| Par 72 hardcoded en share card | `stroke-play.canary.test.ts` |

## Cobertura total

- **45 tests canario** específicos para modalidades
- **259 tests totales** en la suite (eran 185 antes de esta auditoría)
- **0 errores TypeScript**
- **Build de producción exitoso**

## Cómo correr la auditoría

```bash
# Correr canarios de una modalidad específica
npm run audit -- stroke-play

# Correr todas las modalidades
npm run audit:all
```

El comando muestra los canarios pasando + ruta al checklist manual a ejecutar.

## Pendientes (QA manual)

Para pasar cada modalidad de "En QA manual" a "Lista para producción",
hay que ejecutar el checklist correspondiente jugando una ronda real en
https://golfersplus.vercel.app. Cada bug encontrado debe convertirse en un
test canario antes de arreglarse.

**Orden sugerido de ejecución del QA manual:**
1. Match Play (prioridad absoluta para clubes chilenos)
2. Stroke Play (modalidad más usada globalmente)
3. Stableford
4. Best Ball
5. Scramble
6. Foursome

## Política activa

- **Cero features nuevas** hasta que las 6 modalidades estén en estado "Lista para producción"
- **Cada bug reportado por usuario real** → canary antes de fix
- **Nunca eliminar** canarios viejos (solo agregar)
- **Pre-push hook** corre todos los canarios automáticamente
