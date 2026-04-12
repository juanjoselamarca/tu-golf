# Spec Formal — Best Ball

**Referencia R&A:** Rule 23 — Four-Ball (Best Ball es sinónimo)

## Definición
Equipo de 2 jugadores donde cada uno juega **su propia bola**. En cada hoyo,
el equipo cuenta el **mejor score** (menor en gross/neto, mayor en stableford)
de los dos integrantes.

## Variantes
- **Gross:** mejor gross del par
- **Neto:** mejor neto (con handicap individual)
- **Stableford:** más puntos del par por hoyo

## Inputs
- 2 jugadores por equipo, cada uno con su scorecard individual
- Si neto: cada jugador tiene courseHandicap propio
- Si stableford: cada jugador calcula puntos propios primero

## Cálculo

### Gross
```
equipoScore[h] = Math.min(scoreA[h], scoreB[h])
equipoGross = Σ equipoScore[h]
```

### Neto
```
para cada hoyo h:
  netoA = scoreA[h] - ventajaA[h]
  netoB = scoreB[h] - ventajaB[h]
  equipoNeto[h] = Math.min(netoA, netoB)
equipoNetoTotal = Σ equipoNeto[h]
```

### Stableford
```
para cada hoyo h:
  puntosA = puntosStablefordHoyo(netoA, par[h])
  puntosB = puntosStablefordHoyo(netoB, par[h])
  equipoPuntos[h] = Math.max(puntosA, puntosB)
equipoPuntosTotal = Σ equipoPuntos[h]
```

## Casos edge

1. **Un jugador con pickup (sin score):** cuenta el score del compañero
2. **Ambos sin score:** hoyo no cuenta
3. **Equipos de tamaños distintos:** no soportado (siempre 2)
4. **Desempate entre equipos:** por countback (último 9, últimos 6, etc.)

## Ejemplos

### Ejemplo 1: 18h gross, equipo Juan(+5) y Pedro(+3)
Si Juan hace par en hoyo 1 (4) y Pedro hace bogey (5), equipo toma 4.
Si Juan hace eagle en hoyo 4 (3) y Pedro hace par (5), equipo toma 3.

## Vistas

1. **Leaderboard por equipo:** nombre del equipo, score vs par, ranking
2. **Detalle del equipo:** scores individuales y cuál contó por hoyo
3. **Share card:** nombre del equipo ganador + ambos jugadores
