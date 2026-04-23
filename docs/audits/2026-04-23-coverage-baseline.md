# Baseline de cobertura de tests — 2026-04-23

**Comando**: `npx vitest run --coverage`
**Tests**: 5.662 en 306 archivos. 100% passing.
**Duración**: ~60s con coverage.

## Resumen global

| Métrica | Cobertura |
|---|---|
| **Statements** | **76.88%** (5941/7727) |
| **Branches** | **72.41%** (4257/5879) |
| **Functions** | **83.32%** (1094/1313) |
| **Lines** | **78.64%** (4780/6078) |

## Thresholds configurados en `vitest.config.ts`

Conservadores, debajo del baseline para bloquear regresión sin forzar fixes inmediatos:

```ts
thresholds: {
  statements: 70,   // baseline 76.88% → margen 6.88%
  branches: 65,     // baseline 72.41% → margen 7.41%
  functions: 75,    // baseline 83.32% → margen 8.32%
  lines: 70,        // baseline 78.64% → margen 8.64%
}
```

**Política**: subir los thresholds cada vez que un sprint agregue cobertura. El CI los enforce automáticamente.

## Por módulo — áreas fuertes (≥90%)

| Módulo | Statements |
|---|---|
| `src/golf/formats/` | 92.96% |
| `src/golf/stats/` | 93.93% |
| `src/lib/mi-golf/` | 95.76% |
| `src/lib/ronda/` | 95.52% |
| `src/hooks/ronda/` | 100% |

Formatos de juego (stroke-play, stableford, match-play, best-ball, foursome, scramble) están sobradamente testeados. Stats (GWI, CPI) también.

## Por módulo — áreas débiles (<50%)

| Módulo | Statements | Prioridad |
|---|---|---|
| `src/lib/share-card.ts` | 5.02% | P2 (complejo, canvas manipulation) |
| `src/golf/core/course-handicap.ts` | 9.52% | **P1 — es lógica core** |
| `src/lib/import-round.ts` | 20.25% | P2 |
| `src/lib/push-notifications.ts` | 21.15% | P2 |
| `src/lib/admin.ts` | 42.85% | P2 |
| `src/utils/logger.ts` | 54.23% | P3 (infra propia) |

### Acción inmediata: `course-handicap.ts` con 9.52%

Es **lógica central del motor de golf** (cálculo de handicap por cancha/tee). Solo 11.11% de líneas testeadas. Esto debe subir a >80% en el próximo sprint — un bug acá genera scores incorrectos para todos los jugadores con handicap.

## Cómo correr el coverage

```bash
# Completo con reporte HTML
npx vitest run --coverage

# Luego abrir el reporte visual
# Windows: start coverage/index.html
# Mac:     open coverage/index.html
# Linux:   xdg-open coverage/index.html
```

Los thresholds fallan el comando si algún número baja. Es lo que el CI va a enforce cuando se agregue el step coverage.

## Próximos pasos

1. **Semana 1**: subir `course-handicap.ts` de 9.52% → >80%
2. **Semana 2**: evaluar si `share-card.ts` necesita refactor antes que tests (canvas + html2canvas difíciles de testear unitariamente — considerar tests de integración con snapshot)
3. **Semana 3**: agregar step `npx vitest run --coverage` al CI workflow
4. **Continuo**: subir thresholds 2 puntos cada vez que se mejore cobertura

## Deuda técnica registrada

Ver `docs/TECH_DEBT.md` entrada P1-3 — marcar como ✅ resuelto con este baseline.
