import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Canario: los componentes compartidos de `src/components/ui` listados acá no bajan del piso
 *  tipográfico de DESIGN.md §4 (caption 12 px). Las etiquetas del Stepper de "Nueva Ronda"
 *  (Formato · Cancha · Jugadores · Confirmar) estaban a 10 px: el ancho se ajusta con el conector
 *  y el tracking, nunca achicando la letra (jurisprudencia P5).
 *  Lista explícita: al llevar otro componente al piso, se agrega acá. */
const BASE = join(process.cwd(), 'src/components/ui')
const ARCHIVOS = ['Stepper.tsx']

const TAILWIND_CHICO = /text-\[(\d+(?:\.\d+)?)px\]/g
const INLINE_CHICO = /fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?/g

describe('canario: componentes ui compartidos ≥12 px', () => {
  it.each(ARCHIVOS)('%s', (rel) => {
    const src = readFileSync(join(BASE, rel), 'utf8')
    const chicos = [...src.matchAll(TAILWIND_CHICO), ...src.matchAll(INLINE_CHICO)]
      .map(m => Number(m[1])).filter(n => n < 12)
    expect(chicos, `texto < 12 px en ${rel}`).toEqual([])
  })

  it('el Stepper mantiene la etiqueta en una línea y el conector a la altura del disco', () => {
    const src = readFileSync(join(BASE, 'Stepper.tsx'), 'utf8')
    // Sin nowrap, una etiqueta larga a 320 px parte en dos líneas y descuadra la fila.
    expect(src).toMatch(/text-xs uppercase[^']*whitespace-nowrap/)
    // flex-auto reparte el espacio libre entre conectores; con flex-1 quedaban de largos distintos (26/33/11 px).
    expect(src).toMatch(/flex items-start flex-auto last:flex-none/)
  })
})
