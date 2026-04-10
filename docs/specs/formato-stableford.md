# Spec Formal — Stableford

**Referencia R&A:** Rule 32 — Stableford (Modified Stableford en 32.2)

## Definición
Modalidad donde se otorgan **puntos por hoyo** según el resultado neto vs par.
Gana el jugador con **más puntos** (inverso a stroke play).

## Regla crítica R&A 32.1b
Stableford **siempre se juega con handicap (neto)**. No existe Stableford Gross.
En la app: si formato=stableford, modo debe ser 'neto' obligatoriamente.

## Tabla de puntos estándar (R&A)

| Resultado neto    | Puntos |
|-------------------|--------|
| Doble Eagle (-3)  | 5      |
| Eagle (-2)        | 4      |
| Birdie (-1)       | 3      |
| Par (0)           | 2      |
| Bogey (+1)        | 1      |
| Doble Bogey+ (≥2) | 0      |

## Inputs requeridos
- `scores: Record<number, number>` — gross por hoyo
- `roundHoles: number` — 9 o 18
- `parMap: Record<number, number>`
- `courseHandicap: number` — OBLIGATORIO (no existe gross stableford)
- `strokeIndexMap: Record<number, number>`

## Cálculo

```
puntosTotal = 0
para cada hoyo h en 1..holesJugados:
  ventaja = strokesRecibidos(courseHandicap, strokeIndexMap[h], roundHoles)
  scoreNeto = scores[h] - ventaja
  resultadoNeto = scoreNeto - parMap[h]
  puntos = tablaStableford(resultadoNeto)
  puntosTotal += puntos
```

## Ejemplos

### Ejemplo 1: 18 hoyos neto, HCP 18, suma 36 puntos
Jugador de HCP 18 (recibe 1 golpe por hoyo).
Si juega bogey todos los hoyos → cada hoyo es "par neto" → 2 puntos × 18 = 36 puntos.
36 puntos = jugador "juega su handicap" exactamente.

### Ejemplo 2: 9 hoyos stableford
scores = {1:6(1pt), 2:5(2pt), 3:4(2pt), 4:7(1pt), 5:5(2pt), 6:4(2pt), 7:5(2pt), 8:6(1pt), 9:6(2pt)}
Total: 15 puntos en 9 hoyos

En 9 hoyos, "jugar su handicap" ≈ 18 puntos.

## Casos edge

1. **Score muy alto (triple bogey o peor):** 0 puntos — no negativos
2. **Jugador sin handicap:** ERROR, no calcular (forzar ingreso de HCP)
3. **Hoyo no jugado:** no suma puntos, pero no penaliza
4. **Pick-up de hoyo:** R&A permite, equivale a 0 puntos

## Ordenamiento

**DESCENDENTE** — más puntos = mejor. Opuesto a stroke play.

```typescript
players.sort((a, b) => b.puntos - a.puntos)
```

## Vistas

1. **Leaderboard:** columna principal = "Pts", no gross ni vsPar
2. **Espectador:** badge "STABLEFORD" + puntos
3. **Share card:** mostrar puntos grandes, no golpes
4. **Creación ronda:** forzar modo=neto automáticamente

## Helpers requeridos

Usar `calcularStableford()` y `puntosStablefordHoyo()` del módulo central
`src/golf/core/stableford-score.ts`. No reimplementar la tabla.
