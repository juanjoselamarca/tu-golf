// Mi Golf · Competencia: el saludo muestra el índice OFICIAL rotulado "Índice" (nunca "HCP",
// que es el hándicap de juego de una ronda) y, sin índice, el CTA para cargarlo.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CompetenciaTab } from '../CompetenciaTab'
import { indiceVisible } from '@/golf/core/indice-visible'
import { RUTA_EDITAR_INDICE } from '@/lib/rutas'

const base = {
  userName: 'Ana',
  activeRonda: null,
  activeRondaSummary: null,
  torneoInminente: null,
  playingInTournaments: [],
  organizingTournaments: [],
  recentFinishedTournaments: [],
  finishedRondas: [],
  mejoresDelMes: [],
  comunidad: null,
  fechaHoy: '2026-11-16',
}

describe('CompetenciaTab — índice del saludo', () => {
  it('con índice: "Índice 8.5", sin "HCP"', () => {
    const { container } = render(<CompetenciaTab {...base} indice={indiceVisible({ indice: 8.5 })} />)
    expect(container.textContent).toContain('Índice 8.5')
    expect(container.textContent).not.toMatch(/HCP/)
  })

  it('sin índice: CTA "Agrega tu índice" hacia el perfil', () => {
    const { getByRole } = render(<CompetenciaTab {...base} indice={indiceVisible({ indice: null })} />)
    expect(getByRole('link', { name: /Agrega tu índice/ }).getAttribute('href')).toBe(RUTA_EDITAR_INDICE)
  })
})
