# Spec Formal — Match Play

**Referencia R&A:** Rule 3.2 — Match Play

## Definición
Dos jugadores (o equipos) compiten **hoyo por hoyo**. Gana quien tenga menos
golpes en cada hoyo individual. El match se decide cuando un jugador está
más arriba que hoyos restantes (ej: 3 UP con 2 hoyos restantes = "3&2").

## Variantes
- **Gross:** sin handicap
- **Neto:** con diferencia de handicap (ver abajo)

## Estados de match
1. **En curso:** ambos jugadores pueden ganar
2. **Dormie:** uno va UP por el mismo número de hoyos restantes (ej: 2 UP con 2 hoyos)
3. **Finalizado:** alguien ganó (ej: "3&2") o empate final ("AS" = All Square)
4. **Empate:** match termina AS

## Handicap diferencial (modo neto)

Si jugador A tiene courseHandicap 8 y B tiene 15:
- Diferencia = 15 - 8 = 7
- B recibe 1 golpe en los 7 hoyos con SI más bajo (1..7)
- A no recibe golpes

```
hcp_diff_a = max(0, courseHandicapA - courseHandicapB) = 0
hcp_diff_b = max(0, courseHandicapB - courseHandicapA) = 7
```

## Cálculo hoyo por hoyo

```
state = 0  // positivo = A gana, negativo = B gana
para cada hoyo h en 1..roundHoles:
  ventajaA = (SI[h] <= hcp_diff_a) ? 1 : 0
  ventajaB = (SI[h] <= hcp_diff_b) ? 1 : 0
  netoA = scoresA[h] - ventajaA
  netoB = scoresB[h] - ventajaB
  
  if netoA < netoB: state += 1  // A gana el hoyo
  if netoB < netoA: state -= 1  // B gana el hoyo
  // empate = state no cambia
```

## Match finalizado

```
hoyosRestantes = roundHoles - h
if Math.abs(state) > hoyosRestantes:
  match terminado → resultado = "${Math.abs(state)}&${hoyosRestantes}"
if h == roundHoles y state == 0:
  match terminado → "AS"
```

## Ejemplos

### Ejemplo: "3&2"
Hoyo 16 terminado, A está 3 UP, quedan 2 hoyos. 
|state|=3 > 2 hoyosRestantes → A gana "3&2"

### Ejemplo: Dormie
Hoyo 16 terminado, A está 2 UP, quedan 2 hoyos.
|state|=2 === 2 hoyosRestantes → estado "dormie" para A
Si B no gana los 2 restantes, A gana.

### Ejemplo: AS
Después de 18 hoyos, state=0 → match empatado.
En tournaments puede ir a playoff; en ronda libre queda empatado.

## Reglas especiales

1. **Concesiones (R&A 3.2):** un jugador puede conceder un putt o todo un hoyo.
   - Se representa con el sentinel `CONCEDE` en los scores
2. **Match Play siempre es Neto en Chile:** UI debe forzar modo=neto por default
3. **Pick-up de hoyo:** no penaliza, simplemente no suma
4. **Solo 2 jugadores:** exactamente 2, no más

## Dormie — texto correcto

Frase correcta: `"${Nombre} está dormie"` (capitalizado)
NO usar: `"no puede perder por strokes"` (confuso para usuarios casuales)

## Vistas

1. **Match state card:**
   - "Juan 3 UP" o "Pedro 2 UP con 3 restantes"
   - Color gold si UP, normal si AS, rojo si DOWN
   - Texto dormie cuando aplique

2. **Leaderboard hoyo por hoyo (Ryder Cup style):**
   - Tabla con 18 columnas
   - Cada celda: verde si ganó el hoyo A, rojo si ganó B, gris si halved
   - Score neto entre paréntesis

3. **Share card:**
   - Resultado final ("3&2", "1 UP", "AS")
   - Nombres capitalizados
   - No mostrar golpes totales (match play no se trata de eso)

4. **Espectador:**
   - Match state actual visible
   - Hoyo por hoyo visible

## Helpers requeridos

- `calcularMatchPlay` — existente en `src/golf/formats/match-play.ts`
- `describirMatchState` — nuevo en `src/golf/core/match-play-state.ts` (display)
- `capitalizarNombre` — helper de string en el mismo módulo
