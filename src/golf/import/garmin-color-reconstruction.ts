/**
 * Reconstrucción de golpes por hoyo desde la barra de colores de la vista "actividad" de Garmin Golf.
 * Movido tal cual desde `src/app/api/import/screenshot/route.ts` (regla "el que toca, ordena", 14-nov-2026).
 */
import { normalizeGarminColor, colorToDiff } from '@/golf/core/colors'

// ============================================================
// Score reconstruction from color-bar segments
// Uses garmin-colors.ts as single source of truth
// ============================================================
export interface ReconstructionResult {
  scores: Record<string, number>
  confidence: number
  ambiguousHoles: number[]
}

export function reconstructScores(
  colorSequence: string[],
  totalGross: number,
  vsPar: number,
  holesPlayed: number,
  coursePars?: Record<number, number>
): ReconstructionResult {
  const holes = colorSequence.length || holesPlayed

  // --- Par distribution via checksum ---
  // parTotal = totalGross - vsPar (e.g. 52 - 16 = 36)
  const parTotal = totalGross - vsPar
  // Build per-hole pars: start all at 4, adjust to match parTotal
  const holePars: number[] = new Array(holes).fill(4)
  if (coursePars) {
    for (let i = 0; i < holes; i++) {
      holePars[i] = coursePars[i + 1] ?? 4
    }
  } else {
    // Distribute to match parTotal
    let currentTotal = holes * 4
    if (currentTotal > parTotal) {
      // Need some par-3s — place at holes 3, 9, 18 (or equivalent)
      const deficit = currentTotal - parTotal
      const par3Positions = holes === 18
        ? [2, 5, 8, 11, 14, 17] // 0-indexed: holes 3,6,9,12,15,18
        : [2, 5, 8]              // 0-indexed: holes 3,6,9
      for (let d = 0; d < deficit && d < par3Positions.length; d++) {
        const pos = par3Positions[d]
        if (pos < holes) {
          holePars[pos] = 3
          currentTotal--
        }
      }
    } else if (currentTotal < parTotal) {
      // Need some par-5s — place at holes 2, 7, 13, 16 (or equivalent)
      const surplus = parTotal - currentTotal
      const par5Positions = holes === 18
        ? [1, 6, 9, 12, 15, 17]
        : [1, 4, 7]
      for (let s = 0; s < surplus && s < par5Positions.length; s++) {
        const pos = par5Positions[s]
        if (pos < holes) {
          holePars[pos] = 5
          currentTotal++
        }
      }
    }
  }

  const parForHole = (h: number) => holePars[h - 1] ?? 4

  // --- Build base scores from colors ---
  const baseScores: Record<string, number> = {}
  const redHoles: number[] = []
  const goldHoles: number[] = []
  let baseTotal = 0

  for (let i = 0; i < holes; i++) {
    const holeNum = i + 1
    const par = parForHole(holeNum)
    const rawColor = colorSequence[i] || 'green'
    const normalized = normalizeGarminColor(rawColor)
    const diff = colorToDiff(rawColor)

    const score = Math.max(1, par + diff)
    baseScores[String(holeNum)] = score
    baseTotal += score

    if (normalized === 'red') {
      redHoles.push(holeNum)
    } else if (normalized === 'gold') {
      goldHoles.push(holeNum)
    }
  }

  // --- Pre-fix: if baseTotal > totalGross, Gemini over-counted reds ---
  // Downgrade reds to golds until baseTotal <= totalGross
  let residual = totalGross - baseTotal
  if (residual < 0 && redHoles.length > 0) {
    // Sort red holes by score descending — downgrade the highest first
    const sortedReds = [...redHoles].sort((a, b) => baseScores[String(b)] - baseScores[String(a)])
    for (const h of sortedReds) {
      if (residual >= 0) break
      // Downgrade from double bogey to bogey (-1 stroke)
      baseScores[String(h)] -= 1
      baseTotal -= 1
      residual += 1
      // Move from red to gold tracking
      const idx = redHoles.indexOf(h)
      if (idx !== -1) redHoles.splice(idx, 1)
      goldHoles.push(h)
    }
  }

  const ambiguousHoles: number[] = []
  const extraAdded: Record<number, number> = {} // track extra per hole
  const MAX_EXTRA_PER_HOLE = 2

  if (residual > 0) {
    // Sort gold holes by base score descending (highest par first)
    goldHoles.sort((a, b) => baseScores[String(b)] - baseScores[String(a)])

    // Pass 1: add +1 to all red holes
    for (const h of redHoles) {
      if (residual <= 0) break
      baseScores[String(h)] += 1
      extraAdded[h] = (extraAdded[h] || 0) + 1
      residual--
    }

    // Pass 2: add +1 to gold holes (highest base score first)
    if (residual > 0) {
      for (const h of goldHoles) {
        if (residual <= 0) break
        if ((extraAdded[h] || 0) >= MAX_EXTRA_PER_HOLE) continue
        baseScores[String(h)] += 1
        extraAdded[h] = (extraAdded[h] || 0) + 1
        residual--
      }
    }

    // Pass 3: another +1 to red holes
    if (residual > 0) {
      for (const h of redHoles) {
        if (residual <= 0) break
        if ((extraAdded[h] || 0) >= MAX_EXTRA_PER_HOLE) continue
        baseScores[String(h)] += 1
        extraAdded[h] = (extraAdded[h] || 0) + 1
        residual--
      }
    }

    // Pass 4: another +1 to gold holes
    if (residual > 0) {
      for (const h of goldHoles) {
        if (residual <= 0) break
        if ((extraAdded[h] || 0) >= MAX_EXTRA_PER_HOLE) continue
        baseScores[String(h)] += 1
        extraAdded[h] = (extraAdded[h] || 0) + 1
        residual--
      }
    }

    // Pass 5 (safety): if still residual, spread +1 across ALL holes that haven't maxed out
    if (residual > 0) {
      for (let i = 0; i < holes && residual > 0; i++) {
        const h = i + 1
        if ((extraAdded[h] || 0) >= MAX_EXTRA_PER_HOLE) continue
        baseScores[String(h)] += 1
        extraAdded[h] = (extraAdded[h] || 0) + 1
        residual--
      }
    }

    // Cap: no score exceeds par + 5 (i.e. max 9 for par 4)
    for (let i = 0; i < holes; i++) {
      const h = i + 1
      const maxScore = parForHole(h) + 5
      if (baseScores[String(h)] > maxScore) {
        baseScores[String(h)] = maxScore
      }
    }

    // Mark all holes that received extra strokes as ambiguous
    for (const h of Object.keys(extraAdded)) {
      if (extraAdded[Number(h)] > 0) {
        ambiguousHoles.push(Number(h))
      }
    }
  } else if (residual < 0) {
    // Negative residual (defensive): subtract from highest scores first
    const allHolesSorted = Array.from({ length: holes }, (_, i) => i + 1)
      .sort((a, b) => baseScores[String(b)] - baseScores[String(a)])

    for (const h of allHolesSorted) {
      if (residual >= 0) break
      const minScore = Math.max(1, parForHole(h) - 2) // don't go below eagle
      const canSubtract = baseScores[String(h)] - minScore
      if (canSubtract > 0) {
        const sub = Math.min(canSubtract, -residual)
        baseScores[String(h)] -= sub
        residual += sub
        ambiguousHoles.push(h)
      }
    }
  }

  const originalResidual = totalGross - baseTotal - residual // how much we actually distributed
  const conf = originalResidual === 0 && residual === 0 ? 0.95
    : ambiguousHoles.length === 0 ? 0.90
    : ambiguousHoles.length <= 3 ? 0.85
    : 0.70

  return { scores: baseScores, confidence: conf, ambiguousHoles }
}
