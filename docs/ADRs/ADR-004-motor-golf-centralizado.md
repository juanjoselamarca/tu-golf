# ADR-004 — Motor de reglas de golf centralizado en `src/golf/`

**Estado**: Aceptado
**Fecha**: 2026-04-10 (fecha aproximada de consolidación del módulo)

## Contexto

Las reglas de golf son complejas y hay muchos formatos (Stroke Play, Stableford, Match Play, Best Ball, Foursome, Scramble). Si la lógica vive dispersa en componentes React:

1. **Imposible testear** sin montar React
2. **Imposible re-usar** entre páginas
3. **Fácil divergir**: dos componentes implementan el mismo cálculo con bugs distintos
4. **Difícil auditar** contra reglas reales (USGA/R&A/Chile Golf)

Ejemplo real anterior: cálculos de handicap/índice duplicados en 3 archivos con sutiles diferencias → jugadores veían stats inconsistentes según la página.

## Decisión

**Todo el dominio golf vive en `src/golf/`**. Es **TypeScript puro** sin imports de React ni Next.

Estructura:

```
src/golf/
  core/         Reglas universales (rules, scoring, compare, colors)
  formats/      Modalidades (stroke-play, stableford, match-play, best-ball, foursome, scramble)
  stats/        Métricas (personal, gwi, cpi)
  courses/      Canchas (types, matching, data queries)
  coach/        tAIger+ prompts y análisis
  notifications/ Motor de notificaciones
```

Reglas:
1. **Los archivos de `src/golf/` NO importan React, Next, ni hooks**. Son TypeScript puro.
2. **Cada formato implementa la interface `GolfFormat`** (`src/golf/formats/index.ts`).
3. **Agregar un formato nuevo** = crear archivo + registrar en `FORMATS` del index.
4. **Funciones puras**: dado el mismo input, siempre mismo output. Testeable al 100%.

## Consecuencias

### Positivas
- **Testing trivial**: vitest sin setup. Ver `src/__tests__/match-play.test.ts`, `stableford-score.test.ts`, etc.
- **Fuente única de verdad**: `compareByVsPar()` en `src/golf/core/compare.ts` → NUNCA comparar por gross absoluto
- **Extensibilidad**: agregar match-play-neto no toca UI, sólo el registry
- **Documentable**: el módulo tiene contratos claros, no es código React acoplado

### Negativas
- **Disciplina requerida**: un dev apurado podría meter lógica golf dentro de un componente
- **Duplicación con `src/lib/`**: archivos como `src/lib/scoring.ts`, `src/lib/gwi.ts`, `src/lib/cpi.ts` son legacy y duplican lo que vive en `src/golf/`. Deuda técnica activa.
- **Tests físicamente separados**: están en `src/__tests__/` en lugar de al lado del código. Ver deuda técnica.

## Violaciones conocidas (a arreglar)

- `src/golf/core/colors.ts` importa `type { CSSProperties } from 'react'`. Es type-only así que no rompe runtime, pero rompe pureza. Fix trivial pendiente (ver P2-8 del audit).

## Cuándo expandir

Cada vez que se implemente un formato, regla o stat nueva:
1. ¿Ya existe en `src/golf/`? Si sí, usar eso.
2. Si no, ¿pertenece al dominio golf? Si sí, crear archivo en `src/golf/`.
3. Si es UI-específico (colores para un banner, labels), puede vivir en `src/lib/` o `src/components/`.

**Regla mental**: "¿este código tendría sentido en un test unitario sin React?" — si sí, va a `src/golf/`.
