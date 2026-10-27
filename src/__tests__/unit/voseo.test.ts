// El detector de voseo es la fuente única que usan el canario del flujo de
// torneos y el validador de piezas de RRSS. Si su clase de letras se rompe,
// el canario pasa a cazar identificadores en camelCase ("AvisoSoloBruto" ->
// "soS") y nadie puede mergear. Estos casos lo fijan.
import { describe, it, expect } from 'vitest'
// @ts-expect-error — la lista canónica vive en un .mjs que comparten scripts y tests
import { VOSEO, buscarVoseo, patronVoseo } from '../../../scripts/lib/voseo.mjs'

describe('detector de voseo', () => {
  it('caza el voseo real, con y sin mayúscula', () => {
    expect(buscarVoseo('Copiá el link y después tenés que elegí el tee')).toEqual([
      'Copiá',
      'tenés',
      'elegí',
    ])
  })

  it('no caza palabras que contienen una forma de voseo', () => {
    // "AvisoSoloBruto" contiene "soS"; "casos" contiene "sos"; "describí" contiene "escribí".
    for (const texto of ['AvisoSoloBruto', 'casos', 'describí', 'presosa', 'versos']) {
      expect(buscarVoseo(texto), texto).toEqual([])
    }
  })

  it('deja pasar el imperativo chileno', () => {
    expect(buscarVoseo('Ingresa tu índice, elige el tee y anota la ronda')).toEqual([])
  })

  it('el patrón es nuevo en cada llamada (con /g el lastIndex es estado compartido)', () => {
    const a = patronVoseo('giu')
    a.exec('tenés tenés')
    expect(a.lastIndex).toBeGreaterThan(0)
    expect(patronVoseo('giu').lastIndex).toBe(0)
  })

  it('la lista no tiene duplicados ni entradas vacías', () => {
    expect(VOSEO.length).toBeGreaterThan(40) // no puede quedar en vacío
    expect(new Set(VOSEO).size).toBe(VOSEO.length)
    expect(VOSEO.every((v: string) => v.trim() === v && v.length > 2)).toBe(true)
  })
})
