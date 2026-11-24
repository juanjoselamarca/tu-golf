import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Canario: cabeceras de "Mis Torneos" (`/organizador`) según DESIGN.md §4 (reescrito el 16-nov-2026):
 *  Playfair SOLO en el h1 de página (28 / 600, el techo de la escala), y el h2 del estado vacío en DM Sans
 *  18 / 600. El 08-nov se pidió lo contrario (h2 en Playfair, h1 a 32 px); el 24-nov seguía así en prod. */
const SRC = readFileSync(join(process.cwd(), 'src/app/organizador/page.tsx'), 'utf8')
const cabecera = (tag: 'h1' | 'h2') => SRC.match(new RegExp(`<${tag}[^>]*>`, 'g')) ?? []

describe('canario: cabeceras de Mis Torneos (DESIGN.md §4)', () => {
  it('el h1 "Mis Torneos" usa --font-playfair y no pasa de 28 px / 600', () => {
    const [h1] = cabecera('h1')
    expect(h1).toBeDefined()
    expect(h1).toMatch(/fontFamily: 'var\(--font-playfair\)'/)
    expect(h1).toMatch(/min-\[360px\]:text-\[28px\]/)
    expect(h1).not.toMatch(/text-\[3\d+px\]|font-bold/)
    expect(h1).toMatch(/font-semibold/)
  })

  it('el h2 del estado vacío va en DM Sans 18 / 600, no en Playfair', () => {
    const [h2] = cabecera('h2')
    expect(h2).toBeDefined()
    expect(h2).not.toMatch(/playfair/)
    expect(h2).toMatch(/text-lg/)
    expect(h2).toMatch(/font-semibold/)
  })

  it('nada en mayúsculas espaciadas ni bajo 13 px (text-xs = 12 px)', () => {
    expect(SRC).not.toMatch(/uppercase|tracking-wider|text-xs|text-\[(9|10|11|12|15)px\]/)
  })

  it('el botón "Crear torneo" de la cabecera no se aplasta cuando el h1 crece (shrink-0)', () => {
    const header = SRC.slice(SRC.indexOf('{/* Header */}'), SRC.indexOf('{/* Contenido */}'))
    expect(header).toMatch(/shrink-0/)
  })
})
