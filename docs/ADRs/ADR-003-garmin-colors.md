# ADR-003 — Colores Garmin Golf inmutables

**Estado**: Aceptado
**Fecha**: 2026-03-24 (verificación contra app real de Garmin Golf)

## Contexto

La UI de scoring de golf tiene convenciones visuales fuertes. Los jugadores de golf **ya saben** leer los colores de Garmin Golf (app dominante en el mercado) para identificar scores vs par:

| Score vs Par | Convención Garmin |
|---|---|
| Eagle o mejor (-2+) | Círculo azul oscuro |
| Birdie (-1) | Círculo celeste |
| Par (0) | Sin borde |
| Bogey (+1) | Cuadrado dorado/naranja |
| Doble+ (+2+) | Cuadrado rojo |

Si Golfers+ usara colores distintos, los jugadores tendrían que re-aprender — fricción inaceptable.

## Decisión

**Los colores de scoring replican exactamente los de Garmin Golf**.

Fuente de verdad: `src/lib/garmin-colors.ts` y `src/golf/core/colors.ts`.

**Verificación**: tomar screenshot de la app Garmin Golf real y comparar pixel-perfect. Hecho el 2026-03-24.

**Nunca cambiar estos colores sin nueva verificación contra la app de Garmin.**

## Consecuencias

### Positivas
- Los jugadores identifican instantáneamente sus scores sin leyendas
- Reduce friction al on-boarding de usuarios nuevos
- Establece paridad visual con un producto líder

### Negativas
- **Restringe libertad de diseño**: no podemos usar paleta diferenciadora para scoring
- **Acoplamiento a decisión ajena**: si Garmin cambia sus colores, debemos evaluar seguirlos o no
- **Puede confundir**: "¿por qué copiamos a Garmin?" — por eso este ADR existe

### Mitigaciones
- Test canario `src/__tests__/garmin-colors.test.ts` valida los hex exactos
- CLAUDE.md declara la regla y la tabla de verificación
- En otros contextos (branding, marketing), usamos la paleta Garmin Golf-inspired de Golfers+ (dorado `#c4992a`, ivory, etc.) — NO los colores de scoring

## Cuándo reconsiderar

- Si Garmin Golf cambia su convención (improbable)
- Si un diseñador de producto demuestra con user testing que una paleta diferente mejora comprensión
- Si expandimos a sports donde Garmin no es el referente

Por ahora: **inmutable**.
