import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiGolfTabs } from './MiGolfTabs'

describe('MiGolfTabs', () => {
  it('arranca mostrando Competencia por default', () => {
    render(
      <MiGolfTabs
        competencia={<div>CONTENIDO_COMPETENCIA</div>}
        identidad={<div>CONTENIDO_IDENTIDAD</div>}
      />
    )
    const competencia = screen.getByText('CONTENIDO_COMPETENCIA')
    const identidad = screen.getByText('CONTENIDO_IDENTIDAD')
    expect(competencia).toBeTruthy()
    expect(identidad.closest('[aria-hidden="true"]')).toBeTruthy()
  })

  it('conmuta a Identidad al hacer click', () => {
    render(
      <MiGolfTabs
        competencia={<div>CONTENIDO_COMPETENCIA</div>}
        identidad={<div>CONTENIDO_IDENTIDAD</div>}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: /identidad/i }))
    const identidad = screen.getByText('CONTENIDO_IDENTIDAD')
    expect(identidad.closest('[aria-hidden="false"]')).toBeTruthy()
  })

  it('renderiza badge dot cuando hasIdentidadBadge es true', () => {
    render(
      <MiGolfTabs
        competencia={<div>C</div>}
        identidad={<div>I</div>}
        hasIdentidadBadge
      />
    )
    expect(screen.getByTestId('identidad-badge')).toBeTruthy()
  })
})
