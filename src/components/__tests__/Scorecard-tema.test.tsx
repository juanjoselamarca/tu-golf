/**
 * Regresión (QA design 17-oct-2026): en modo oscuro el gross de cada hoyo era
 * invisible (1.0:1) porque Scorecard pasaba theme="light" a ScoreSymbol y el número
 * salía #1a1a2e fijo sobre la tarjeta navy. Ahora sigue el tema con var(--text).
 */
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Scorecard from '../Scorecard'
import ScoreSymbol from '../ScoreSymbol'

const holes9 = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))

describe('Scorecard: números de score siguen el tema', () => {
  it('ningún número de hoyo usa la tinta fija #1a1a2e', () => {
    const scores: Record<string, number> = { '1': 3, '2': 4, '3': 5, '4': 6, '5': 2 }
    const { container } = render(
      <Scorecard holes={holes9} scores={scores} courseHandicap={0} displayHandicap={0} modo="gross"
        formato="stroke_play" playerName="Test" courseName="Cancha" date="1 ene 2026" formatLabel="Stroke Play Gross" />,
    )
    const html = container.innerHTML
    expect(html).not.toMatch(/color:\s*(#1a1a2e|rgb\(26,\s*26,\s*46\))/i)
    expect(html).toMatch(/color:\s*var\(--text\)/)
  })

  it("ScoreSymbol theme='light' (superficie brand-locked) conserva la tinta fija", () => {
    const { container } = render(<ScoreSymbol score={4} par={4} theme="light" />)
    expect(container.innerHTML).toMatch(/color:\s*(#1a1a2e|rgb\(26,\s*26,\s*46\))/i)
  })
})
