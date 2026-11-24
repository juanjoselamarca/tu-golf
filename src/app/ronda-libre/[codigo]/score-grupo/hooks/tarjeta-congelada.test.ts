import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { tarjetaCongelada } from './tarjeta-congelada'

describe('tarjetaCongelada', () => {
  it('acepta golpes solo sin finalizar y sin un cambio de quién anota en vuelo', () => {
    expect(tarjetaCongelada({ finalizing: false, anotadorEnCurso: null })).toBe(false)
    expect(tarjetaCongelada({ finalizing: true, anotadorEnCurso: null })).toBe(true)
    // «Dejar este equipo» en vuelo: un +/− ahora quedaría pendiente y el servidor lo rechazaría (P0003) sin aviso.
    expect(tarjetaCongelada({ finalizing: false, anotadorEnCurso: 'e1' })).toBe(true)
  })

  it('el scorer de grupo pasa los golpes (jugador y equipo) por este predicado, con el enCurso del anotador', () => {
    const page = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf-8')
    expect(page).toMatch(/const congelada = tarjetaCongelada\(\{ finalizing, anotadorEnCurso: anotador\.enCurso \}\)/)
    expect(page).toMatch(/const anotar = \([^)]*\) => \{ if \(!congelada\)/)
    expect(page).toMatch(/const anotarEquipo = \([^)]*\) => \{ if \(!congelada\)/)
  })
})
