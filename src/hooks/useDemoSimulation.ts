'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { generateHoleScore, DEMO_PARS, DEMO_SI } from '@/lib/demo-simulation'

export interface SimPlayer {
  id: number
  name: string
  initials: string
  pais: string
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
}

const PLAYERS_DEF = [
  { id:1, name:'Carlos Mendez', initials:'CM', pais:'CL', indice:2, categoria:'A' as const },
  { id:2, name:'Roberto Silva', initials:'RS', pais:'AR', indice:4, categoria:'A' as const },
  { id:3, name:'Andres Torres', initials:'AT', pais:'CO', indice:1, categoria:'A' as const },
  { id:4, name:'Felipe Garcia', initials:'FG', pais:'CL', indice:6, categoria:'B' as const },
  { id:5, name:'Miguel Rios', initials:'MR', pais:'PE', indice:3, categoria:'A' as const },
  { id:6, name:'Sebastian Lopez', initials:'SL', pais:'UY', indice:5, categoria:'B' as const },
  { id:7, name:'Diego Vargas', initials:'DV', pais:'CL', indice:7, categoria:'B' as const },
  { id:8, name:'Martin Perez', initials:'MP', pais:'AR', indice:8, categoria:'B' as const },
  { id:9, name:'Alejandro Cruz', initials:'AC', pais:'CO', indice:9, categoria:'A' as const },
  { id:10, name:'Valentina Mora', initials:'VM', pais:'CL', indice:12, categoria:'B' as const },
]

const BASE_GWI: Record<number, number[]> = {
  1: [82,84,85,86,87,88,87,89,89,88],
  2: [77,78,79,80,80,81,82,81,82,81],
  3: [87,88,90,91,91,92,91,92,92,92],
  4: [70,71,72,73,74,75,75,76,76,76],
  5: [80,81,83,83,84,85,85,85,85,85],
  6: [74,75,76,77,78,79,79,79,79,79],
  7: [64,65,67,67,68,69,69,70,70,69],
  8: [61,62,63,64,65,65,66,66,66,66],
  9: [66,67,68,69,70,71,72,72,72,72],
  10: [53,54,55,56,57,58,58,58,58,58],
}

function calcGWI(scores: (number | null)[]): number {
  const played = scores.filter((s): s is number => s !== null)
  if (played.length === 0) return 70
  const pars = DEMO_PARS.slice(0, played.length)
  const vspar = played.reduce((a, s, i) => a + (s - pars[i]), 0)
  const projected = (vspar / played.length) * 18
  return Math.max(0, Math.min(100, Math.round((100 - projected * 1.8) * 10) / 10))
}

function getScoreVsPar(scores: (number | null)[]): number {
  return scores.reduce((t: number, s, i) => s !== null ? t + (s - DEMO_PARS[i]) : t, 0)
}

function initPlayers(seed: number): SimPlayer[] {
  const stagger = [0, 3, 6, 1, 4, 7, 2, 5, 8, 10]
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
      scores,
      holesCompleted: startHole,
      status: startHole >= 18 ? 'finished' as const : 'playing' as const,
      gwi: currentGwi,
      gwiDelta: 0,
      gwiSeries: [...(BASE_GWI[p.id] ?? [70]), currentGwi],
      roundSeed: seed,
      justScored: false,
      prevPosition: idx + 1,
    }
  })
}

export function useDemoSimulation() {
  const [seed] = useState(() => Math.floor(Date.now() / 1000))
  const [players, setPlayers] = useState<SimPlayer[]>(() => initPlayers(seed))
  const [lastEvent, setLastEvent] = useState('')
  const [roundNumber, setRoundNumber] = useState(1)
  const queueIdx = useRef(0)

  const advance = useCallback(() => {
    setPlayers(prev => {
      const next = prev.map(p => ({ ...p, justScored: false }))
      let advanced = false
      let attempts = 0

      while (!advanced && attempts < next.length) {
        const pi = queueIdx.current % next.length
        queueIdx.current++
        attempts++
        const player = next[pi]
        if (player.status === 'finished') continue

        const holeIdx = player.holesCompleted
        if (holeIdx >= 18) continue

        const score = generateHoleScore(player.indice, holeIdx, player.roundSeed, DEMO_SI[holeIdx])
        const newScores = [...player.scores]
        newScores[holeIdx] = score
        const newGwi = calcGWI(newScores)

        const par = DEMO_PARS[holeIdx]
        const vspar = score - par
        setLastEvent(`${player.name} - H.${holeIdx + 1} Par ${par} -> ${score} (${vspar < 0 ? vspar : vspar > 0 ? '+' + vspar : 'E'})`)

        next[pi] = {
          ...player,
          scores: newScores,
          holesCompleted: holeIdx + 1,
          status: holeIdx + 1 >= 18 ? 'finished' : 'playing',
          gwi: newGwi,
          gwiDelta: Math.round((newGwi - player.gwi) * 10) / 10,
          gwiSeries: [...player.gwiSeries.slice(-9), newGwi],
          justScored: true,
        }
        advanced = true
      }

      // Sort by score vs par
      const sorted = [...next].sort((a, b) => {
        const aS = getScoreVsPar(a.scores)
        const bS = getScoreVsPar(b.scores)
        if (aS !== bS) return aS - bS
        return b.holesCompleted - a.holesCompleted
      })

      // Track position changes
      sorted.forEach((p) => { p.prevPosition = prev.findIndex(pp => pp.id === p.id) + 1 })

      // Check all finished
      if (sorted.every(p => p.status === 'finished')) {
        setTimeout(() => {
          const newSeed = Math.floor(Date.now() / 1000)
          setPlayers(initPlayers(newSeed))
          setRoundNumber(r => r + 1)
        }, 5000)
      }

      return sorted
    })
  }, [])

  useEffect(() => {
    const timer = setInterval(advance, 5000)
    return () => clearInterval(timer)
  }, [advance])

  // Clear justScored after 800ms
  useEffect(() => {
    if (players.some(p => p.justScored)) {
      const t = setTimeout(() => {
        setPlayers(prev => prev.map(p => ({ ...p, justScored: false })))
      }, 800)
      return () => clearTimeout(t)
    }
  }, [players])

  return { players, lastEvent, roundNumber, getScoreVsPar }
}

export { getScoreVsPar }
