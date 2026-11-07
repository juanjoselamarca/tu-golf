import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Canario: los componentes compartidos de `src/components` listados acá no bajan del piso
 *  tipográfico de DESIGN.md §4 (caption 12 px). Las etiquetas del Stepper de "Nueva Ronda"
 *  (Formato · Cancha · Jugadores · Confirmar) estaban a 10 px; la píldora "EN VIVO" del shell a
 *  10 px y el chip PRO a 10/11 px: el ancho se ajusta con el conector, el padding y el tracking,
 *  nunca achicando la letra (jurisprudencia P5).
 *  Lista explícita: al llevar otro componente al piso, se agrega acá. */
const BASE = join(process.cwd(), 'src/components')
const ARCHIVOS = ['ui/Stepper.tsx', 'ui/LiveBadge.tsx', 'billing/ProBadge.tsx']

const TAILWIND_CHICO = /text-\[(\d+(?:\.\d+)?)px\]/g
const INLINE_CHICO = /fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?/g
const CONST_CHICA = /FONT_SIZE_MIN\s*=\s*(\d+)/g

describe('canario: componentes compartidos ≥12 px', () => {
  it.each(ARCHIVOS)('%s', (rel) => {
    const src = readFileSync(join(BASE, rel), 'utf8')
    const chicos = [...src.matchAll(TAILWIND_CHICO), ...src.matchAll(INLINE_CHICO), ...src.matchAll(CONST_CHICA)]
      .map(m => Number(m[1])).filter(n => n < 12)
    expect(chicos, `texto < 12 px en ${rel}`).toEqual([])
  })

  it('el Stepper mantiene la etiqueta en una línea y el conector a la altura del disco', () => {
    const src = readFileSync(join(BASE, 'ui/Stepper.tsx'), 'utf8')
    // Sin nowrap, una etiqueta larga a 320 px parte en dos líneas y descuadra la fila.
    expect(src).toMatch(/text-xs uppercase[^']*whitespace-nowrap/)
    // flex-auto reparte el espacio libre entre conectores; con flex-1 quedaban de largos distintos (26/33/11 px).
    expect(src).toMatch(/flex items-start flex-auto last:flex-none/)
  })

  it('la píldora EN VIVO usa los tokens --status-live-* sobre --bg-surface y reserva 44 px de toque', () => {
    const src = readFileSync(join(BASE, 'ui/LiveBadge.tsx'), 'utf8')
    // text-emerald-500 sobre emerald-500/10 daba 2,21:1 en claro (medido en prod el 07-nov-2026).
    expect(src).not.toMatch(/className="[^"]*emerald-/)
    expect(src).toMatch(/color: 'var\(--status-live-fg\)'/)
    // El tinte va compuesto sobre la superficie: --status-live-fg sobre el tinte a pelo da 4,35:1 en claro.
    expect(src).toMatch(/linear-gradient\(var\(--status-live-bg\), var\(--status-live-bg\)\), var\(--bg-surface\)/)
    // Franja py-1.5 + píldora h-8 = 44 px; el área de toque del link cubre la franja entera.
    expect(src).toMatch(/py-1\.5/)
    expect(src).toMatch(/h-8[^"]*before:-inset-y-1\.5/)
  })

  it('el chip PRO no acepta un size bajo el piso', () => {
    const src = readFileSync(join(BASE, 'billing/ProBadge.tsx'), 'utf8')
    expect(src).toMatch(/Math\.max\(size, FONT_SIZE_MIN\)/)
  })
})
