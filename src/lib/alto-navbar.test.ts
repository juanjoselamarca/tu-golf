import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALTO_NAVBAR_PX } from './constants'

// Navbar.tsx es archivo protegido y no importa la constante: este test ata el espejo a la altura real,
// para que un cambio allá no deje tapados los encabezados fijos de la Timba en vivo y de /en-vivo.
describe('ALTO_NAVBAR_PX', () => {
  it('coincide con la altura del <nav> sticky del Navbar', () => {
    const fuente = readFileSync(join(process.cwd(), 'src/components/Navbar.tsx'), 'utf8')
    const nav = fuente.slice(fuente.indexOf("position: 'sticky', top: 0"))
    expect(nav.slice(0, 400)).toContain(`height: '${ALTO_NAVBAR_PX}px'`)
  })
})
