# Spec Formal — Stroke Play

**Referencia R&A:** Rule 3.3 — Stroke Play

## Definición
Modalidad donde el jugador compite contra el campo sumando todos los golpes
de la ronda. Gana el de menos golpes totales.

## Variantes soportadas
- **Gross (modo_juego = 'gross'):** Golpes brutos sin handicap
- **Neto (modo_juego = 'neto'):** Golpes ajustados por handicap

## Inputs requeridos
- scores: Record<number, number> — score por hoyo (1..N)
- roundHoles: number — 9 o 18 hoyos
- parMap: Record<number, number> — par por hoyo
- handicap?: number — índice del jugador (si modo=neto)
- courseHandicap?: number — handicap de cancha ajustado por slope/rating
- strokeIndexMap: Record<number, number> — SI por hoyo (si modo=neto)

## Cálculos

### Gross
gross = Σ scores[h] para h en 1..holesJugados
vsPar = gross - Σ parMap[h] para h en 1..holesJugados

### Neto
para cada hoyo h:
  ventaja = strokesRecibidos(courseHandicap, strokeIndexMap[h], roundHoles)
  scoreNeto[h] = scores[h] - ventaja
netoTotal = Σ scoreNeto[h]
vsParNeto = netoTotal - Σ parMap[h]

### Strokes recibidos (R&A)
- Si courseHandicap ≥ SI → recibe 1 golpe (o más si HCP > 18)
- Para HCP > 18: divide entre 18, reparte segunda vuelta

## Ejemplos reales

### Ejemplo 1: 9 hoyos gross +11 (bug del cuñado 9-abr-2026)
scores = {1:5, 2:5, 3:4, 4:6, 5:5, 6:5, 7:5, 8:5, 9:7}
parMap = {1:4, 2:4, 3:3, 4:5, 5:4, 6:3, 7:4, 8:4, 9:5}  // par 36
roundHoles = 9

Resultado:
  gross = 47
  parTotalRonda = 36
  vsPar = 47 - 36 = +11
  holesPlayed = 9

Lo que NO debe pasar: mostrar gross = 83 (72 + 11). El bug era asumir par 72.

### Ejemplo 2: 18 hoyos neto con HCP 14
scores = tarjeta real 18 hoyos suma 88
courseHandicap = 14 (ajustado con slope/rating)
parTotal = 72

gross = 88
vsParGross = 88 - 72 = +16
neto = 88 - 14 = 74
vsParNeto = 74 - 72 = +2

## Casos edge

1. **Ronda incompleta:** jugador solo ingresó 5 hoyos de 18
   - holesPlayed = 5
   - parJugado = suma de pares de esos 5 hoyos
   - vsPar = gross - parJugado (solo hoyos jugados)
   - No extrapolar

2. **Hoyo sin score:** null o undefined
   - No se suma al gross
   - No se suma al parJugado

3. **Jugador sin handicap (modo neto):**
   - No se puede calcular neto
   - UI debe pedir handicap o forzar modo gross

4. **Par 5 en 9 hoyos:** par total depende de cancha, no asumir 36
   - Usar parMap real de la BD

## Vistas que muestran Stroke Play

1. **Leaderboard (`ronda-libre/[codigo]/page.tsx`):**
   - Sorted ASC por vsPar (o gross si no hay par)
   - Muestra: nombre, vsPar, gross, holesPlayed/totalHoles

2. **Vista espectador (`en-vivo/page.tsx`):**
   - Sorted ASC por vsPar
   - Muestra: "+X en N hoyos" si parcial, "vsPar final" si completo
   - Badge "9 HOYOS" o "18 HOYOS" visible

3. **Share card (`share-card.ts`):**
   - scoreGross = parTotalRonda + vsPar (NO 72 + vsPar)
   - Muestra: ganador, empate (si aplica), ranking completo
   - Badge "9 HOYOS" o "18 HOYOS"

4. **Historial (`perfil/historial/page.tsx`):**
   - Muestra ronda con vsPar y gross correctos

## Contrato de helpers

Usar **solo** `calcularScoreRonda` de `src/golf/core/round-score.ts`:
```typescript
const { gross, vsPar, holesPlayed, parJugado, parTotalRonda } =
  calcularScoreRonda({ scores, roundHoles, parMap })
```

**Prohibido:** hardcodear 72 o 18 en ningún lado.
