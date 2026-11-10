// Perfil: las dos tarjetas de índice muestran los plus con "+" y, sin Índice Golfers+, explican qué es
// una ronda "válida" sin puntos de progreso que nunca se llenaban.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DualIndexCards } from '../DualIndexCards'
import type { Profile } from '@/lib/data/perfil'
import { MIN_DIFERENCIALES_INDICE } from '@/golf/core/whs-index'

function renderCards(p: Partial<Profile>) {
  const profile = { indice: null, indice_golfers: null, indice_golfers_updated_at: null, ...p } as Profile
  return render(
    <DualIndexCards
      profile={profile}
      fedegolf={{ refreshing: false, msg: null, refresh: () => {} }}
      vinculado={false}
      requiereReconexion={false}
      sinIndiceVigente={false}
      onOpenVincular={() => {}}
      onOpenBreakdown={() => {}}
      onOpenOficial={() => {}}
    />,
  )
}

describe('DualIndexCards', () => {
  it('los dos índices plus llevan "+"', () => {
    const { container } = renderCards({ indice: -2.3, indice_golfers: -1 })
    expect(container.textContent).toContain('+2.3')
    expect(container.textContent).toContain('+1.0')
    expect(container.textContent).not.toMatch(/-\d/)
  })

  it('sin Índice Golfers+: dice cuántas rondas válidas y qué las hace válidas', () => {
    const { container } = renderCards({ indice: 14 })
    expect(container.textContent).toContain(`Juega ${MIN_DIFERENCIALES_INDICE} rondas válidas (canchas con slope y rating) para activar tu índice`)
  })
})
