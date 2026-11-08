import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Canario: las cabeceras de "Mis Torneos" (`/organizador`) van en Playfair Display, como pide
 *  DESIGN.md §4 para el h1 de página y el h2 de sección en rutas operativas. El 08-nov-2026 el h1
 *  salía en DM Sans 24 px y el h2 del estado vacío en DM Sans 18 px (medido en prod a 390 px). */
const SRC = readFileSync(join(process.cwd(), 'src/app/organizador/page.tsx'), 'utf8')
const cabecera = (tag: 'h1' | 'h2') => SRC.match(new RegExp(`<${tag}[^>]*>`, 'g')) ?? []

describe('canario: cabeceras de Mis Torneos en Playfair', () => {
  it('el h1 "Mis Torneos" usa --font-playfair y llega a 32 px en 390 px', () => {
    const [h1] = cabecera('h1')
    expect(h1).toBeDefined()
    expect(h1).toMatch(/fontFamily: 'var\(--font-playfair\)'/)
    expect(h1).toMatch(/min-\[390px\]:text-\[32px\]/)
  })

  it('el h2 del estado vacío usa --font-playfair a 20 px', () => {
    const [h2] = cabecera('h2')
    expect(h2).toBeDefined()
    expect(h2).toMatch(/fontFamily: 'var\(--font-playfair\)'/)
    expect(h2).toMatch(/text-xl/)
  })

  it('el botón "Crear torneo" de la cabecera no se aplasta cuando el h1 crece (shrink-0)', () => {
    const header = SRC.slice(SRC.indexOf('{/* Header */}'), SRC.indexOf('{/* Contenido */}'))
    expect(header).toMatch(/shrink-0/)
  })
})
