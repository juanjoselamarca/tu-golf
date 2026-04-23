# Baseline de cobertura de tests — 2026-04-23 (v2 recalibrado)

**Última actualización**: 2026-04-23 14:30 — **baseline recalibrado tras descubrir que la primera medición subestimaba**.

## Qué pasó con el baseline inicial

La primera ejecución de `npx vitest run --coverage` (mañana del 2026-04-23) reportó:
- Statements 76.88%, Branches 72.41%, Functions 83.32%, Lines 78.64%

Esos números **eran engañosos**. Coverage-v8 sólo contaba archivos cargados durante la suite de tests. Muchos archivos sin tests (ej: `src/hooks/useScoreSync.ts`, `src/lib/analytics.ts`, `src/golf/notifications/engine.ts`) no aparecían en el reporte — parecía que el árbol era más pequeño de lo que es.

Al mediodía del 2026-04-23 se agregaron tests de `cargarCourseData()` que usan `vi.mock('@/lib/supabase')`. El mock carga el barrel de Supabase, y eso trajo a la suite de coverage todos los archivos del árbol `src/` que el barrel toca indirectamente. Resultado: **el total de statements pasó de 7.727 → 21.378** — el repo siempre fue más grande, simplemente no se medía.

## Baseline real (v2)

| Métrica | Valor real | Valor inicial (engañoso) |
|---|---|---|
| **Statements** | **27.62%** (5.906/21.378) | 76.88% |
| **Branches** | **21.83%** (4.156/19.032) | 72.41% |
| **Functions** | **25.78%** (1.097/4.255) | 83.32% |
| **Lines** | **27.07%** (4.766/17.600) | 78.64% |

## Thresholds ajustados (vitest.config.ts)

Reducidos al baseline real menos 2 puntos de margen:

```ts
thresholds: {
  statements: 25,
  branches: 20,
  functions: 23,
  lines: 25,
}
```

**Política de mejora**: cada vez que se eleva la cobertura de un archivo al 0%, subir los thresholds 2 puntos. El CI los enforce.

## Áreas fuertes (100% o casi)

| Módulo | Statements |
|---|---|
| `src/golf/core/course-handicap.ts` | **100%** (nuevo 2026-04-23, antes 9.52%) |
| `src/golf/core/countback.ts` | 100% |
| `src/golf/core/match-play-state.ts` | 100% |
| `src/golf/formats/foursome.ts` | 94.87% |
| `src/golf/formats/scramble.ts` | 97.87% |
| `src/golf/stats/gwi.ts` | 93.49% |
| `src/lib/mi-golf/*` | 95.76% |
| `src/lib/ronda/helpers.ts` | 90.16% |
| `src/hooks/ronda/*` | 100% |

## Áreas débiles (<10%) — candidatas a P1

Archivos con 0% cobertura que deberían tener tests (en orden de prioridad):

| Archivo | Prioridad | Por qué |
|---|---|---|
| `src/golf/core/stroke-index.ts` | 🔴 P1 | Lógica core golf — asignación de golpes |
| `src/golf/stats/personal.ts` | 🔴 P1 | Stats mostradas al usuario |
| `src/golf/courses/data.ts` | 🟡 P2 | Queries BD — mockeable pero laborioso |
| `src/golf/notifications/engine.ts` | 🟡 P2 | Motor notificaciones push |
| `src/hooks/useScoreSync.ts` | 🔴 P1 | Sync scoring offline — crítico en cancha |
| `src/lib/import-round.ts` (20%) | 🟡 P2 | Import Garmin/CSV |
| `src/lib/push-notifications.ts` (21%) | 🟡 P2 | Push subscriptions |
| `src/lib/share-card.ts` (5%) | 🟢 P3 | Canvas — difícil de testear unitariamente |

## Progreso 2026-04-23

1. ✅ `src/golf/core/course-handicap.ts`: 9.52% → **100%** (12 tests nuevos en `cargar-course-data.test.ts`)

## Roadmap sugerido

**Semana 1** — atacar P1:
- `stroke-index.ts`: 0% → ≥80% (similar a `resolverCourseHandicap` — fórmula pura)
- `personal.ts` (golf/stats): 0% → ≥70%
- `useScoreSync.ts`: 0% → ≥60% (requiere mock de Supabase + localStorage)

Objetivo fin de semana 1: Statements 27% → 35%, subir thresholds a 33.

**Semana 2** — P2 laboriosos:
- `courses/data.ts`: mock Supabase
- `notifications/engine.ts`

**Continuo** — cada PR que modifique un archivo <80% debería agregar al menos 2 tests.

## Cómo correr el coverage

```bash
npx vitest run --coverage
```

El reporte visual queda en `coverage/index.html`.

## Thresholds bloquean regresión

Si un PR baja el coverage debajo del threshold, el CI (cuando se agregue el step coverage) lo rechaza. Hoy el job `Verificación` corre `vitest run` sin coverage — coverage es un step aparte que se puede agregar cuando las áreas P1 suban.

## Nota sobre la subestimación inicial

El baseline inicial midió 76.88% porque la suite de tests no importaba muchas partes del código. Fue un error de medición, no una regresión. No hay cobertura perdida.

Corrección documentada aquí y en `docs/TECH_DEBT.md`.
