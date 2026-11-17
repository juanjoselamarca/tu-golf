import { describe, it, expect } from 'vitest'
import { textoConfirmarFinalizar, avisoTarjetasNoGuardadas, detalleHoyosSinAnotarTimba, hojaFinalizarTimba } from './finalizar-copy'

describe('textoConfirmarFinalizar', () => {
  it('avisa los hoyos que se marcan como par', () => {
    expect(textoConfirmarFinalizar(1)).toBe('¿Marcar 1 hoyo como par y finalizar?')
    expect(textoConfirmarFinalizar(3)).toBe('¿Marcar 3 hoyos como par y finalizar?')
  })
  it('si no falta ningún hoyo pregunta y nada más', () => {
    expect(textoConfirmarFinalizar(0)).toBe('¿Finalizar ronda?')
  })
})

describe('avisoTarjetasNoGuardadas (copy de Juanjo, 10-nov-2026)', () => {
  const texto = (n: string[]) => { const a = avisoTarjetasNoGuardadas(n); return `${a.title} ${a.message}` }
  it('una tarjeta: nombra al jugador', () => {
    expect(texto(['Beto'])).toBe('No pudimos guardar la tarjeta de Beto. Revisa sus golpes y vuelve a finalizar.')
  })
  it('dos: "las tarjetas de A y B"', () => {
    expect(texto(['Beto', 'Ana'])).toBe('No pudimos guardar las tarjetas de Beto y Ana. Revisa sus golpes y vuelve a finalizar.')
  })
  it('tres o más: comas y la última con "y"', () => {
    expect(avisoTarjetasNoGuardadas(['Beto', 'Ana', 'Caro']).title).toBe('No pudimos guardar las tarjetas de Beto, Ana y Caro.')
  })
})

// Decisión de Juanjo (17-nov): un hoyo que nadie jugó no reparte puntos; uno que algunos anotaron lo pierde quien no anotó.
describe('detalleHoyosSinAnotarTimba', () => {
  it('sin hoyos no hay líneas', () => {
    expect(detalleHoyosSinAnotarTimba([], [])).toEqual([])
  })
  it('nadie los jugó: no reparten puntos (rango y singular)', () => {
    expect(detalleHoyosSinAnotarTimba([14, 15, 16, 17, 18], [14, 15, 16, 17, 18])).toEqual(['Hoyos 14–18 sin jugar: no reparten puntos.'])
    expect(detalleHoyosSinAnotarTimba([18], [18])).toEqual(['Hoyo 18 sin jugar: no reparte puntos.'])
  })
  it('algunos los anotaron: quien no anotó los pierde (rango y singular)', () => {
    expect(detalleHoyosSinAnotarTimba([14, 15, 16, 17, 18], [])).toEqual(['Quien no anotó los hoyos 14–18 los pierde.'])
    expect(detalleHoyosSinAnotarTimba([7], [])).toEqual(['Quien no anotó el hoyo 7 lo pierde.'])
  })
  it('los dos casos juntos, y saliendo del 10 el rango sigue el orden de juego', () => {
    expect(detalleHoyosSinAnotarTimba([3, 5, 6], [5, 6])).toEqual(['Hoyos 5–6 sin jugar: no reparten puntos.', 'Quien no anotó el hoyo 3 lo pierde.'])
    expect(detalleHoyosSinAnotarTimba([17, 18, 1, 2], [17, 18, 1, 2])).toEqual(['Hoyos 17–18 y 1–2 sin jugar: no reparten puntos.'])
  })
})

describe('hojaFinalizarTimba (no habla de "marcar como par": en la Timba casi todo lo vacío es no jugado)', () => {
  it('sin nada pendiente: solo la pregunta', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [], hoyosQueNadieJugo: [], parEnPantalla: null })).toEqual({ titulo: '¿Finalizar la Timba?', detalle: undefined })
  })
  it('hoyos no jugados sin par en pantalla (nadie anotó el hoyo en pantalla)', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [10, 11], hoyosQueNadieJugo: [10, 11], parEnPantalla: null })).toEqual({
      titulo: '¿Finalizar la Timba?',
      detalle: 'Hoyos 10–11 sin jugar: no reparten puntos.',
    })
  })
  it('un jugador queda con par en el hoyo en pantalla (singular)', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [], hoyosQueNadieJugo: [], parEnPantalla: { hoyo: 18, nombres: ['Beto'] } }).detalle)
      .toBe('En el hoyo 18, Beto queda con par.')
  })
  it('varios jugadores con par (plural) junto a la línea de no jugados', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [11], hoyosQueNadieJugo: [], parEnPantalla: { hoyo: 18, nombres: ['Beto', 'Caro', 'Dani'] } }).detalle)
      .toBe('Quien no anotó el hoyo 11 lo pierde. En el hoyo 18, Beto, Caro y Dani quedan con par.')
  })
  it('par en pantalla sin nombres: sin línea', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [], hoyosQueNadieJugo: [], parEnPantalla: { hoyo: 18, nombres: [] } }).detalle).toBeUndefined()
  })
})
