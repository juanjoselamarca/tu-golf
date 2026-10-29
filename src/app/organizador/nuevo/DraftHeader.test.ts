/**
 * Los avatares del header del borrador, medidos contra los tokens reales de
 * `globals.css` en los dos temas.
 *
 * Por qué existe: el avatar del dueño pintaba `--brand-dark` de fondo con el
 * `color: var(--bg)` del estilo base, y en oscuro `--bg` vale `#070d18`, el
 * mismo valor exacto que `--brand-dark`. La inicial quedaba a 1:1 y el avatar se
 * veía como un círculo negro vacío. Se descubrió grabando una pieza de RRSS (se
 * graba en oscuro), no en el código: nada medía este par.
 *
 * La inicial es texto de 12px bold, así que el piso es AA de texto normal
 * (4.5:1), no el 3:1 de texto grande.
 */
import { describe, it, expect } from 'vitest'
import { contrasteDeTokens, parse, token } from '@/__tests__/helpers/contraste-tema'
import { AVATAR_POR_ROL } from './DraftHeader'

/** `var(--token)` → `--token`. Un literal acá es el bug que este test previene. */
function nombreDeToken(valor: string): string {
  const m = valor.match(/^var\((--[a-z0-9-]+)\)$/i)
  if (!m) throw new Error(`El avatar usa un color literal en vez de un token: ${valor}`)
  return m[1]
}

describe.each(['light', 'dark'] as const)('avatares del borrador — tema %s', (tema) => {
  for (const [rol, par] of Object.entries(AVATAR_POR_ROL)) {
    it(`la inicial del avatar "${rol}" contrasta ≥ 4.5:1 con su círculo`, () => {
      const ratio = contrasteDeTokens(tema, nombreDeToken(par.color), nombreDeToken(par.background))
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

  }
  // No se mide el círculo contra el card: el avatar no es un control que haya
  // que identificar por su borde (WCAG 1.4.11 no lo pide cuando el contenido ya
  // contrasta), y el oro sobre blanco da 2.65:1 — el mismo par que usan todos
  // los botones de marca de la app. Exigirlo acá sería inventar un criterio que
  // la app entera no cumple y que no es el bug que este archivo cuida.
})

describe('medición sanity', () => {
  it('en oscuro --brand-dark y --bg son el MISMO color: el par viejo daba 1:1', () => {
    // Si algún día dejan de ser iguales, este test cae y hay que volver a leer
    // el comentario de AVATAR_POR_ROL: la trampa era exactamente esa igualdad.
    expect(parse(token('dark', '--brand-dark'))).toEqual(parse(token('dark', '--bg')))
    expect(contrasteDeTokens('dark', '--bg', '--brand-dark')).toBeCloseTo(1, 5)
  })

  it('el dueño no es del mismo color que un colaborador (se distinguen a la vista)', () => {
    expect(AVATAR_POR_ROL.owner.background).not.toBe(AVATAR_POR_ROL.otro.background)
  })
})
