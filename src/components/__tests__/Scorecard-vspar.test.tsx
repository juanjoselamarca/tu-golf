/**
 * Regression test: scorecard vs-par differential must only count
 * the par of PLAYED holes, not all holes in the half.
 *
 * Bug: 9h round with 3 holes played (all par 4, all scored 4) showed
 * "12 -24" instead of "12 E". The sumT function summed par for all 9
 * holes (36) but gross only for played holes (12), giving 12-36 = -24.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Scorecard from '../Scorecard'

describe('Scorecard vs-par with partial round', () => {
  const holes9 = Array.from({ length: 9 }, (_, i) => ({
    numero: i + 1,
    par: [4, 4, 4, 3, 5, 4, 3, 5, 4][i],
    stroke_index: i + 1,
  }))

  it('shows E (not -24) when 3 of 9 par-4 holes played at par', () => {
    // Only holes 1-3 have scores (all par)
    const scores: Record<string, number> = { '1': 4, '2': 4, '3': 4 }

    render(
      <Scorecard
        holes={holes9}
        scores={scores}
        courseHandicap={0}
        displayHandicap={0}
        modo="gross"
        formato="stroke_play"
        playerName="Test Player"
        courseName="Test Course"
        date="1 ene 2026"
        formatLabel="Stroke Play Gross"
      />,
    )

    // The vs-par annotation should show "E" (even), not "-24"
    const allText = document.body.textContent ?? ''
    expect(allText).toContain('E')
    expect(allText).not.toContain('-24')
  })

  it('shows +2 when 3 holes played with 2 over par total', () => {
    // Holes 1-3: par 4,4,4 → scored 5,5,4 = 14 gross, 12 par played = +2
    const scores: Record<string, number> = { '1': 5, '2': 5, '3': 4 }

    render(
      <Scorecard
        holes={holes9}
        scores={scores}
        courseHandicap={0}
        displayHandicap={0}
        modo="gross"
        formato="stroke_play"
        playerName="Test Player"
        courseName="Test Course"
        date="1 ene 2026"
        formatLabel="Stroke Play Gross"
      />,
    )

    const allText = document.body.textContent ?? ''
    expect(allText).toContain('+2')
    // Should NOT show -22 (14 - 36)
    expect(allText).not.toContain('-22')
  })

  it('shows correct vs-par when ALL 9 holes are played', () => {
    // All 9 holes played at par → E
    const scores: Record<string, number> = {
      '1': 4, '2': 4, '3': 4, '4': 3, '5': 5, '6': 4, '7': 3, '8': 5, '9': 4,
    }

    render(
      <Scorecard
        holes={holes9}
        scores={scores}
        courseHandicap={0}
        displayHandicap={0}
        modo="gross"
        formato="stroke_play"
        playerName="Test Player"
        courseName="Test Course"
        date="1 ene 2026"
        formatLabel="Stroke Play Gross"
      />,
    )

    const allText = document.body.textContent ?? ''
    // Gross = 36, Par = 36 → E
    expect(allText).toContain('E')
  })
})
