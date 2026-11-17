// Mi Golf: el Hero muestra el índice OFICIAL (profiles.indice vía indiceVisible) rotulado "Índice",
// un plus con "+" (−1.0 → "+1.0"), y sin índice ofrece cargarlo en vez de inventar un número.
// El Índice Golfers+ (y su "Calibración") vive solo en /perfil (decisión de Juanjo, 16-nov-2026).
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IdentidadTab } from '../IdentidadTab'
import { getNivel } from '@/lib/mi-golf/niveles'
import { indiceVisible } from '@/golf/core/indice-visible'
import { RUTA_EDITAR_INDICE } from '@/lib/rutas'

const base = {
  userName: 'Ana',
  totalRounds: 10,
  taigerSessionCount: 1,
  stats: { promedioUltimas5: null, mejorScore: null, rondasJugadas: 0, canchaFavorita: null },
  taigerLine: { source: 'fallback' as const, texto: 'x', cta_texto: 'y', cta_href: '/coach' },
}

describe('IdentidadTab — índice', () => {
  it('índice plus: el Hero dice "+1.0", nunca "-1.0", rotulado "Índice"', () => {
    const { container } = render(<IdentidadTab {...base} indice={indiceVisible({ indice: -1 })} nivel={getNivel(-1)} />)
    expect(container.textContent).toContain('+1.0')
    expect(container.textContent).not.toContain('-1.0')
    expect(container.textContent).toContain('Índice')
    expect(container.textContent).not.toContain('Índice Golfers+')
  })

  it('sin índice: sin número, con el CTA que lleva a cargarlo', () => {
    const { container, getByRole } = render(<IdentidadTab {...base} indice={indiceVisible({ indice: null })} nivel={null} />)
    expect(container.textContent).toContain('Agrega tu índice')
    expect(getByRole('link', { name: /Agrega tu índice/ }).getAttribute('href')).toBe(RUTA_EDITAR_INDICE)
    expect(container.textContent).not.toContain('Calibración del índice')
  })
})
