import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AvisoSesionCerradaBanner } from './AvisoSesionCerradaBanner'
import { avisoSesionCerrada } from '@/lib/auth/aviso-sesion-cerrada'
import { loginUrl } from '@/lib/auth/login-url'

describe('AvisoSesionCerradaBanner', () => {
  it('sin aviso no pinta nada', () => {
    const { container } = render(<AvisoSesionCerradaBanner aviso={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('aviso fijo (alert) con "Iniciar sesión" de 44px que vuelve a la tarjeta', () => {
    render(<AvisoSesionCerradaBanner aviso={avisoSesionCerrada('/ronda-libre/ABC123/score?j=p1')} />)
    expect(screen.getByRole('alert').textContent).toContain('Tu sesión se cerró.')
    expect(screen.getByRole('alert').textContent).toContain('Tus golpes quedaron en este teléfono')
    const cta = screen.getByRole('link', { name: /Iniciar sesión/ })
    expect(cta.getAttribute('href')).toBe(loginUrl('/ronda-libre/ABC123/score?j=p1'))
    expect(cta.style.minHeight).toBe('44px')
  })
})
