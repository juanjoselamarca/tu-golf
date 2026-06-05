import { describe, it, expect } from 'vitest'
import { HOME } from './home'

/**
 * Guardia anti-voseo del copy del HOME.
 *
 * Regla dura (memoria `feedback_marketero_spin_positivo` + `project_home_mensaje_marketing`):
 * el copy es español latinoamericano NEUTRO. El voseo está PROHIBIDO. Este test bloquea
 * en CI cualquier forma vos que se cuele (imperativo `subí/mirá/elegí` o presente
 * `tenés/querés/podés`), que es donde Claude se ha colado históricamente.
 *
 * Se listan formas vos CON tilde para no chocar con sus equivalentes tú/neutro sin tilde
 * (ej. `registrás` [vos] se bloquea, `registras` [tú] pasa).
 */

// Formas vos a bloquear (palabra completa, case-insensitive, tolerante a acentos).
const VOSEO = [
  // pronombres / ser
  'vos', 'sos',
  // presente indicativo vos
  'tenés', 'querés', 'podés', 'sabés', 'hacés', 'decís', 'ponés', 'perdés', 'ganás',
  'marcás', 'sumás', 'registrás', 'importás', 'mejorás', 'bajás', 'jugás', 'necesitás',
  'buscás', 'encontrás', 'llevás', 'dejás', 'usás', 'mirás', 'andás', 'llegás', 'conocés',
  'elegís', 'sentís', 'seguís', 'salís', 'venís', 'vivís', 'subís', 'compartís', 'ajustás',
  'apretás', 'lanzás', 'anotás', 'creás', 'descubrís', 'empezás',
  // imperativo afirmativo vos
  'tené', 'hacé', 'poné', 'vení', 'mirá', 'fijate', 'andá', 'sumá', 'registrá', 'subí',
  'conectá', 'elegí', 'probá', 'descubrí', 'empezá', 'mejorá', 'ajustá', 'apretá', 'lanzá',
  'anotá', 'creá', 'compartí', 'bajá', 'sentí', 'viví', 'jugá', 'marcá', 'buscá', 'encontrá',
  'usá', 'dejá', 'llevá', 'mostrá', 'contá',
]

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
    const hits: string[] = []
    for (const word of VOSEO) {
      // boundary tolerante a acentos: el match no puede estar pegado a otra letra
      const re = new RegExp(`(^|[^\\p{L}])(${word})([^\\p{L}]|$)`, 'iu')
      const m = FULL_TEXT.match(re)
      if (m) {
        const idx = FULL_TEXT.toLowerCase().indexOf(m[2].toLowerCase())
        const snippet = FULL_TEXT.slice(Math.max(0, idx - 25), idx + word.length + 25).replace(/\n/g, ' ')
        hits.push(`"${m[2]}" → …${snippet}…`)
      }
    }
    expect(hits, `Voseo detectado en el copy del HOME:\n${hits.join('\n')}`).toEqual([])
  })

  it('tiene copy en todas las secciones principales', () => {
    expect(ALL_STRINGS.length).toBeGreaterThan(40)
    for (const key of ['hero', 'pga', 'game', 'coach', 'compete', 'features', 'plans', 'cta'] as const) {
      expect(collectStrings(HOME[key]).length, `sección "${key}" sin copy`).toBeGreaterThan(0)
    }
  })
})
