# GWI del scramble: modelo, fuentes y calibración

Código: `src/golf/stats/gwi-scramble.ts`, con los tests en `gwi-scramble.test.ts`. Pantalla: `GwiScramble.tsx`, que solo se muestra con 2 equipos en vivo. Regla de Juanjo (25-nov): el % de ganar se muestra solo con un modelo propio, con fuentes y revisión de Fable. Si el número no es creíble, no se muestra.

## v2 (27-nov-2026)

1. **Cálculo exacto sobre enteros.** Cada hoyo que falta es una normal discretizada con media y desvío exactos. El total sale de la convolución, así que se calculan las colas y la probabilidad de empate de verdad. El empate cuenta como medio triunfo, porque el countback no se modela. La v1 aproximaba con una normal, y eso fallaba al final: con el rival a un hoyo (un par 5), la v1 daba 95 % y la v2 da 81 %, porque el birdie para empatar es muy posible.
2. **Mezcla de pares.** El ajuste por par es par 3 +0,02, par 4 0 y par 5 −0,37 golpes. Con salidas separadas, al que le quedan los par 5 le queda más ronda buena: con el mismo −1 en 9 hoyos y los 4 par 5 por jugar, pasa de 50 % a 74 %. El ritmo común se estima descontando la mezcla de pares de lo ya jugado.
3. **Nivel propio del equipo (τ = 0,1 golpe por hoyo).** El HCP de equipo iguala en promedio, no equipo a equipo. Se integra con Gauss-Hermite (7 nodos) y con partial pooling: con el peso h/(h + σ²/τ²), un equipo aprende la mitad de su ritmo propio recién a los 36 hoyos. Mueve 2 puntos o menos con media ronda (hasta ~4 en los primeros hoyos), porque suma incertidumbre pero el que va adelante probablemente es algo mejor. En neto, el ritmo y el nivel propio se miden devolviendo los golpes de HCP ya recibidos por sobre su parte pareja: no son buen juego (revisión Fable P1).
4. Se mantienen de la v1 σ = 0,6, el ritmo común encogido a 0 con un previo de 18 hoyos, y los golpes de HCP por recibir.

## Fuentes

- **σ por hoyo.** Data Golf, "Model Talk: variance": un profesional varía ~2,8 golpes por ronda. El único scramble real de la base dio 0,55.
- **τ.** Data Golf ajusta la habilidad ~0,12 por golpe de ronda en profesionales con historial largo, lo que equivale a τ ≈ 0,05 por hoyo. Usamos el doble porque el HCP de equipo es un previo menos preciso que años de historial. Las asignaciones de scramble de la USGA (25/20/15/10 %) igualan en promedio.
- **Ajuste por par.** Viene de `historical_rounds` de prod. En la banda de ≤ 78 golpes el par 5 se juega 0,68 mejor que el par 4; en la de 79-88, 0,24 mejor. Cuadra con los promedios del PGA Tour en par 3 y par 5 (stats 142/144).

## Límites conocidos

Hay solo 2 scrambles reales en la base, así que la calibración no se puede backtestear con datos propios. Los parámetros son estimaciones con fuente y se revisan cuando haya más rondas. El modelo no conoce el countback. La incertidumbre del ritmo común c no se integra: algo de sobreconfianza (< 1 punto) cuando los hoyos restantes difieren mucho.

## v1 contra v2 (18 hoyos, cancha par 72 típica)

| Caso | v1 | v2 |
|---|---|---|
| Parejos, 9 y 9 | 50 % | 50 % |
| −1 vs 0, 9 y 9 | 65 % | 67 % |
| −3 en 11 vs −2 en 9 | 62 % | 64 % |
| −5 vs 0, 9 y 9 | 98 % | 98 % |
| −2 vs +1, 14 y 14 | 96 % | 96 % |
| −1 vs 0, 17 y 17 | 88 % | 85 % |
| −1 terminó vs 0 en 17 | 95 % | 81 % |
| −4 en 13 vs −1 en 6 | 80 % | 77 % |
| Iguales −1 en 9; a A le quedan los 4 par 5 | 50 % | 74 % |
