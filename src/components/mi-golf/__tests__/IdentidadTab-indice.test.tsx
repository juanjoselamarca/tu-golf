// Mi Golf: el Hero muestra un índice plus con "+" (−1.0 → "+1.0") y la barra "Calibración del índice"
// cuenta las rondas válidas contra el mínimo de la tabla WHS, no contra un 3 escrito a mano.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IdentidadTab } from '../IdentidadTab'
import { getNivel } from '@/lib/mi-golf/niveles'
import { MIN_DIFERENCIALES_INDICE } from '@/golf/core/whs-index'

const base = {
  userName: 'Ana',
  totalRounds: 10,
  taigerSessionCount: 1,
  stats: { promedioUltimas5: null, mejorScore: null, rondasJugadas: 0, canchaFavorita: null },
  taigerLine: { source: 'fallback' as const, texto: 'x', cta_texto: 'y', cta_href: '/coach' },
  ultimasGross: [],
}

describe('IdentidadTab — índice', () => {
  it('índice plus: el Hero dice "+1.0", nunca "-1.0"', () => {
    const { container } = render(<IdentidadTab {...base} indiceGolfers={-1} nivel={getNivel(-1)} rondasValidasIndice={8} />)
    expect(container.textContent).toContain('+1.0')
    expect(container.textContent).not.toContain('-1.0')
  })

  it('con menos rondas válidas que el mínimo, la barra va de 0 al mínimo WHS', () => {
    const { container } = render(<IdentidadTab {...base} indiceGolfers={null} nivel={null} rondasValidasIndice={1} />)
    expect(container.textContent).toContain('Calibración del índice')
    expect(container.textContent).toContain(`${Math.round(100 / MIN_DIFERENCIALES_INDICE)}%`)
  })

  it('sin el conteo (la base no respondió) no inventa una barra', () => {
    const { container } = render(<IdentidadTab {...base} indiceGolfers={null} nivel={null} rondasValidasIndice={null} />)
    expect(container.textContent).not.toContain('Calibración del índice')
  })
})
