# Spec Formal — Foursome (Alternate Shot)

**Referencia R&A:** Rule 22 — Foursomes

## Definición
Equipo de 2 jugadores que juegan **una sola bola** alternando golpes:
- Jugador A tira el drive en hoyos impares
- Jugador B tira el drive en hoyos pares
- Después del drive, alternan golpes hasta meter la bola
- **Un solo score por hoyo para el equipo**

## Variantes
- **Gross:** score del equipo sin handicap
- **Neto:** score del equipo con handicap combinado (promedio simple o ponderado)

## Cálculo

Igual que Scramble en estructura, pero con reglas de alternancia de tees.

```
equipoGross = Σ scoreEquipo[h]
teamHandicap (neto) = (HCP_A + HCP_B) / 2 (fórmula estándar)
equipoNeto = equipoGross - ventajasEquipo
```

## Regla clave: tees alternados

- **Impares (1,3,5,7...):** A tira el drive
- **Pares (2,4,6,8...):** B tira el drive

Esto no afecta el cálculo del score, pero sí la UI debe mostrar **quién tira**
en cada hoyo para guiar al jugador.

## Inputs
- `teamScores: Record<number, number>` — un score por hoyo
- `teamHandicap: number` — HCP promedio del equipo
- `players: Array<{ nombre, handicap }>` — siempre 2

## Vistas

1. **Leaderboard:** equipos ordenados
2. **Scoring:** indica claramente quién tira el drive en cada hoyo
3. **Share card:** equipo + ambos jugadores

## Ejemplo

Equipo: Juan (HCP 10) + Pedro (HCP 18)
- team HCP = (10 + 18) / 2 = 14
- Equipo juega 85 golpes
- Neto = 85 - 14 = 71
