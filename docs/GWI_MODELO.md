# GOLF WIN INDEX (GWI)

## Fórmula: 4 factores ponderados

GWI = W1×F1 + W2×F2 + W3×F3 + W4×F4

F1 = Score actual (peso W1: 30%→80% según progreso ronda)
F2 = Historial general (peso hasta 25%, 0% sin historial)
F3 = Historial en ESTA cancha (peso hasta 20%)
F4 = Patrones tAIger (peso hasta 15%)

## Ajuste por índice (clave diferencial)

Cada jugador tiene su propia sigma (volatilidad):

σ por hoyo = 1.50 + (0.085 × HCP) + (0.0012 × HCP²)

HCP 0  → σ = 1.50 strokes/hoyo (muy consistente)
HCP 10 → σ = 2.55 strokes/hoyo
HCP 18 → σ = 3.56 strokes/hoyo
HCP 28 → σ = 4.90 strokes/hoyo (muy volátil)

Resultado: HCP 5 con ventaja de -2 tiene mayor probabilidad que HCP 22 con la misma ventaja, porque su consistencia garantiza mantenerla.

## Implementación

src/lib/gwi.ts → función calcularGWI()
src/lib/scoring.ts → funciones auxiliares de golf
src/components/GWILeaderboard.tsx → UI
/api/gwi/ronda-libre/[codigo] → datos ronda libre
/api/gwi/torneo/[slug] → datos torneo

## Cuándo mostrar

Ronda Libre: si jugadores > 1 AND hoyos completados >= 3
Torneos: solo Stroke Play (Gross o Neto), no Stableford
