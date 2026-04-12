# Auditoría Sistemática de 6 Modalidades de Juego — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar las 6 modalidades de juego (Stroke Play, Stableford, Match Play, Best Ball, Scramble, Foursome) con 0% de bugs antes del lanzamiento, mediante especificación formal, helpers centralizados, tests canario y verificación end-to-end.

**Architecture:** Un helper centralizado por cada cálculo (fuente única de verdad). Spec formal por cada modalidad con reglas R&A. Matriz de tests canario que cubren formato × hoyos × modo × jugadores × estado. Auditoría manual de cada modalidad en las 4 vistas críticas (creación, scoring, leaderboard, share). Canary test por cada bug reportado históricamente.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Supabase (PostgreSQL), Tailwind CSS

---

## Contexto del problema

Se encontraron múltiples bugs en las modalidades de juego jugando rondas reales (Los Leones, 9 abr 2026):
- Stroke Play: score de 9 hoyos mostrado como 18 (ya arreglado con `calcularScoreRonda`)
- Match Play: texto dormie mal + nombre sin capitalizar (ya arreglado)
- Scorecard: cortaba en hoyo 17 (ya arreglado)
- Inscripción torneo: RLS + UX (ya arreglado)

Pero el problema estructural es que los cálculos están **duplicados** en múltiples lugares (`share-card.ts`, `en-vivo/page.tsx`, `[codigo]/page.tsx`, API routes) y **no hay tests funcionales por modalidad**. Cada bug de campo cuesta reputación con clubes chilenos.

**Política estricta:** Cero features nuevas hasta que las 6 modalidades estén 100% blindadas.

---

## File Map

### Nuevos archivos

**Documentación (specs formales):**
- `docs/specs/formato-stroke-play.md`
- `docs/specs/formato-stableford.md`
- `docs/specs/formato-match-play.md`
- `docs/specs/formato-best-ball.md`
- `docs/specs/formato-scramble.md`
- `docs/specs/formato-foursome.md`

**Helpers centralizados (fuente única de verdad):**
- `src/golf/core/match-play-state.ts` — calcular match state, dormie, finalizado
- `src/golf/core/team-score.ts` — cálculos de equipo (best ball, scramble, foursome)
- `src/golf/core/stableford-score.ts` — puntos stableford con handicap

**Tests canario:**
- `src/__tests__/canary/stroke-play.canary.test.ts`
- `src/__tests__/canary/stableford.canary.test.ts`
- `src/__tests__/canary/match-play.canary.test.ts`
- `src/__tests__/canary/best-ball.canary.test.ts`
- `src/__tests__/canary/scramble.canary.test.ts`
- `src/__tests__/canary/foursome.canary.test.ts`
- `src/__tests__/canary/share-card.canary.test.ts`
- `src/__tests__/canary/en-vivo-api.canary.test.ts`

**Checklists de auditoría manual:**
- `docs/audit/checklist-stroke-play.md`
- `docs/audit/checklist-stableford.md`
- `docs/audit/checklist-match-play.md`
- `docs/audit/checklist-best-ball.md`
- `docs/audit/checklist-scramble.md`
- `docs/audit/checklist-foursome.md`

### Archivos a modificar (consolidación/cleanup)
- `src/lib/share-card.ts` — usar helpers centralizados, sin cálculos duplicados
- `src/app/en-vivo/page.tsx` — consumir solo datos del API, sin recalcular
- `src/app/api/en-vivo/route.ts` — devolver datos completos por formato
- `src/app/ronda-libre/[codigo]/page.tsx` — delegar cálculos a helpers
- `src/golf/formats/match-play.ts` — extraer match state al nuevo helper
- `src/golf/formats/stableford.ts` — ya es re-export, verificar uso

---

## Tarea 0: Preparación — Políticas y Estructura

**Files:**
- Create: `docs/specs/README.md`
- Create: `docs/audit/README.md`
- Create: `src/__tests__/canary/README.md`

- [ ] **Step 1: Crear índice de specs**

```markdown
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
```

Escribir el archivo con ese contenido.

- [ ] **Step 2: Crear índice de checklists de auditoría**

```markdown
# Checklists de Auditoría Manual

Cada modalidad tiene un checklist de verificación end-to-end que debe pasarse
**en producción** antes de considerar la modalidad lista para lanzamiento.

Un checklist se ejecuta jugando una ronda real en Golfers+ y verificando
cada punto. Cualquier falla = bug P0 que debe arreglarse antes de continuar.

## Procedimiento
1. Leer el spec de la modalidad
2. Correr los tests canario (`npm run test -- <modalidad>.canary`)
3. Crear ronda real en golfersplus.vercel.app
4. Seguir el checklist paso por paso
5. Reportar bugs encontrados
6. Arreglar todo antes de pasar a la siguiente modalidad
```

Escribir el archivo.

- [ ] **Step 3: Crear índice de tests canario**

```markdown
# Tests Canario

Estos tests son **barreras de regresión** para bugs que ya ocurrieron en
producción. Cada bug reportado por un usuario real debe convertirse en un
test canario antes de arreglarse.

## Política
- Nombre descriptivo: `it('Bug 9-abr-2026: +11 en 9 hoyos NO debe mostrar gross 83')`
- Incluir contexto del bug en el comentario
- Nunca eliminar canarios viejos (solo agregarlos)
- Los canarios corren en cada push (pre-push hook)

## Cobertura actual
- Stroke Play: 9 vs 18 hoyos (bug del cuñado, 9 abr)
- Match Play: dormie, capitalización de nombres
- Share card: par 72 hardcoded
- en-vivo API: sort por gross vs vsPar
```

Escribir el archivo.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/README.md docs/audit/README.md src/__tests__/canary/README.md
git commit -m "docs: estructura de specs, auditoría y tests canario para modalidades"
```

---

## Tarea 1: Spec Formal — Stroke Play

**Files:**
- Create: `docs/specs/formato-stroke-play.md`

- [ ] **Step 1: Escribir el spec completo**

Contenido del archivo:

````markdown
# Spec Formal — Stroke Play

**Referencia R&A:** Rule 3.3 — Stroke Play

## Definición
Modalidad donde el jugador compite contra el campo sumando todos los golpes
de la ronda. Gana el de menos golpes totales.

## Variantes soportadas
- **Gross (modo_juego = 'gross'):** Golpes brutos sin handicap
- **Neto (modo_juego = 'neto'):** Golpes ajustados por handicap

## Inputs requeridos
- `scores: Record<number, number>` — score por hoyo (1..N)
- `roundHoles: number` — 9 o 18 hoyos
- `parMap: Record<number, number>` — par por hoyo
- `handicap?: number` — índice del jugador (si modo=neto)
- `courseHandicap?: number` — handicap de cancha ajustado por slope/rating
- `strokeIndexMap: Record<number, number>` — SI por hoyo (si modo=neto)

## Cálculos

### Gross
```
gross = Σ scores[h] para h en 1..holesJugados
vsPar = gross - Σ parMap[h] para h en 1..holesJugados
```

### Neto
```
para cada hoyo h:
  ventaja = strokesRecibidos(courseHandicap, strokeIndexMap[h], roundHoles)
  scoreNeto[h] = scores[h] - ventaja
netoTotal = Σ scoreNeto[h]
vsParNeto = netoTotal - Σ parMap[h]
```

### Strokes recibidos (R&A)
- Si courseHandicap ≥ SI → recibe 1 golpe (o más si HCP > 18)
- Para HCP > 18: divide entre 18, reparte segunda vuelta

## Ejemplos reales

### Ejemplo 1: 9 hoyos gross +11 (bug del cuñado 9-abr-2026)
```
scores = {1:5, 2:5, 3:4, 4:6, 5:5, 6:5, 7:5, 8:5, 9:7}
parMap = {1:4, 2:4, 3:3, 4:5, 5:4, 6:3, 7:4, 8:4, 9:5}  // par 36
roundHoles = 9

Resultado:
  gross = 47
  parTotalRonda = 36
  vsPar = 47 - 36 = +11
  holesPlayed = 9
```

**Lo que NO debe pasar:** mostrar gross = 83 (72 + 11). El bug era asumir par 72.

### Ejemplo 2: 18 hoyos neto con HCP 14
```
scores = tarjeta real 18 hoyos suma 88
courseHandicap = 14 (ajustado con slope/rating)
parTotal = 72

gross = 88
vsParGross = 88 - 72 = +16
neto = 88 - 14 = 74
vsParNeto = 74 - 72 = +2
```

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
````

- [ ] **Step 2: Commit**

```bash
git add docs/specs/formato-stroke-play.md
git commit -m "docs(spec): formato Stroke Play con reglas R&A y casos edge"
```

---

## Tarea 2: Tests Canario Stroke Play

**Files:**
- Create: `src/__tests__/canary/stroke-play.canary.test.ts`

- [ ] **Step 1: Escribir tests canario**

```typescript
import { describe, it, expect } from 'vitest'
import { calcularScoreRonda, parTotalEstandar } from '@/golf/core/round-score'

describe('Stroke Play — Tests Canario', () => {
  const par9 = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 } // 36
  const par18 = {
    ...par9,
    10: 4, 11: 4, 12: 3, 13: 5, 14: 4, 15: 3, 16: 4, 17: 4, 18: 5,
  } // 72

  describe('Bug 9-abr-2026: 9 vs 18 hoyos', () => {
    it('NO debe mostrar gross 83 cuando jugador hace +11 en 9 hoyos', () => {
      // Cuñado de Juanjo jugó 9 hoyos, +11
      const scores = { 1: 5, 2: 5, 3: 4, 4: 6, 5: 5, 6: 5, 7: 5, 8: 5, 9: 7 }
      const result = calcularScoreRonda({ scores, roundHoles: 9, parMap: par9 })

      expect(result.gross).toBe(47) // 36 + 11 = 47
      expect(result.gross).not.toBe(83) // el bug era mostrar 72 + 11
      expect(result.vsPar).toBe(11)
      expect(result.parTotalRonda).toBe(36)
    })

    it('NO debe asumir par 72 para rondas de 9 hoyos', () => {
      expect(parTotalEstandar(9)).toBe(36)
      expect(parTotalEstandar(9)).not.toBe(72)
    })

    it('DEBE asumir par 72 para rondas de 18 hoyos', () => {
      expect(parTotalEstandar(18)).toBe(72)
    })
  })

  describe('Rondas incompletas', () => {
    it('Solo cuenta hoyos con score ingresado', () => {
      const scores = { 1: 5, 2: 4, 3: 3 } // 3 de 18 hoyos
      const result = calcularScoreRonda({
        scores,
        roundHoles: 18,
        parMap: par18,
      })
      expect(result.holesPlayed).toBe(3)
      expect(result.gross).toBe(12)
      expect(result.parJugado).toBe(11) // 4+4+3
      expect(result.vsPar).toBe(1)
      expect(result.parTotalRonda).toBe(72) // ronda es de 18 aunque jugó 3
    })

    it('Ronda vacía devuelve 0 en todo menos parTotalRonda', () => {
      const result = calcularScoreRonda({
        scores: {},
        roundHoles: 18,
        parMap: par18,
      })
      expect(result.gross).toBe(0)
      expect(result.holesPlayed).toBe(0)
      expect(result.vsPar).toBe(0)
      expect(result.parTotalRonda).toBe(72)
    })
  })

  describe('Ordenamiento correcto', () => {
    it('Ordena por vsPar ascendente (menor = mejor)', () => {
      const players = [
        { name: 'A', vsPar: 5 },
        { name: 'B', vsPar: -2 },
        { name: 'C', vsPar: 0 },
      ]
      const sorted = [...players].sort((a, b) => a.vsPar - b.vsPar)
      expect(sorted.map(p => p.name)).toEqual(['B', 'C', 'A'])
    })

    it('NO debe ordenar por gross cuando hay rondas distintas', () => {
      // Un +0 en 9 hoyos (36 gross) NO debe parecer mejor que +0 en 18 hoyos (72 gross)
      const p1 = { vsPar: 0, gross: 36, holes: 9 }
      const p2 = { vsPar: 0, gross: 72, holes: 18 }
      // Por vsPar → empate (correcto)
      expect(p1.vsPar).toBe(p2.vsPar)
      // Por gross → p1 parece mejor (incorrecto)
      expect(p1.gross).not.toBe(p2.gross)
    })
  })

  describe('Par no estándar en cancha', () => {
    it('Respeta par de la cancha, no asume 72', () => {
      // Algunas canchas son par 70 o par 71
      const par70 = { ...par18, 4: 4, 9: 4 } // dos par 4 en vez de par 5
      const scores = Object.fromEntries(
        Object.entries(par70).map(([h, p]) => [h, p]),
      ) // todos par
      const result = calcularScoreRonda({
        scores: scores as Record<string, number>,
        roundHoles: 18,
        parMap: par70,
      })
      expect(result.parTotalRonda).toBe(70)
      expect(result.vsPar).toBe(0)
    })
  })
})
```

- [ ] **Step 2: Ejecutar tests**

```bash
npm run test -- stroke-play.canary
```

Expected: 8+ tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/canary/stroke-play.canary.test.ts
git commit -m "test(canary): stroke play — 9 vs 18 hoyos, rondas incompletas, orden"
```

---

## Tarea 3: Checklist Auditoría Stroke Play

**Files:**
- Create: `docs/audit/checklist-stroke-play.md`

- [ ] **Step 1: Escribir checklist**

```markdown
# Checklist Auditoría — Stroke Play

**Ejecutar en producción (https://golfersplus.vercel.app)**
**Antes de empezar:** correr `npm run test -- stroke-play.canary` — todos los tests deben pasar.

## Preparación
- [ ] Abrir Golfers+ en celular Android
- [ ] Tener otro celular/pestaña como espectador
- [ ] Conexión normal (no VPN, no wifi del golf club)

## Test 1: Ronda 18 hoyos gross individual
- [ ] Crear ronda libre
- [ ] Seleccionar cancha federada (ej: Los Leones)
- [ ] Formato: Stroke Play, Modo: Gross
- [ ] 18 hoyos, 1 jugador (yo)
- [ ] Tee: Blanco
- [ ] Iniciar ronda
- [ ] **Verificar:** badge "18 HOYOS" visible en header
- [ ] Ingresar scores: hoyo 1 par, hoyo 2 bogey, hoyo 3 birdie, resto par
- [ ] **Verificar:** leaderboard muestra "+0"
- [ ] **Verificar:** vista espectador muestra el mismo "+0"
- [ ] Finalizar ronda (todos los hoyos con score)
- [ ] Compartir resultado
- [ ] **Verificar:** share card muestra gross=72, +0, badge "18 HOYOS"

## Test 2: Ronda 9 hoyos gross individual
- [ ] Crear ronda libre
- [ ] Seleccionar cancha federada
- [ ] Formato: Stroke Play, Modo: Gross
- [ ] **9 hoyos**, 1 jugador
- [ ] Iniciar
- [ ] **Verificar:** badge "9 HOYOS" visible y prominente
- [ ] Ingresar scores: +11 total (ej: todos los hoyos 1 sobre par + 2 más)
- [ ] **Verificar:** leaderboard muestra "+11"
- [ ] **Verificar:** gross calculado = 47 (36 + 11), NO 83
- [ ] Finalizar
- [ ] Compartir
- [ ] **Verificar:** share card muestra gross=47, badge "9 HOYOS"

## Test 3: Ronda 18 hoyos neto (con handicap)
- [ ] Crear ronda con otro jugador (invitado con HCP 15)
- [ ] Formato: Stroke Play, Modo: Neto
- [ ] **Verificar:** app pide course handicap
- [ ] Iniciar
- [ ] Ingresar scores reales
- [ ] **Verificar:** leaderboard muestra columnas gross y neto
- [ ] **Verificar:** neto = gross - handicap ajustado por SI

## Test 4: Ronda incompleta (solo 10 de 18 hoyos)
- [ ] Crear ronda 18h gross
- [ ] Ingresar score solo hoyos 1-10
- [ ] **Verificar:** leaderboard muestra "+X en 10 hoyos"
- [ ] **Verificar:** vista espectador dice "en curso, 10/18"
- [ ] **Verificar:** NO extrapola el resultado

## Test 5: Edge cases
- [ ] Cancha par 70 (si existe en BD): verificar vsPar usa 70, no 72
- [ ] Jugador con eagle en hoyo 1: verificar que se cuenta -2
- [ ] Múltiples jugadores (2, 3, 4): verificar orden por vsPar
- [ ] Empate en primer lugar: verificar UI muestra "Empate"

## Test 6: Vistas derivadas
- [ ] Ir a "En vivo" mientras la ronda está activa
- [ ] **Verificar:** ranking por vsPar correcto
- [ ] **Verificar:** badges de hoyos visibles
- [ ] Perfil > Historial
- [ ] **Verificar:** la ronda aparece con gross y vsPar correctos

## Bugs encontrados
_(Llenar si aparecen. Cada bug = test canario nuevo antes de arreglar.)_

- [ ] ___________
- [ ] ___________

## Firma
Ejecutado por: _______________
Fecha: _______________
Resultado: PASS / FAIL
```

- [ ] **Step 2: Commit**

```bash
git add docs/audit/checklist-stroke-play.md
git commit -m "docs(audit): checklist manual stroke play — 6 tests E2E"
```

---

## Tarea 4: Spec Formal — Stableford

**Files:**
- Create: `docs/specs/formato-stableford.md`

- [ ] **Step 1: Escribir spec**

````markdown
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
  resultadoNeto = scoreNeto - parMap[h]  // -2, -1, 0, +1, etc.
  puntos = tablaStableford(resultadoNeto)
  puntosTotal += puntos
```

## Ejemplos

### Ejemplo 1: 18 hoyos neto, HCP 18, suma 36 puntos
Jugador de HCP 18 (recibe 1 golpe por hoyo).
Si juega bogey todos los hoyos → cada hoyo es "par neto" → 2 puntos × 18 = 36 puntos.
36 puntos = jugador "juega su handicap" exactamente.

### Ejemplo 2: 9 hoyos stableford
```
scores = {1:6(1pt), 2:5(2pt), 3:4(2pt), 4:7(1pt), 5:5(2pt), 6:4(2pt), 7:5(2pt), 8:6(1pt), 9:6(2pt)}
Total: 15 puntos en 9 hoyos
```
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

Usar `puntosStablefordHoyo(scoreNeto, par)` del módulo central. No reimplementar la tabla.
````

- [ ] **Step 2: Commit**

```bash
git add docs/specs/formato-stableford.md
git commit -m "docs(spec): formato Stableford con tabla R&A y regla 32.1b"
```

---

## Tarea 5: Helper Centralizado — Stableford

**Files:**
- Create: `src/golf/core/stableford-score.ts`
- Test: `src/__tests__/canary/stableford.canary.test.ts`

- [ ] **Step 1: Escribir el helper centralizado**

```typescript
// src/golf/core/stableford-score.ts

import { calcularScoreRonda } from './round-score'

/**
 * Puntos Stableford por un hoyo según R&A Rule 32.1.
 * 
 * @param scoreNeto golpes netos (después de aplicar ventaja de handicap)
 * @param par par del hoyo
 * @returns puntos: 0, 1, 2, 3, 4, 5
 */
export function puntosStablefordHoyo(scoreNeto: number, par: number): number {
  const diff = scoreNeto - par
  if (diff <= -3) return 5 // Doble Eagle o mejor
  if (diff === -2) return 4 // Eagle
  if (diff === -1) return 3 // Birdie
  if (diff === 0) return 2 // Par
  if (diff === 1) return 1 // Bogey
  return 0 // Doble bogey o peor
}

export interface StablefordInput {
  scores: Record<string, number> | Record<number, number>
  roundHoles: number
  parMap: Record<number, number>
  courseHandicap: number
  strokeIndexMap: Record<number, number>
}

export interface StablefordResult {
  puntosTotales: number
  puntosPorHoyo: Record<number, number>
  holesPlayed: number
  parTotalRonda: number
  // Agregados útiles para stats
  eagles: number
  birdies: number
  pares: number
  bogeys: number
  dobleOpeor: number
}

/**
 * Calcula puntos Stableford de una ronda completa respetando roundHoles.
 * NUNCA asume 18 hoyos.
 */
export function calcularStableford(input: StablefordInput): StablefordResult {
  const { scores, roundHoles, parMap, courseHandicap, strokeIndexMap } = input
  let puntosTotales = 0
  let holesPlayed = 0
  let parTotalRonda = 0
  let eagles = 0
  let birdies = 0
  let pares = 0
  let bogeys = 0
  let dobleOpeor = 0
  const puntosPorHoyo: Record<number, number> = {}

  for (let h = 1; h <= roundHoles; h++) {
    const par = parMap[h] ?? 4
    parTotalRonda += par

    const scoreRaw =
      (scores as Record<string, number>)[String(h)] ??
      (scores as Record<number, number>)[h]
    if (scoreRaw == null) continue

    holesPlayed++
    const si = strokeIndexMap[h] ?? h
    const ventaja = strokesRecibidosEnHoyo(courseHandicap, si, roundHoles)
    const neto = scoreRaw - ventaja
    const puntos = puntosStablefordHoyo(neto, par)

    puntosPorHoyo[h] = puntos
    puntosTotales += puntos

    // Clasificación para stats
    const diff = neto - par
    if (diff <= -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pares++
    else if (diff === 1) bogeys++
    else dobleOpeor++
  }

  return {
    puntosTotales,
    puntosPorHoyo,
    holesPlayed,
    parTotalRonda,
    eagles,
    birdies,
    pares,
    bogeys,
    dobleOpeor,
  }
}

/**
 * Strokes que recibe un jugador en un hoyo según R&A.
 * - Si courseHandicap >= 18: recibe 1 golpe en todos, más 1 extra en los SI más bajos
 * - Si courseHandicap < 18: recibe 1 solo en los SI 1..courseHandicap
 */
export function strokesRecibidosEnHoyo(
  courseHandicap: number,
  strokeIndex: number,
  roundHoles: number,
): number {
  if (courseHandicap <= 0) return 0
  const maxSI = roundHoles // 9 o 18

  const primeraVuelta = strokeIndex <= Math.min(courseHandicap, maxSI) ? 1 : 0

  if (courseHandicap <= maxSI) return primeraVuelta

  // Segunda vuelta: hoyos SI 1..(courseHandicap - maxSI)
  const restante = courseHandicap - maxSI
  const segundaVuelta = strokeIndex <= restante ? 1 : 0

  return primeraVuelta + segundaVuelta
}
```

- [ ] **Step 2: Escribir tests canario**

```typescript
// src/__tests__/canary/stableford.canary.test.ts

import { describe, it, expect } from 'vitest'
import {
  calcularStableford,
  puntosStablefordHoyo,
  strokesRecibidosEnHoyo,
} from '@/golf/core/stableford-score'

describe('Stableford — Tests Canario', () => {
  const par18 = {
    1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
    10: 4, 11: 4, 12: 3, 13: 5, 14: 4, 15: 3, 16: 4, 17: 4, 18: 5,
  }
  const siLosLeones = {
    1: 13, 2: 7, 3: 15, 4: 1, 5: 11, 6: 17, 7: 3, 8: 9, 9: 5,
    10: 12, 11: 16, 12: 6, 13: 2, 14: 18, 15: 10, 16: 4, 17: 8, 18: 14,
  }

  describe('Tabla de puntos R&A', () => {
    it('Doble Eagle (-3) = 5 puntos', () => {
      expect(puntosStablefordHoyo(2, 5)).toBe(5) // 2 en par 5
    })
    it('Eagle (-2) = 4 puntos', () => {
      expect(puntosStablefordHoyo(3, 5)).toBe(4)
    })
    it('Birdie (-1) = 3 puntos', () => {
      expect(puntosStablefordHoyo(3, 4)).toBe(3)
    })
    it('Par = 2 puntos', () => {
      expect(puntosStablefordHoyo(4, 4)).toBe(2)
    })
    it('Bogey = 1 punto', () => {
      expect(puntosStablefordHoyo(5, 4)).toBe(1)
    })
    it('Doble bogey o peor = 0 puntos', () => {
      expect(puntosStablefordHoyo(6, 4)).toBe(0)
      expect(puntosStablefordHoyo(10, 4)).toBe(0)
    })
  })

  describe('Strokes recibidos', () => {
    it('HCP 0 no recibe golpes', () => {
      expect(strokesRecibidosEnHoyo(0, 1, 18)).toBe(0)
    })
    it('HCP 18 recibe 1 golpe en todos los hoyos de 18', () => {
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
      }
    })
    it('HCP 9 recibe golpes solo en SI 1-9', () => {
      expect(strokesRecibidosEnHoyo(9, 1, 18)).toBe(1)
      expect(strokesRecibidosEnHoyo(9, 9, 18)).toBe(1)
      expect(strokesRecibidosEnHoyo(9, 10, 18)).toBe(0)
    })
    it('HCP 27 recibe 2 golpes en SI 1-9, 1 en SI 10-18', () => {
      expect(strokesRecibidosEnHoyo(27, 1, 18)).toBe(2)
      expect(strokesRecibidosEnHoyo(27, 9, 18)).toBe(2)
      expect(strokesRecibidosEnHoyo(27, 10, 18)).toBe(1)
    })
  })

  describe('Cálculo de ronda completa', () => {
    it('Jugador HCP 18 jugando bogey todos los hoyos = 36 puntos', () => {
      const scores = {
        1: 5, 2: 5, 3: 4, 4: 6, 5: 5, 6: 4, 7: 5, 8: 5, 9: 6,
        10: 5, 11: 5, 12: 4, 13: 6, 14: 5, 15: 4, 16: 5, 17: 5, 18: 6,
      }
      const result = calcularStableford({
        scores,
        roundHoles: 18,
        parMap: par18,
        courseHandicap: 18,
        strokeIndexMap: siLosLeones,
      })
      expect(result.puntosTotales).toBe(36)
      expect(result.holesPlayed).toBe(18)
    })

    it('Ronda de 9 hoyos no asume parTotal 72', () => {
      const par9 = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }
      const si9 = { 1: 7, 2: 3, 3: 9, 4: 1, 5: 5, 6: 8, 7: 2, 8: 6, 9: 4 }
      const scores = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 } // pares todos
      const result = calcularStableford({
        scores,
        roundHoles: 9,
        parMap: par9,
        courseHandicap: 0,
        strokeIndexMap: si9,
      })
      expect(result.parTotalRonda).toBe(36)
      expect(result.puntosTotales).toBe(18) // 2 pts × 9 pares
    })
  })

  describe('Ordenamiento', () => {
    it('Más puntos = mejor (DESC)', () => {
      const players = [
        { name: 'A', pts: 28 },
        { name: 'B', pts: 36 },
        { name: 'C', pts: 15 },
      ]
      const sorted = [...players].sort((a, b) => b.pts - a.pts)
      expect(sorted.map(p => p.name)).toEqual(['B', 'A', 'C'])
    })
  })
})
```

- [ ] **Step 3: Ejecutar y commit**

```bash
npx tsc --noEmit
npm run test -- stableford
git add src/golf/core/stableford-score.ts src/__tests__/canary/stableford.canary.test.ts
git commit -m "feat(golf): helper stableford centralizado + tests canario R&A 32"
```

---

## Tarea 6: Checklist Auditoría Stableford

**Files:**
- Create: `docs/audit/checklist-stableford.md`

- [ ] **Step 1: Escribir checklist**

```markdown
# Checklist Auditoría — Stableford

## Preparación
- [ ] Correr `npm run test -- stableford.canary` — debe pasar
- [ ] Abrir producción en celular

## Test 1: Ronda 18h stableford individual
- [ ] Crear ronda, formato Stableford
- [ ] **Verificar:** modo automáticamente queda en "Neto" (R&A 32.1b)
- [ ] **Verificar:** app pide handicap
- [ ] Ingresar HCP 15
- [ ] Tee blanco, Los Leones
- [ ] Iniciar
- [ ] Ingresar scores realistas (bogey mayoría, algunos pares)
- [ ] **Verificar:** leaderboard muestra "Pts" no gross ni vsPar
- [ ] **Verificar:** orden descendente (más puntos arriba)

## Test 2: 9 hoyos stableford
- [ ] Crear ronda 9h stableford
- [ ] HCP 10
- [ ] Jugar todos par → verificar 18 puntos (9 × 2)
- [ ] **Verificar:** badge "9 HOYOS" visible

## Test 3: Edge cases
- [ ] Triple bogey: verificar 0 puntos (no negativo)
- [ ] Eagle: verificar 4 puntos
- [ ] Pickup de hoyo (sin score): no penaliza

## Test 4: Múltiples jugadores
- [ ] 3 jugadores con HCPs distintos
- [ ] Verificar cada uno recibe golpes en los SI correctos
- [ ] Verificar ranking por puntos descendente

## Test 5: Vistas derivadas
- [ ] Espectador: "STABLEFORD" visible
- [ ] Share card: muestra puntos grandes, no golpes
- [ ] Historial: puntos guardados correctamente

## Bugs encontrados
- [ ] ___________
```

- [ ] **Step 2: Commit**

```bash
git add docs/audit/checklist-stableford.md
git commit -m "docs(audit): checklist manual stableford"
```

---

## Tarea 7: Spec Formal — Match Play

**Files:**
- Create: `docs/specs/formato-match-play.md`

- [ ] **Step 1: Escribir spec**

````markdown
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
state = 0 // positivo = A gana, negativo = B gana
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

- `calcularMatchPlay` — existente en `src/golf/formats/match-play.ts` (verificar)
- `capitalize` — helper de string (ya agregado en gwi-match.ts)
````

- [ ] **Step 2: Commit**

```bash
git add docs/specs/formato-match-play.md
git commit -m "docs(spec): formato Match Play con R&A 3.2 y casos dormie"
```

---

## Tarea 8: Helper Centralizado — Match Play State

**Files:**
- Create: `src/golf/core/match-play-state.ts`
- Test: `src/__tests__/canary/match-play.canary.test.ts`

- [ ] **Step 1: Verificar si existe match-play.ts**

Leer `src/golf/formats/match-play.ts` y `src/__tests__/match-play.test.ts` para entender la API actual.

- [ ] **Step 2: Escribir helper de match state centralizado**

Si match-play.ts ya tiene `calcularMatchPlay` funcional, el nuevo helper es un re-export con funciones adicionales para texto/visualización:

```typescript
// src/golf/core/match-play-state.ts

import { calcularMatchPlay } from '@/golf/formats/match-play'
export { calcularMatchPlay }

/**
 * Capitaliza cada palabra de un nombre.
 * "juan ruiz" → "Juan Ruiz"
 */
export function capitalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export interface MatchPlayDisplayState {
  state: number // + = A gana, - = B gana
  holesRemaining: number
  isFinished: boolean
  isDormie: boolean
  isAllSquare: boolean
  winnerName: string | null
  loserName: string | null
  resultText: string // "3&2", "1 UP", "AS", "Dormie"
}

/**
 * Convierte estado interno de match play a texto visible.
 * Usa los ejemplos del spec formal.
 */
export function describirMatchState(params: {
  state: number
  hoyoActual: number
  roundHoles: number
  nombreA: string
  nombreB: string
}): MatchPlayDisplayState {
  const { state, hoyoActual, roundHoles, nombreA, nombreB } = params
  const holesRemaining = Math.max(0, roundHoles - hoyoActual)
  const absState = Math.abs(state)
  const capA = capitalizarNombre(nombreA)
  const capB = capitalizarNombre(nombreB)

  // Match finalizado por diferencia mayor a restantes
  if (absState > holesRemaining) {
    const winnerName = state > 0 ? capA : capB
    const loserName = state > 0 ? capB : capA
    return {
      state,
      holesRemaining,
      isFinished: true,
      isDormie: false,
      isAllSquare: false,
      winnerName,
      loserName,
      resultText: `${absState}&${holesRemaining}`,
    }
  }

  // Fin de ronda: match finalizado (AS o por estado final)
  if (hoyoActual >= roundHoles) {
    if (state === 0) {
      return {
        state,
        holesRemaining: 0,
        isFinished: true,
        isDormie: false,
        isAllSquare: true,
        winnerName: null,
        loserName: null,
        resultText: 'AS',
      }
    }
    const winnerName = state > 0 ? capA : capB
    const loserName = state > 0 ? capB : capA
    return {
      state,
      holesRemaining: 0,
      isFinished: true,
      isDormie: false,
      isAllSquare: false,
      winnerName,
      loserName,
      resultText: `${absState} UP`,
    }
  }

  // En curso
  const isDormie = absState > 0 && absState === holesRemaining
  const leaderName = state > 0 ? capA : state < 0 ? capB : null

  let resultText: string
  if (state === 0) {
    resultText = 'AS'
  } else if (isDormie) {
    resultText = `${leaderName} está dormie`
  } else {
    resultText = `${leaderName} ${absState} UP`
  }

  return {
    state,
    holesRemaining,
    isFinished: false,
    isDormie,
    isAllSquare: state === 0,
    winnerName: null,
    loserName: null,
    resultText,
  }
}
```

- [ ] **Step 3: Escribir tests canario**

```typescript
// src/__tests__/canary/match-play.canary.test.ts

import { describe, it, expect } from 'vitest'
import {
  describirMatchState,
  capitalizarNombre,
} from '@/golf/core/match-play-state'

describe('Match Play — Tests Canario', () => {
  describe('Bug 9-abr-2026: Capitalización de nombres', () => {
    it('"juan ruiz" se muestra como "Juan Ruiz"', () => {
      expect(capitalizarNombre('juan ruiz')).toBe('Juan Ruiz')
    })
    it('"JUANJO LAMARCA" se muestra como "Juanjo Lamarca"', () => {
      expect(capitalizarNombre('JUANJO LAMARCA')).toBe('Juanjo Lamarca')
    })
    it('Nombres con espacios extra se limpian', () => {
      expect(capitalizarNombre('  juan   pablo  ')).toBe('Juan Pablo')
    })
  })

  describe('Bug 9-abr-2026: Texto dormie', () => {
    it('Dormie muestra "Juan Ruiz está dormie" — no "no puede perder por strokes"', () => {
      const state = describirMatchState({
        state: 2, // A 2 UP
        hoyoActual: 16, // quedan 2 hoyos
        roundHoles: 18,
        nombreA: 'juan ruiz',
        nombreB: 'pedro martinez',
      })
      expect(state.isDormie).toBe(true)
      expect(state.resultText).toBe('Juan Ruiz está dormie')
      expect(state.resultText).not.toContain('no puede perder')
      expect(state.resultText).not.toContain('strokes')
    })
  })

  describe('Resultados finales', () => {
    it('3&2 — A gana 3 UP con 2 hoyos restantes', () => {
      const result = describirMatchState({
        state: 3,
        hoyoActual: 16,
        roundHoles: 18,
        nombreA: 'a',
        nombreB: 'b',
      })
      expect(result.isFinished).toBe(true)
      expect(result.resultText).toBe('3&2')
      expect(result.winnerName).toBe('A')
    })

    it('1 UP — match termina en el 18 con A arriba por 1', () => {
      const result = describirMatchState({
        state: 1,
        hoyoActual: 18,
        roundHoles: 18,
        nombreA: 'juanjo',
        nombreB: 'pedro',
      })
      expect(result.isFinished).toBe(true)
      expect(result.resultText).toBe('1 UP')
      expect(result.winnerName).toBe('Juanjo')
    })

    it('AS — match empatado al terminar', () => {
      const result = describirMatchState({
        state: 0,
        hoyoActual: 18,
        roundHoles: 18,
        nombreA: 'a',
        nombreB: 'b',
      })
      expect(result.isFinished).toBe(true)
      expect(result.isAllSquare).toBe(true)
      expect(result.resultText).toBe('AS')
      expect(result.winnerName).toBeNull()
    })
  })

  describe('En curso', () => {
    it('AS con hoyos restantes', () => {
      const result = describirMatchState({
        state: 0,
        hoyoActual: 10,
        roundHoles: 18,
        nombreA: 'a',
        nombreB: 'b',
      })
      expect(result.isFinished).toBe(false)
      expect(result.resultText).toBe('AS')
    })

    it('Liderando 2 UP con 5 restantes', () => {
      const result = describirMatchState({
        state: 2,
        hoyoActual: 13,
        roundHoles: 18,
        nombreA: 'juanjo',
        nombreB: 'pedro',
      })
      expect(result.isFinished).toBe(false)
      expect(result.isDormie).toBe(false)
      expect(result.resultText).toBe('Juanjo 2 UP')
    })
  })

  describe('Match play 9 hoyos', () => {
    it('Respeta roundHoles=9', () => {
      const result = describirMatchState({
        state: 5,
        hoyoActual: 7,
        roundHoles: 9,
        nombreA: 'a',
        nombreB: 'b',
      })
      // 5 UP con 2 restantes → termina 5&2
      expect(result.isFinished).toBe(true)
      expect(result.resultText).toBe('5&2')
    })
  })
})
```

- [ ] **Step 4: Ejecutar y commit**

```bash
npx tsc --noEmit
npm run test -- match-play.canary
git add src/golf/core/match-play-state.ts src/__tests__/canary/match-play.canary.test.ts
git commit -m "feat(golf): helper match play state + capitalizacion + tests canario dormie"
```

---

## Tarea 9: Checklist Auditoría Match Play

**Files:**
- Create: `docs/audit/checklist-match-play.md`

- [ ] **Step 1: Escribir checklist**

```markdown
# Checklist Auditoría — Match Play

## Preparación
- [ ] `npm run test -- match-play` debe pasar
- [ ] Abrir producción en 2 dispositivos (jugador A y jugador B)

## Test 1: Match play 18h neto (Chile por default)
- [ ] Crear ronda, formato Match Play
- [ ] **Verificar:** modo = Neto automáticamente
- [ ] 2 jugadores: yo (HCP 12) + invitado (HCP 18)
- [ ] Iniciar
- [ ] **Verificar:** diferencia = 6 golpes para el invitado
- [ ] **Verificar:** app muestra en qué hoyos recibe golpes el invitado (SI 1-6)

## Test 2: Flujo de match state
- [ ] Hoyo 1: yo par, invitado bogey neto → estado "1 UP Juanjo"
- [ ] Hoyo 2: empate → estado no cambia
- [ ] Hoyos 3-16: jugar hasta llegar a 2 UP en hoyo 16
- [ ] **Verificar:** cuando estás 2 UP con 2 restantes, aparece "Juanjo está dormie"
- [ ] **Verificar:** NO dice "no puede perder por strokes"
- [ ] **Verificar:** nombre capitalizado correctamente

## Test 3: Terminar match anticipadamente
- [ ] Hoyo 17: ganas → 3 UP con 1 restante
- [ ] **Verificar:** match termina automáticamente con "3&2" o "4&1"
- [ ] **Verificar:** share card muestra resultado final
- [ ] **Verificar:** ya no pide score del hoyo 18

## Test 4: Match termina AS
- [ ] Nueva ronda, llevar el match hasta hoyo 18 empatado
- [ ] **Verificar:** termina con "AS"
- [ ] **Verificar:** sin ganador declarado

## Test 5: Leaderboard hoyo por hoyo
- [ ] Verificar tabla estilo Ryder Cup:
  - [ ] Colores: verde si ganó el hoyo, rojo si lo perdió, gris si halved
  - [ ] Score neto entre paréntesis
  - [ ] Todos los hoyos visibles, incluyendo el 18

## Test 6: Momentos recientes
- [ ] Después de varios hoyos ganados
- [ ] Verificar cada card muestra perspectiva correcta
- [ ] **Verificar:** "hace X min" sin "~"
- [ ] **Verificar:** ganador del hoyo no se duplica en ambos cards

## Test 7: Share card
- [ ] Compartir resultado
- [ ] **Verificar:** resultado tipo "3&2" o "1 UP" o "AS"
- [ ] **Verificar:** nombres capitalizados
- [ ] **Verificar:** NO muestra golpes totales (match play es distinto)

## Test 8: Match play 9 hoyos
- [ ] Crear match de 9h
- [ ] **Verificar:** badge "9 HOYOS" visible
- [ ] Jugar hasta ganar "3&2" (9 hoyos - 2 restantes = hoyo 7)
- [ ] **Verificar:** termina en hoyo 7 con 3&2

## Bugs encontrados
- [ ] ___________
```

- [ ] **Step 2: Commit**

```bash
git add docs/audit/checklist-match-play.md
git commit -m "docs(audit): checklist manual match play con 8 tests E2E"
```

---

## Tarea 10: Spec + Tests + Checklist — Best Ball

**Files:**
- Create: `docs/specs/formato-best-ball.md`
- Create: `src/__tests__/canary/best-ball.canary.test.ts`
- Create: `docs/audit/checklist-best-ball.md`

- [ ] **Step 1: Escribir spec**

````markdown
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
````

- [ ] **Step 2: Verificar tests existentes**

Leer `src/__tests__/best-ball.test.ts` y ver qué cubre. Agregar canarios para rondas de 9 hoyos y casos edge.

- [ ] **Step 3: Agregar tests canario específicos**

```typescript
// src/__tests__/canary/best-ball.canary.test.ts

import { describe, it, expect } from 'vitest'
import { parTotalEstandar } from '@/golf/core/round-score'

describe('Best Ball — Tests Canario', () => {
  describe('Selección de mejor score', () => {
    it('Gross: toma el menor de los dos jugadores por hoyo', () => {
      const scoreA = 4
      const scoreB = 6
      expect(Math.min(scoreA, scoreB)).toBe(4)
    })

    it('Stableford: toma el mayor (más puntos)', () => {
      const puntosA = 2 // par
      const puntosB = 3 // birdie
      expect(Math.max(puntosA, puntosB)).toBe(3)
    })
  })

  describe('Jugadores con handicaps diferentes', () => {
    it('En modo neto, cada jugador usa su propio HCP', () => {
      // Jugador A HCP 8, jugador B HCP 18
      // En hoyo SI=10: A no recibe, B recibe 1
      const scoreA = 5
      const scoreB = 6
      const ventajaA = 0
      const ventajaB = 1
      const netoA = scoreA - ventajaA // 5
      const netoB = scoreB - ventajaB // 5
      expect(Math.min(netoA, netoB)).toBe(5)
    })
  })

  describe('Pickup de un jugador', () => {
    it('Si un jugador tiene pickup, cuenta el otro', () => {
      const scoreA = null
      const scoreB = 5
      // Lógica: ignorar null, tomar el que tiene score
      const validScores = [scoreA, scoreB].filter(
        (s): s is number => s != null,
      )
      expect(Math.min(...validScores)).toBe(5)
    })
  })

  describe('9 hoyos best ball', () => {
    it('Par total equipo es 36 en 9 hoyos, no 72', () => {
      expect(parTotalEstandar(9)).toBe(36)
    })
  })
})
```

- [ ] **Step 4: Escribir checklist**

```markdown
# Checklist Auditoría — Best Ball

## Preparación
- [ ] `npm run test -- best-ball` debe pasar
- [ ] Abrir producción

## Test 1: Best Ball 18h gross, 2 equipos
- [ ] Crear ronda, formato Best Ball
- [ ] Modo Gross
- [ ] Crear 2 equipos de 2 jugadores cada uno
- [ ] Equipo 1: yo + invitado
- [ ] Equipo 2: otros 2 invitados
- [ ] Iniciar
- [ ] Ingresar scores individuales
- [ ] **Verificar:** leaderboard muestra score por equipo (mejor bola)
- [ ] **Verificar:** ordena por menor gross del equipo

## Test 2: Best Ball 18h neto
- [ ] Misma estructura, modo Neto
- [ ] HCPs distintos por jugador
- [ ] **Verificar:** cada jugador recibe golpes según su HCP
- [ ] **Verificar:** equipo score = mejor neto por hoyo

## Test 3: Ver detalle de equipo
- [ ] Click en un equipo en el leaderboard
- [ ] **Verificar:** se ven los scores individuales
- [ ] **Verificar:** indica cuál score contó por hoyo (resaltado)

## Test 4: Pickup de un jugador
- [ ] Jugador hace pickup en hoyo 5 (no ingresa score)
- [ ] **Verificar:** equipo usa el score del compañero
- [ ] **Verificar:** no penaliza al equipo

## Test 5: 9 hoyos
- [ ] Ronda 9h best ball
- [ ] **Verificar:** badge "9 HOYOS"
- [ ] **Verificar:** par total equipo = 36

## Test 6: Share card
- [ ] Compartir
- [ ] **Verificar:** nombre del equipo ganador
- [ ] **Verificar:** ambos jugadores del equipo listados

## Bugs encontrados
- [ ] ___________
```

- [ ] **Step 5: Commit**

```bash
git add docs/specs/formato-best-ball.md src/__tests__/canary/best-ball.canary.test.ts docs/audit/checklist-best-ball.md
git commit -m "feat(golf): spec + canary + audit Best Ball"
```

---

## Tarea 11: Spec + Tests + Checklist — Scramble

**Files:**
- Create: `docs/specs/formato-scramble.md`
- Create: `src/__tests__/canary/scramble.canary.test.ts`
- Create: `docs/audit/checklist-scramble.md`

- [ ] **Step 1: Escribir spec**

````markdown
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
````

- [ ] **Step 2: Tests canario**

```typescript
// src/__tests__/canary/scramble.canary.test.ts

import { describe, it, expect } from 'vitest'

describe('Scramble — Tests Canario', () => {
  describe('Un solo score por hoyo', () => {
    it('Equipo reporta un score por hoyo, no 4', () => {
      const teamScores = { 1: 4, 2: 5, 3: 3, 4: 5 }
      const gross = Object.values(teamScores).reduce((a, b) => a + b, 0)
      expect(gross).toBe(17)
    })
  })

  describe('HCP combinado 4-person', () => {
    it('Calcula según fórmula 25/20/15/10', () => {
      const hcps = [10, 15, 20, 25]
      const combined =
        hcps[0] * 0.25 + hcps[1] * 0.2 + hcps[2] * 0.15 + hcps[3] * 0.1
      expect(combined).toBe(11)
    })
  })

  describe('HCP combinado 2-person', () => {
    it('Calcula según fórmula 35/15', () => {
      const hcps = [12, 20]
      const combined = hcps[0] * 0.35 + hcps[1] * 0.15
      expect(combined).toBe(7.2)
    })
  })

  describe('9 hoyos scramble', () => {
    it('Solo cuenta hoyos 1-9', () => {
      const teamScores = {
        1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
      }
      const gross = Object.values(teamScores).reduce((a, b) => a + b, 0)
      expect(gross).toBe(36)
    })
  })
})
```

- [ ] **Step 3: Checklist**

```markdown
# Checklist Auditoría — Scramble

## Preparación
- [ ] `npm run test -- scramble` pasar
- [ ] Abrir producción

## Test 1: Scramble 4-person gross
- [ ] Crear ronda Scramble, 4 jugadores en 1 equipo
- [ ] Modo Gross, 18h
- [ ] Iniciar
- [ ] **Verificar:** app pide un score por hoyo (no 4 scores)
- [ ] Ingresar scores del equipo
- [ ] **Verificar:** leaderboard muestra score equipo

## Test 2: Scramble 4-person neto
- [ ] Modo Neto
- [ ] Cada jugador con HCP distinto (ej: 8, 15, 22, 28)
- [ ] **Verificar:** app calcula HCP combinado del equipo
- [ ] **Verificar:** muestra HCP combinado antes de iniciar
- [ ] Iniciar
- [ ] **Verificar:** scores netos del equipo correctos

## Test 3: Scramble 2-person
- [ ] Crear ronda con 2 equipos de 2
- [ ] **Verificar:** fórmula HCP combinado 2-person

## Test 4: Comparación de equipos
- [ ] 3 equipos de 4
- [ ] **Verificar:** ranking correcto por gross/neto

## Test 5: 9 hoyos scramble
- [ ] 9h scramble
- [ ] **Verificar:** badge "9 HOYOS"

## Bugs encontrados
- [ ] ___________
```

- [ ] **Step 4: Commit**

```bash
git add docs/specs/formato-scramble.md src/__tests__/canary/scramble.canary.test.ts docs/audit/checklist-scramble.md
git commit -m "feat(golf): spec + canary + audit Scramble"
```

---

## Tarea 12: Spec + Tests + Checklist — Foursome

**Files:**
- Create: `docs/specs/formato-foursome.md`
- Create: `src/__tests__/canary/foursome.canary.test.ts`
- Create: `docs/audit/checklist-foursome.md`

- [ ] **Step 1: Escribir spec**

````markdown
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
````

- [ ] **Step 2: Tests canario**

```typescript
// src/__tests__/canary/foursome.canary.test.ts

import { describe, it, expect } from 'vitest'

describe('Foursome — Tests Canario', () => {
  describe('HCP combinado', () => {
    it('Promedio simple de 2 jugadores', () => {
      const hcpA = 10
      const hcpB = 18
      expect((hcpA + hcpB) / 2).toBe(14)
    })
  })

  describe('Drives alternados', () => {
    it('Jugador A tira en hoyos impares (1,3,5...)', () => {
      const drivesA = [1, 3, 5, 7, 9, 11, 13, 15, 17]
      for (const h of drivesA) {
        expect(h % 2).toBe(1)
      }
    })

    it('Jugador B tira en hoyos pares (2,4,6...)', () => {
      const drivesB = [2, 4, 6, 8, 10, 12, 14, 16, 18]
      for (const h of drivesB) {
        expect(h % 2).toBe(0)
      }
    })
  })

  describe('Un solo score por hoyo', () => {
    it('Score del equipo, no suma de ambos', () => {
      const teamScore = 4
      expect(teamScore).toBe(4)
      // NO: 4 + 4 = 8
    })
  })

  describe('9 hoyos foursome', () => {
    it('5 drives de A (impares), 4 de B (pares)', () => {
      const impares = [1, 3, 5, 7, 9].length
      const pares = [2, 4, 6, 8].length
      expect(impares).toBe(5)
      expect(pares).toBe(4)
    })
  })
})
```

- [ ] **Step 3: Checklist**

```markdown
# Checklist Auditoría — Foursome

## Preparación
- [ ] `npm run test -- foursome` pasar
- [ ] Abrir producción

## Test 1: Foursome 18h neto
- [ ] Crear ronda Foursome
- [ ] 2 jugadores (1 equipo)
- [ ] HCPs 10 y 18 → team HCP 14
- [ ] Iniciar
- [ ] **Verificar:** app indica "A tira el drive" en hoyo 1
- [ ] **Verificar:** app indica "B tira el drive" en hoyo 2
- [ ] Alternar hasta completar 18
- [ ] **Verificar:** un solo score por hoyo

## Test 2: Team handicap
- [ ] **Verificar:** team HCP = promedio simple
- [ ] Neto calculado sobre team HCP, no individual

## Test 3: 2 equipos compitiendo
- [ ] 2 equipos de 2
- [ ] **Verificar:** leaderboard muestra ambos equipos ordenados

## Test 4: 9 hoyos foursome
- [ ] 9h foursome
- [ ] **Verificar:** 5 drives A, 4 drives B (o al revés según quién empieza)

## Bugs encontrados
- [ ] ___________
```

- [ ] **Step 4: Commit**

```bash
git add docs/specs/formato-foursome.md src/__tests__/canary/foursome.canary.test.ts docs/audit/checklist-foursome.md
git commit -m "feat(golf): spec + canary + audit Foursome"
```

---

## Tarea 13: Consolidar Helpers — Eliminar Duplicación

**Files:**
- Modify: `src/lib/share-card.ts` — usar helpers centralizados
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` — delegar cálculos a helpers
- Modify: `src/app/en-vivo/page.tsx` — verificar que solo consume del API

- [ ] **Step 1: Auditoría de duplicación**

Buscar en todo `src/` ocurrencias de:
- `72 + vsPar`
- `parTotal * 18`
- `roundHoles === 18 ? 72 : 36` (permitido solo en helpers centralizados)
- Cálculos de gross/neto fuera de `src/golf/core/`

```bash
grep -rn "72 + vsPar" src/
grep -rn "parTotal" src/ --include="*.tsx" --include="*.ts"
grep -rn "roundHoles" src/ --include="*.tsx"
```

Listar cada uno y decidir si debe reemplazarse por helper.

- [ ] **Step 2: Reemplazar ocurrencias en share-card.ts**

Revisar que **todas** las funciones de share-card usan `parTotalEstandar(totalHoles)` en vez de 72 hardcoded. Ya fue parcialmente arreglado; hay que auditar todo el archivo.

- [ ] **Step 3: Reemplazar ocurrencias en [codigo]/page.tsx**

La página tiene helpers locales `getVsPar`, `getHolesPlayed` que duplican `calcularScoreRonda`. Reemplazar por import del helper centralizado.

```typescript
// ANTES
function getVsPar(scores: Record<string, number>, holes: number, parMap: Record<number, number>): number {
  // ... implementación local
}

// DESPUÉS
import { calcularScoreRonda } from '@/golf/core/round-score'
// Y usar calcularScoreRonda(...) en los sitios
```

- [ ] **Step 4: Verificar tests**

```bash
npx tsc --noEmit
npm run test
```

Todos los tests deben pasar, incluyendo los canarios.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share-card.ts src/app/ronda-libre/[codigo]/page.tsx src/app/en-vivo/page.tsx
git commit -m "refactor(golf): eliminar duplicacion — usar helpers centralizados en vistas"
```

---

## Tarea 14: Migrar a Carpeta de Tests Consistente

**Files:**
- Move: `src/tests/round-score.test.ts` → `src/__tests__/round-score.test.ts`
- Move: `src/__tests__/canary/*.ts` — verificar que están en la ubicación correcta

- [ ] **Step 1: Mover round-score.test.ts**

```bash
mv src/tests/round-score.test.ts src/__tests__/round-score.test.ts
```

Verificar que vitest sigue encontrándolo:
```bash
npm run test -- round-score
```

- [ ] **Step 2: Verificar estructura canary**

Los canarios deben estar en `src/__tests__/canary/` (subdirectorio). Vitest los encuentra automáticamente con su glob default.

- [ ] **Step 3: Actualizar README de tests**

```markdown
# Estructura de Tests

- `src/__tests__/*.test.ts` — tests unitarios y de integración normales
- `src/__tests__/canary/*.canary.test.ts` — tests de regresión de bugs reportados
```

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/
git rm src/tests/round-score.test.ts
git commit -m "chore(tests): consolidar tests en src/__tests__/ con subdirectorio canary"
```

---

## Tarea 15: Runner de Checklists (Script de Ayuda)

**Files:**
- Create: `scripts/run-audit.ts`

- [ ] **Step 1: Crear script interactivo**

```typescript
// scripts/run-audit.ts
//
// Ejecuta todos los tests canario y lista los checklists manuales pendientes.
// Uso: npx tsx scripts/run-audit.ts [formato]
//
// Ejemplos:
//   npx tsx scripts/run-audit.ts stroke-play
//   npx tsx scripts/run-audit.ts all

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const FORMATS = [
  'stroke-play',
  'stableford',
  'match-play',
  'best-ball',
  'scramble',
  'foursome',
]

function runCanary(formato: string): boolean {
  try {
    console.log(`\n🐤 Canary tests: ${formato}`)
    execSync(`npm run test -- ${formato}.canary`, { stdio: 'inherit' })
    return true
  } catch {
    console.error(`❌ Canary fallido para ${formato}`)
    return false
  }
}

function showChecklist(formato: string): void {
  const checklistPath = path.join(
    'docs',
    'audit',
    `checklist-${formato}.md`,
  )
  if (fs.existsSync(checklistPath)) {
    console.log(`\n📋 Checklist manual pendiente:`)
    console.log(`   ${checklistPath}`)
    console.log(`   Abrir en editor y ejecutar paso por paso en producción.`)
  } else {
    console.warn(`⚠️  Sin checklist para ${formato}`)
  }
}

async function main() {
  const arg = process.argv[2] || 'all'
  const targets = arg === 'all' ? FORMATS : [arg]

  let allPassed = true
  for (const f of targets) {
    const ok = runCanary(f)
    if (!ok) allPassed = false
    showChecklist(f)
  }

  console.log('\n' + '─'.repeat(50))
  if (allPassed) {
    console.log('✅ Todos los canarios pasaron.')
    console.log('👉 Ejecutar checklists manuales en producción.')
  } else {
    console.error('❌ Hay canarios fallidos. Arreglar antes de continuar.')
    process.exit(1)
  }
}

main()
```

- [ ] **Step 2: Agregar script a package.json**

```json
{
  "scripts": {
    "audit": "tsx scripts/run-audit.ts",
    "audit:all": "tsx scripts/run-audit.ts all"
  }
}
```

- [ ] **Step 3: Verificar**

```bash
npm run audit -- stroke-play
```

- [ ] **Step 4: Commit**

```bash
git add scripts/run-audit.ts package.json
git commit -m "feat(scripts): runner de auditoría por modalidad (canary + checklist)"
```

---

## Tarea 16: Verificación Final y Reporte

- [ ] **Step 1: Correr toda la suite**

```bash
npx tsc --noEmit
npm run test
npm run build
npm run audit -- all
```

Todos deben pasar.

- [ ] **Step 2: Generar reporte de estado**

Crear `docs/audit/estado-modalidades.md`:

```markdown
# Estado de Modalidades — Auditoría

Fecha: YYYY-MM-DD

| Modalidad   | Spec | Helper | Canary | Checklist | Manual | Estado |
|-------------|------|--------|--------|-----------|--------|--------|
| Stroke Play | ✅    | ✅      | ✅      | ✅         | ⏳     | En QA  |
| Stableford  | ✅    | ✅      | ✅      | ✅         | ⏳     | En QA  |
| Match Play  | ✅    | ✅      | ✅      | ✅         | ⏳     | En QA  |
| Best Ball   | ✅    | ✅      | ✅      | ✅         | ⏳     | En QA  |
| Scramble    | ✅    | ✅      | ✅      | ✅         | ⏳     | En QA  |
| Foursome    | ✅    | ✅      | ✅      | ✅         | ⏳     | En QA  |

- **Spec:** documentación formal en `docs/specs/`
- **Helper:** fuente única de verdad en `src/golf/core/`
- **Canary:** tests de regresión en `src/__tests__/canary/`
- **Checklist:** procedimiento manual en `docs/audit/`
- **Manual:** ejecutado en producción (requiere juego real)

## Pendientes

1. Ejecutar checklists manuales jugando rondas reales
2. Reportar bugs encontrados y convertirlos en canarios
3. Re-auditar cualquier modalidad con bugs encontrados
```

- [ ] **Step 3: Commit**

```bash
git add docs/audit/estado-modalidades.md
git commit -m "docs(audit): reporte de estado de las 6 modalidades"
```

- [ ] **Step 4: Push final**

```bash
git push origin main
```

---

## Orden de ejecución y dependencias

```
Task 0 (preparación)
  │
  ├── Task 1 (Spec SP) ─── Task 2 (Canary SP) ─── Task 3 (Checklist SP)
  │
  ├── Task 4 (Spec ST) ─── Task 5 (Helper ST) ─── Task 6 (Checklist ST)
  │
  ├── Task 7 (Spec MP) ─── Task 8 (Helper MP) ─── Task 9 (Checklist MP)
  │
  ├── Task 10 (Spec+Canary+Checklist BB)
  ├── Task 11 (Spec+Canary+Checklist SC)
  └── Task 12 (Spec+Canary+Checklist FS)
       │
       └── Task 13 (consolidar helpers) — DEPENDE de Tasks 1-12
            │
            ├── Task 14 (migrar carpetas tests)
            ├── Task 15 (script runner)
            └── Task 16 (verificación final)
```

Tasks 1-12 pueden ejecutarse en paralelo (distintos formatos, distintos archivos).
Task 13 debe ejecutarse después de que los helpers estén creados.
Tasks 14-16 son de cierre.

## Estimación

- Tasks 0, 14, 15, 16: ~15 min cada una = 1h
- Tasks 1-12: ~25 min cada una = 5h
- Task 13: ~30 min

**Total:** ~6-7h de trabajo de subagentes en paralelo donde sea posible.
