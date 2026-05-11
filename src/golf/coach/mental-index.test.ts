import { describe, it, expect } from 'vitest'
import {
  calcularMentalIndex,
  strokesEvitables,
  clasificarHoyo,
  type MentalIndexInput,
} from './mental-index'

describe('calcularMentalIndex', () => {
  it.todo('returns high score for clean profile')
  it.todo('penalizes post_bogey_spiral confidence 0.9 by at least 22 points')
  it.todo('skips adherence bonus when no active plan')
  it.todo('reports insufficient_data status when < 3 rounds')
})

describe('strokesEvitables', () => {
  it.todo('counts only bogey-followed-by-bogey, contained = bogey simple')
  it.todo('skips null scores')
})

describe('clasificarHoyo', () => {
  it.todo('returns null for null score')
  it.todo('returns tilt for double bogey or worse')
  it.todo('returns tilt for bogey after bogey')
  it.todo('returns tense for isolated bogey')
  it.todo('returns calm for par or better')
})
