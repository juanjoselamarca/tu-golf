import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SaveStatusBadge } from './SaveStatusBadge'

describe('SaveStatusBadge', () => {
  it('error sin otro aviso: muestra "Error al guardar"', () => {
    render(<SaveStatusBadge saveStatus="error" />)
    expect(document.body.textContent).toContain('Error al guardar')
  })

  it('con el aviso de sesión cerrada en pantalla (oculto): no pinta "Error al guardar"', () => {
    render(<SaveStatusBadge saveStatus="error" oculto />)
    expect(document.body.textContent).not.toContain('Error al guardar')
  })
})
