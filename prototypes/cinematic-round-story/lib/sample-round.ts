/**
 * Datos de ejemplo de UN hoyo de UNA ronda real ficticia. Cuando el
 * prototipo migre a la app principal, esta data viene de Supabase
 * (historical_rounds + plan_outcomes via /api/coach/plan-outcome wireado
 * en feat/cerebro-v2-outcomes-wiring-claude).
 *
 * Para la validación presencial con golfistas, este hoyo es par 4 — el
 * jugador hizo bogey después de un birdie en el hoyo anterior. El costo
 * psicológico subió y la curva mental cayó: ése es el storytelling.
 */

export interface HoleData {
  number: number
  par: 3 | 4 | 5
  yardsFromPlayerTee: number
  teeColor: 'rojo' | 'amarillo' | 'azul' | 'blanco' | 'negro'
  playerScore: number
  netScore: number
  fieldAverage: number // promedio del field para ese hoyo en el torneo
  rankOfHole: number // 1 = el más difícil, 18 = el más fácil
  totalHolesInRound: number
}

export interface MentalSnapshot {
  hole: number
  confidence: number // 0-100
  pressure: number // 0-100
  cost: number // 0-100 — costo psicológico arrastrado
}

export interface RoundStory {
  player: { name: string; handicap: number; index: number }
  course: { name: string; date: string }
  hole: HoleData
  narrative: string[] // líneas del coach, ordenadas (mostrar con stagger)
  mentalCurve: MentalSnapshot[] // últimos 5 hoyos hasta éste
}

export const SAMPLE_ROUND: RoundStory = {
  player: {
    name: 'Juan José Lamarca',
    handicap: 11.4,
    index: 11.2,
  },
  course: {
    name: 'Sport Francés — Recorrido Azul',
    date: '2026-05-18',
  },
  hole: {
    number: 7,
    par: 4,
    yardsFromPlayerTee: 348,
    teeColor: 'azul',
    playerScore: 5, // bogey
    netScore: 5,
    fieldAverage: 4.6,
    rankOfHole: 5,
    totalHolesInRound: 18,
  },
  narrative: [
    'Hoyo 7. Par 4 de 348 yardas desde tu tee azul.',
    'Score: bogey, 5 golpes. Un golpe arriba del promedio del field.',
    'Tu confianza venía alta desde el birdie del 6 — y la perdimos en el approach.',
    'Patrón detectado: después de un birdie, tu siguiente hoyo promedia +0.7 vs tu baseline.',
    'Plan asignado: 15 swings de mid-iron con foco en setup repetible esta semana.',
  ],
  mentalCurve: [
    { hole: 3, confidence: 68, pressure: 24, cost: 8 },
    { hole: 4, confidence: 72, pressure: 22, cost: 6 },
    { hole: 5, confidence: 70, pressure: 28, cost: 12 },
    { hole: 6, confidence: 88, pressure: 18, cost: 4 }, // birdie
    { hole: 7, confidence: 54, pressure: 42, cost: 22 }, // bogey
  ],
}
