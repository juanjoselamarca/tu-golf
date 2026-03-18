import { NextResponse } from 'next/server'

const PARS = [4,5,3,4,3,4,4,3,5,4,5,4,3,5,4,5,3,4]
const PAR_TOTAL = 72

function carlosRound(weekIndex: number) {
  const scores: Record<number, number> = {}
  const progression = weekIndex / 30
  let gir = 0, putts = 0, fairways = 0

  PARS.forEach((par, i) => {
    const hoyo = i + 1
    const wave = Math.sin(hoyo * 1.3 + weekIndex * 0.7)
    const normalized = (wave + 1) / 2

    let score = par
    if (normalized < 0.12) score = par - 1
    else if (normalized < 0.65) score = par
    else if (normalized < 0.90) score = par + 1
    else score = par + 2

    if (progression > 0.6 && normalized < 0.20) score = par - 1

    scores[hoyo] = Math.max(1, score)

    if (score <= par) gir++
    putts += score <= par ? 2 : Math.min(3, score - par + 2)
    if ((par === 4 || par === 5) && normalized > 0.3) fairways++
  })

  const total_gross = Object.values(scores).reduce((a, b) => a + b, 0)
  const scoresArr = Object.entries(scores).sort(([a],[b]) => parseInt(a) - parseInt(b)).map(([,v]) => v)
  const front9 = scoresArr.slice(0, 9).reduce((a, b) => a + b, 0)
  const back9 = scoresArr.slice(9).reduce((a, b) => a + b, 0)

  return { scores: scoresArr, total_gross, front9, back9, gir, putts, fairways }
}

const COURSES = ['Club de Golf Los Leones','Prince of Wales Country Club','Club de Golf La Dehesa','Club de Golf Los Leones','Club de Golf Los Leones','Prince of Wales Country Club']

export async function GET() {
  const rounds = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - ((29 - i) * 7))
    const course = COURSES[i % COURSES.length]
    const r = carlosRound(i)
    return {
      index: i + 1,
      date: d.toISOString().split('T')[0],
      course,
      gross: r.total_gross,
      neto: r.total_gross - 2,
      score_vs_par: r.total_gross - PAR_TOTAL,
      front9: r.front9,
      back9: r.back9,
      scores: r.scores,
      gir: r.gir,
      putts: r.putts,
      fairways: r.fairways,
    }
  })

  // Stats
  const grosses = rounds.map(r => r.gross)
  const avg_score = grosses.reduce((a, b) => a + b, 0) / grosses.length
  const best_score = Math.min(...grosses)
  const worst_score = Math.max(...grosses)
  const avg_putts = rounds.reduce((a, r) => a + r.putts, 0) / rounds.length
  const gir_pct = Math.round(rounds.reduce((a, r) => a + r.gir, 0) / rounds.length / 18 * 1000) / 10
  const fairways_pct = Math.round(rounds.reduce((a, r) => a + r.fairways, 0) / rounds.length / 14 * 1000) / 10
  const front9_avg = Math.round(rounds.reduce((a, r) => a + r.front9, 0) / rounds.length * 10) / 10
  const back9_avg = Math.round(rounds.reduce((a, r) => a + r.back9, 0) / rounds.length * 10) / 10

  // Par averages
  const par3Holes = PARS.map((p, i) => p === 3 ? i : -1).filter(i => i >= 0)
  const par4Holes = PARS.map((p, i) => p === 4 ? i : -1).filter(i => i >= 0)
  const par5Holes = PARS.map((p, i) => p === 5 ? i : -1).filter(i => i >= 0)
  const par3_avg = Math.round(rounds.reduce((a, r) => a + par3Holes.reduce((s, h) => s + r.scores[h], 0), 0) / rounds.length / par3Holes.length * 100) / 100
  const par4_avg = Math.round(rounds.reduce((a, r) => a + par4Holes.reduce((s, h) => s + r.scores[h], 0), 0) / rounds.length / par4Holes.length * 100) / 100
  const par5_avg = Math.round(rounds.reduce((a, r) => a + par5Holes.reduce((s, h) => s + r.scores[h], 0), 0) / rounds.length / par5Holes.length * 100) / 100

  // Score distribution
  let birdies = 0, eagles = 0, pars = 0, bogeys = 0, doubles = 0
  rounds.forEach(r => r.scores.forEach((s, i) => {
    const d = s - PARS[i]
    if (d <= -2) eagles++
    else if (d === -1) birdies++
    else if (d === 0) pars++
    else if (d === 1) bogeys++
    else doubles++
  }))

  // GWI series (moving avg of 5 rounds)
  const gwi_series = rounds.map((_, i) => {
    const window = rounds.slice(Math.max(0, i - 4), i + 1)
    const windowAvg = window.reduce((a, r) => a + r.gross, 0) / window.length
    return Math.round(Math.max(20, Math.min(98, 100 - (windowAvg - PAR_TOTAL) * 1.8)) * 10) / 10
  })
  const gwi = gwi_series[gwi_series.length - 1]
  const gwi_delta = Math.round((gwi_series[gwi_series.length - 1] - gwi_series[Math.max(0, gwi_series.length - 4)]) * 10) / 10
  const gwi_level = gwi >= 85 ? 'ÉLITE' : gwi >= 70 ? 'AVANZADO' : gwi >= 50 ? 'INTERMEDIO' : 'BÁSICO'

  // Patterns
  const patterns = [
    {
      type: 'par4_specialist',
      active: par4_avg < 4.3,
      color: 'green',
      title: 'Especialista en par 4',
      description: `Promedio en par 4: ${par4_avg.toFixed(2)} — por debajo del esperado para un índice 2. Los par 4 son tu arma más fuerte.`,
    },
    {
      type: 'back9_analysis',
      active: back9_avg > front9_avg + 0.3,
      color: back9_avg > front9_avg + 1.5 ? 'red' : 'yellow',
      title: back9_avg > front9_avg + 1.5 ? 'Colapso en back 9' : 'Back 9 ligeramente inferior',
      description: `Front 9 avg: ${front9_avg} · Back 9 avg: ${back9_avg}. Diferencia de ${(back9_avg - front9_avg).toFixed(1)} strokes.`,
    },
    {
      type: 'improving',
      active: true,
      color: 'green',
      title: 'Tendencia de mejora clara',
      description: `Últimas 5 rondas avg: ${(rounds.slice(-5).reduce((a, r) => a + r.gross, 0) / 5).toFixed(1)} vs primeras 5: ${(rounds.slice(0, 5).reduce((a, r) => a + r.gross, 0) / 5).toFixed(1)}. Mejora de ${((rounds.slice(0, 5).reduce((a, r) => a + r.gross, 0) / 5) - (rounds.slice(-5).reduce((a, r) => a + r.gross, 0) / 5)).toFixed(1)} strokes en 8 meses.`,
    },
  ]

  const scoring_trend = rounds.slice(-10).map(r => r.gross)

  return NextResponse.json({
    player: { name: 'Carlos Méndez', pais: 'CL', indice: 2, categoria: 'A', member_since: '2025-07-01' },
    gwi, gwi_delta, gwi_level, gwi_series,
    stats: {
      avg_score: Math.round(avg_score * 10) / 10,
      best_score, worst_score,
      total_rounds: 30,
      avg_putts: Math.round(avg_putts * 10) / 10,
      gir_pct, fairways_pct,
      front9_avg, back9_avg,
      par3_avg, par4_avg, par5_avg,
      scoring_trend,
      birdies_total: birdies, eagles_total: eagles, bogeys_total: bogeys, pars_total: pars, doubles_total: doubles,
    },
    patterns,
    historial: rounds.reverse(),
  })
}
