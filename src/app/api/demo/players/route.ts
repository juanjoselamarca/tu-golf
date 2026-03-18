import { NextResponse } from 'next/server'

const PARS = [4,5,3,4,3,4,4,3,5,4,5,4,3,5,4,5,3,4]

function generateGWISeries(indice: number, seed: number): number[] {
  const series: number[] = []
  for (let i = 0; i < 10; i++) {
    const base = 100 - (indice * 3.2)
    const variance = Math.sin(seed * 13.7 + i * 7.3) * 6
    const progression = i * 0.4
    series.push(Math.round(Math.max(20, Math.min(98, base + variance + progression)) * 10) / 10)
  }
  return series
}

const DEMO_SCORES: (number | null)[][] = [
  [3,5,3,3,2,4,3,3,5,4,4,4,3,4,3,5,2,4],       // Carlos -8
  [3,5,3,4,2,4,4,3,5,4,4,4,3,4,4,4,3,4],       // Roberto -5
  [4,5,3,4,3,4,4,3,5,4,5,4,3,4,3,5,3,4],       // Andrés -3
  [4,5,3,4,3,4,4,3,5,4,5,4,3,5,4,5,3,4],       // Felipe -2  (E on par, adjusted)
  [4,5,3,4,3,4,4,3,5,4,5,4,3,5,null,null,null,null], // Miguel -1 H14
  [4,5,4,4,3,4,4,3,5,4,5,null,null,null,null,null,null,null], // Sebastián E H11
  [4,5,4,5,3,5,4,3,5,4,5,4,3,5,4,5,3,4],       // Diego +2
  [5,5,4,4,4,5,4,4,5,4,5,4,4,5,4,null,null,null], // Martín +4 H15
  [5,5,4,5,4,5,5,4,5,4,5,5,4,5,5,5,3,4],       // Alejandro +6
  [5,6,4,5,4,5,5,4,5,5,5,5,4,5,5,5,3,5],       // Valentina +8
]

const PLAYERS_DATA = [
  { name:'Carlos Méndez', indice:2, pais:'CL', cat:'A' },
  { name:'Roberto Silva', indice:4, pais:'AR', cat:'A' },
  { name:'Andrés Torres', indice:1, pais:'CO', cat:'A' },
  { name:'Felipe García', indice:6, pais:'CL', cat:'B' },
  { name:'Miguel Ríos', indice:3, pais:'PE', cat:'A' },
  { name:'Sebastián López', indice:5, pais:'UY', cat:'B' },
  { name:'Diego Vargas', indice:7, pais:'CL', cat:'B' },
  { name:'Martín Pérez', indice:8, pais:'AR', cat:'B' },
  { name:'Alejandro Cruz', indice:9, pais:'CO', cat:'A' },
  { name:'Valentina Mora', indice:12, pais:'CL', cat:'B' },
]

export async function GET() {
  const players = PLAYERS_DATA.map((p, i) => {
    const scores = DEMO_SCORES[i]
    const completed = scores.filter(s => s !== null) as number[]
    const holesCompleted = completed.length
    const grossTotal = completed.reduce((a, b) => a + b, 0)
    const parPlayed = PARS.slice(0, holesCompleted).reduce((a, b) => a + b, 0)
    const scoreVsPar = grossTotal - parPlayed

    const front9Scores = scores.slice(0, 9).filter(s => s !== null) as number[]
    const front9 = front9Scores.length === 9 ? front9Scores.reduce((a, b) => a + b, 0) : null
    const back9Scores = scores.slice(9).filter(s => s !== null) as number[]
    const back9 = back9Scores.length > 0 ? back9Scores.reduce((a, b) => a + b, 0) : null

    const gwiSeries = generateGWISeries(p.indice, i + 1)
    const gwi = gwiSeries[gwiSeries.length - 1]
    const gwiDelta = Math.round((gwiSeries[gwiSeries.length - 1] - gwiSeries[gwiSeries.length - 2]) * 10) / 10
    const gwiTrend = gwiDelta > 0.5 ? 'up' as const : gwiDelta < -0.5 ? 'down' as const : 'stable' as const
    const gwiLevel = gwi >= 85 ? 'ÉLITE' : gwi >= 70 ? 'AVANZADO' : gwi >= 50 ? 'INTERMEDIO' : 'BÁSICO'

    const bestRound = Math.round(68 + p.indice * 0.8)

    return {
      id: `demo-${i + 1}`,
      name: p.name,
      pais: p.pais,
      indice: p.indice,
      categoria: p.cat,
      gwi,
      gwi_delta: gwiDelta,
      gwi_trend: gwiTrend,
      gwi_series: gwiSeries,
      gwi_level: gwiLevel,
      current_round: {
        score_vs_par: scoreVsPar,
        holes_completed: holesCompleted,
        gross_total: grossTotal,
        front9,
        back9,
        scorecard: scores.map((s, j) => ({ hole: j + 1, par: PARS[j], score: s })),
      },
      best_round: bestRound,
      total_rounds: 10,
    }
  })

  // Sort by score_vs_par ascending
  players.sort((a, b) => a.current_round.score_vs_par - b.current_round.score_vs_par)

  return NextResponse.json({ players })
}
