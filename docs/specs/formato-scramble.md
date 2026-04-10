# Spec Formal — Scramble

**Referencia:** No es formato oficial R&A, es variante recreacional popular.

## Definición
Equipo de 2 o 4 jugadores. En cada hoyo:
1. Todos tiran el drive
2. Eligen la **mejor bola**
3. Todos juegan desde ahí
4. Repiten hasta meter
5. Cuentan **un solo score por hoyo para el equipo**

## Variantes
- **Gross:** score del equipo sin handicap
- **Neto:** score del equipo con handicap combinado
- Scramble **no suele jugarse en Stableford** pero el helper lo soporta

## Handicap combinado (modo neto)

Fórmula común en Chile:
- Scramble de 2: (HCP_min × 0.35) + (HCP_max × 0.15)
- Scramble de 4: (HCP1 × 0.25) + (HCP2 × 0.20) + (HCP3 × 0.15) + (HCP4 × 0.10)

**NOTA:** la fórmula exacta varía por club. El spec debe documentar cuál se usa y permitir override.

## Cálculo

### Gross
```
equipoScore[h] = scoreEquipo[h]  // un solo número por hoyo
equipoGross = Σ equipoScore[h]
```

### Neto
```
courseHandicapEquipo = calcular según fórmula
ventajaEquipo[h] = strokesRecibidos(courseHandicapEquipo, SI[h])
equipoNeto[h] = equipoScore[h] - ventajaEquipo[h]
```

## Inputs
- `teamScores: Record<number, number>` — un score por hoyo del equipo
- `teamHandicap: number` — HCP combinado del equipo
- `players: Array<{ nombre, handicap }>` — para calcular HCP combinado

## Vistas

1. **Leaderboard:** equipos ordenados por gross/neto
2. **Detalle equipo:** lista de jugadores + HCP combinado + scores del equipo
3. **Share card:** nombre equipo + jugadores integrantes

## Ejemplo

### Scramble 4-person, HCPs 10/15/20/25
HCP combinado = (10×0.25) + (15×0.20) + (20×0.15) + (25×0.10) = 2.5 + 3.0 + 3.0 + 2.5 = 11

Equipo juega la ronda en 80 golpes totales:
- Gross: 80
- Neto: 80 - 11 = 69
- vsPar (par 72): -3
