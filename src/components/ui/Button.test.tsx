// @vitest-environment jsdom
// Cargando no es deshabilitado: el botón ocupado conserva su contraste (al 50 % el texto bajaba a ~2.3:1).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Button } from './Button'
import { buttonClassName } from './button-classes'

afterEach(cleanup)

describe('Button · cargando vs deshabilitado', () => {
  it('cargando: no se puede tocar, avisa que está ocupado y NO se atenúa', () => {
    render(<Button loading>Inscribiendo…</Button>)
    const b = screen.getByRole('button')
    expect(b).toHaveProperty('disabled', true)
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect(b.className).not.toMatch(/opacity-50/)
  })

  it('deshabilitado de verdad: se atenúa', () => {
    render(<Button disabled>Inscribirme</Button>)
    expect(screen.getByRole('button').className).toMatch(/disabled:opacity-50/)
  })
})

describe('buttonClassName', () => {
  it('un Link con buttonClassName lleva las mismas clases que el Button de esa variante y tamaño', () => {
    render(<Button variant="nav" size="lg" fullWidth>Iniciar sesión</Button>)
    const clases = screen.getByRole('button').className.split(/\s+/)
    for (const c of buttonClassName({ variant: 'nav', size: 'lg', fullWidth: true }).split(/\s+/).filter(Boolean)) {
      expect(clases).toContain(c)
    }
  })
})
