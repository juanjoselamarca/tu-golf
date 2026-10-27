import { describe, it, expect } from 'vitest'
import { HOME } from './home'
// Lista canónica de voseo: `scripts/lib/voseo.mjs`. Acá vivía una segunda lista
// inline que cazaba formas que la canónica dejaba pasar (y al revés). Si falta
// una forma se agrega ALLÁ y la ganan los cuatro detectores a la vez.
import { buscarVoseo } from '../../scripts/lib/voseo.mjs'

/**
 * Guardia anti-voseo del copy del HOME.
 *
 * Regla dura (memoria `feedback_copy_sin_voseo` + `project_home_mensaje_marketing`):
 * el copy va en español de Chile (tú). El voseo está PROHIBIDO. Este test bloquea
 * en CI cualquier forma vos que se cuele (imperativo `subí/mirá/elegí` o presente
 * `tenés/querés/podés`), que es donde Claude se ha colado históricamente.
 */

/** Recolecta recursivamente todos los strings de un objeto. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach(v => collectStrings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collectStrings(v, out))
  return out
}

const ALL_STRINGS = collectStrings(HOME)
const FULL_TEXT = ALL_STRINGS.join('\n')

describe('HOME copy — anti-voseo', () => {
  it('no contiene ninguna forma de voseo', () => {
    const hits = [...new Set(buscarVoseo(FULL_TEXT))].map((forma: string) => {
      const idx = FULL_TEXT.toLowerCase().indexOf(forma.toLowerCase())
      const snippet = FULL_TEXT.slice(Math.max(0, idx - 25), idx + forma.length + 25).replace(/\n/g, ' ')
      return `"${forma}" → …${snippet}…`
    })
    expect(hits, `Voseo detectado en el copy del HOME:\n${hits.join('\n')}`).toEqual([])
  })

  it('tiene copy en todas las secciones principales', () => {
    expect(ALL_STRINGS.length).toBeGreaterThan(40)
    for (const key of ['hero', 'pga', 'game', 'coach', 'compete', 'features', 'plans', 'cta'] as const) {
      expect(collectStrings(HOME[key]).length, `sección "${key}" sin copy`).toBeGreaterThan(0)
    }
  })
})
