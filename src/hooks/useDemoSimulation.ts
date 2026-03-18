'use client'

import { useState, useEffect, useCallback } from 'react'
import { generateHoleScore, DEMO_PARS, DEMO_SI } from '@/lib/demo-simulation'

export interface SimPlayer {
  id: number
  name: string
  initials: string
  pais: string          // emoji flag
  indice: number
  categoria: 'A' | 'B'
  scores: (number | null)[]
  holesCompleted: number
  status: 'playing' | 'finished'
  gwi: number
  gwiDelta: number
  gwiSeries: number[]
  roundSeed: number
  justScored: boolean
  prevPosition: number
  grossTotal: number    // sum of all played hole scores
  positionDelta: number // positive = moved up, negative = moved down
}

const FLAG: Record<string, string> = {
  CL: '\u{1F1E8}\u{1F1F1}',
  AR: '\u{1F1E6}\u{1F1F7}',
  CO: '\u{1F1E8}\u{1F1F4}',
  PE: '\u{1F1F5}\u{1F1EA}',
  UY: '\u{1F1FA}\u{1F1FE}',
}

const PLAYERS_DEF = [
  { id: 1,  name: 'Carlos Mendez',    initials: 'CM', pais: 'CL', indice: 2,  categoria: 'A' as const },
  { id: 2,  name: 'Roberto Silva',    initials: 'RS', pais: 'AR', indice: 4,  categoria: 'A' as const },
  { id: 3,  name: 'Andres Torres',    initials: 'AT', pais: 'CO', indice: 1,  categoria: 'A' as const },
  { id: 4,  name: 'Felipe Garcia',    initials: 'FG', pais: 'CL', indice: 6,  categoria: 'B' as const },
  { id: 5,  name: 'Miguel Rios',      initials: 'MR', pais: 'PE', indice: 3,  categoria: 'A' as const },
  { id: 6,  name: 'Sebastian Lopez',  initials: 'SL', pais: 'UY', indice: 5,  categoria: 'B' as const },
  { id: 7,  name: 'Diego Vargas',     initials: 'DV', pais: 'CL', indice: 7,  categoria: 'B' as const },
  { id: 8,  name: 'Martin Perez',     initials: 'MP', pais: 'AR', indice: 8,  categoria: 'B' as const },
  { id: 9,  name: 'Alejandro Cruz',   initials: 'AC', pais: 'CO', indice: 9,  categoria: 'A' as const },
  { id: 10, name: 'Valentina Mora',   initials: 'VM', pais: 'CL', indice: 12, categoria: 'B' as const },
]

const BASE_GWI: Record<number, number[]> = {
  1:  [82, 84, 85, 86, 87, 88, 87, 89, 89, 88],
  2:  [77, 78, 79, 80, 80, 81, 82, 81, 82, 81],
  3:  [87, 88, 90, 91, 91, 92, 91, 92, 92, 92],
  4:  [70, 71, 72, 73, 74, 75, 75, 76, 76, 76],
  5:  [80, 81, 83, 83, 84, 85, 85, 85, 85, 85],
  6:  [74, 75, 76, 77, 78, 79, 79, 79, 79, 79],
  7:  [64, 65, 67, 67, 68, 69, 69, 70, 70, 69],
  8:  [61, 62, 63, 64, 65, 65, 66, 66, 66, 66],
  9:  [66, 67, 68, 69, 70, 71, 72, 72, 72, 72],
  10: [53, 54, 55, 56, 57, 58, 58, 58, 58, 58],
}

/** Pseudo-random number from seed (0-1 range) */
function seededRand(seed: number): number {
  return Math.abs(Math.sin(seed * 9301 + 49297) % 1)
}

function calcGWI(scores: (number | null)[]): number {
  const played = scores.filter((s): s is number => s !== null)
  if (played.length === 0) return 70
  const pars = DEMO_PARS.slice(0, played.length)
  const vspar = played.reduce((a, s, i) => a + (s - pars[i]), 0)
  const projected = (vspar / played.length) * 18
  return Math.max(0, Math.min(100, Math.round((100 - projected * 1.8) * 10) / 10))
}

export function getScoreVsPar(scores: (number | null)[]): number {
  return scores.reduce((t: number, s, i) => s !== null ? t + (s - DEMO_PARS[i]) : t, 0)
}

function getGrossTotal(scores: (number | null)[]): number {
  return scores.reduce((t: number, s) => s !== null ? t + s : t, 0)
}

function initPlayers(seed: number): SimPlayer[] {
  // Stagger start: players begin at different holes for visual interest
  const stagger = [0, 2, 4, 1, 3, 5, 0, 2, 4, 1]
  return PLAYERS_DEF.map((p, idx) => {
    const startHole = stagger[idx]
    const scores: (number | null)[] = Array(18).fill(null)
    for (let h = 0; h < startHole; h++) {
      scores[h] = generateHoleScore(p.indice, h, seed, DEMO_SI[h])
    }
    const baseGwi = BASE_GWI[p.id]?.[BASE_GWI[p.id].length - 1] ?? 70
    const currentGwi = startHole > 0 ? calcGWI(scores) : baseGwi
    return {
      ...p,
      pais: FLAG[p.pais] || p.pais,
      scores,
      holesCompleted: startHole,
      status: startHole >= 18 ? 'finished' as const : 'playing' as const,
      gwi: currentGwi,
      gwiDelta: 0,
      gwiSeries: [...(BASE_GWI[p.id] ?? [70]), currentGwi],
      roundSeed: seed,
      justScored: false,
      prevPosition: idx + 1,
      grossTotal: getGrossTotal(scores),
      positionDelta: 0,
    }
  })
}

function sortPlayers(players: SimPlayer[]): SimPlayer[] {
  return [...players].sort((a, b) => {
    const aS = getScoreVsPar(a.scores)
    const bS = getScoreVsPar(b.scores)
    if (aS !== bS) return aS - bS
    return b.holesCompleted - a.holesCompleted
  })
}

export function useDemoSimulation() {
  const [seed, setSeed] = useState(() => Date.now())
  const [players, setPlayers] = useState<SimPlayer[]>(() => {
    const init = initPlayers(Date.now())
    return sortPlayers(init)
  })
  const [lastEvent, setLastEvent] = useState('')
  const [roundNumber, setRoundNumber] = useState(1)

  const advanceBatch = useCallback(() => {
    setPlayers(prev => {
      // Build old position map (id -> 1-based position)
      const oldPosMap = new Map<number, number>()
      prev.forEach((p, i) => { oldPosMap.set(p.id, i + 1) })

      // Clear justScored
      const next = prev.map(p => ({ ...p, justScored: false }))

      // Use Date.now() as a varying seed for randomness
      const tickSeed = Date.now()

      // Pick 2-4 random players to advance
      const playingIndices = next
        .map((p, i) => ({ i, p }))
        .filter(({ p }) => p.status === 'playing')

      if (playingIndices.length === 0) return prev

      const numToAdvance = Math.min(
        playingIndices.length,
        2 + Math.floor(seededRand(tickSeed * 0.001) * 3) // 2-4
      )

      // Shuffle playing indices using seed
      const shuffled = [...playingIndices]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRand(tickSeed * 0.007 + i * 3.7) * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      const toAdvance = shuffled.slice(0, numToAdvance)
      const events: string[] = []

      for (const { i: pi } of toAdvance) {
        const player = next[pi]
        // Each player advances 1-3 holes
        const holesThisTick = Math.min(
          18 - player.holesCompleted,
          1 + Math.floor(seededRand(tickSeed * 0.013 + player.id * 7.1) * 3) // 1-3
        )

        const newScores = [...player.scores]
        let lastHoleIdx = player.holesCompleted
        for (let h = 0; h < holesThisTick; h++) {
          const holeIdx = player.holesCompleted + h
          if (holeIdx >= 18) break
          newScores[holeIdx] = generateHoleScore(player.indice, holeIdx, player.roundSeed, DEMO_SI[holeIdx])
          lastHoleIdx = holeIdx
        }

        const newHolesCompleted = Math.min(18, player.holesCompleted + holesThisTick)
        const newGwi = calcGWI(newScores)
        const lastScore = newScores[lastHoleIdx]
        const lastPar = DEMO_PARS[lastHoleIdx]
        const vspar = lastScore !== null ? lastScore - lastPar : 0

        events.push(
          `${player.name} H.${lastHoleIdx + 1} Par ${lastPar} \u2192 ${lastScore} (${vspar < 0 ? vspar : vspar > 0 ? '+' + vspar : 'E'})`
        )

        next[pi] = {
          ...player,
          scores: newScores,
          holesCompleted: newHolesCompleted,
          status: newHolesCompleted >= 18 ? 'finished' : 'playing',
          gwi: newGwi,
          gwiDelta: Math.round((newGwi - player.gwi) * 10) / 10,
          gwiSeries: [...player.gwiSeries.slice(-9), newGwi],
          justScored: true,
          grossTotal: getGrossTotal(newScores),
        }
      }

      // Set last event (show all events joined)
      if (events.length > 0) {
        setLastEvent(events.join('  \u00b7  '))
      }

      // Sort by score vs par
      const sorted = sortPlayers(next)

      // Track position changes
      sorted.forEach((p, newIdx) => {
        const oldPos = oldPosMap.get(p.id) ?? (newIdx + 1)
        p.prevPosition = oldPos
        p.positionDelta = oldPos - (newIdx + 1) // positive = moved up
      })

      // Check all finished -> auto-reset after 8 seconds
      if (sorted.every(p => p.status === 'finished')) {
        setTimeout(() => {
          const newSeed = Date.now()
          setSeed(newSeed)
          const fresh = initPlayers(newSeed)
          setPlayers(sortPlayers(fresh))
          setRoundNumber(r => r + 1)
          setLastEvent('Nueva ronda iniciada')
        }, 8000)
      }

      return sorted
    })
  }, [])

  useEffect(() => {
    const timer = setInterval(advanceBatch, 20000)
    return () => clearInterval(timer)
  }, [advanceBatch])

  // Clear justScored after 1.5s
  useEffect(() => {
    if (players.some(p => p.justScored)) {
      const t = setTimeout(() => {
        setPlayers(prev => prev.map(p => ({ ...p, justScored: false })))
      }, 1500)
      return () => clearTimeout(t)
    }
  }, [players])

  return { players, lastEvent, roundNumber, seed, getScoreVsPar }
}
