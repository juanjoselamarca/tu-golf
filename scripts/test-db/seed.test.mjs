import { describe, it, expect } from 'vitest'
import { verificarSinDatosPersonales } from './seed.mjs'

const REAL = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'

describe('seed: ningún dato personal de usuarios reales llega a la base de pruebas', () => {
  const ids = new Set([REAL])

  it('acepta filas sin ids reales y con emails del dominio de pruebas', () => {
    expect(() => verificarSinDatosPersonales('t', { id: crypto.randomUUID(), email: 'e2e-test@golfersplus-test.local' }, ids)).not.toThrow()
  })

  it('aborta con el id de un usuario real en cualquier parte de la fila (también dentro de un jsonb)', () => {
    expect(() => verificarSinDatosPersonales('t', { organizer_id: REAL }, ids)).toThrow(/usuario real/)
    expect(() => verificarSinDatosPersonales('t', { config: { creado_por: REAL.toUpperCase() } }, ids)).toThrow(/usuario real/)
  })

  it('aborta con un email fuera de @golfersplus-test.local, aunque esté anidado', () => {
    expect(() => verificarSinDatosPersonales('t', { email: 'alguien@gmail.com' }, ids)).toThrow(/email fuera/)
    expect(() => verificarSinDatosPersonales('t', { meta: { contacto: 'x Juan.Perez@club.cl y' } }, ids)).toThrow(/email fuera/)
  })
})
