# Especificaciones de Modalidades de Juego

Este directorio contiene la **fuente de verdad** para cada modalidad de juego
de Golfers+. Cada spec define reglas R&A, inputs esperados, cálculos paso a
paso con ejemplos reales, y casos edge que se deben manejar.

**Regla de oro:** Si el código no coincide con el spec, el código está mal.
Si el spec no coincide con R&A, el spec está mal. No al revés.

## Modalidades

- [Stroke Play](formato-stroke-play.md) — Golpes totales, la modalidad más usada
- [Stableford](formato-stableford.md) — Puntos por hoyo (R&A Rule 32)
- [Match Play](formato-match-play.md) — Hoyo a hoyo (R&A Rule 3)
- [Best Ball](formato-best-ball.md) — Mejor bola del equipo (R&A Rule 23)
- [Scramble](formato-scramble.md) — Equipo elige la mejor bola (no-R&A oficial)
- [Foursome](formato-foursome.md) — Alternancia de golpes (R&A Rule 22)
