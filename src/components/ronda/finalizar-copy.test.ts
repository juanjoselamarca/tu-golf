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

describe('detalleHoyosSinAnotarTimba', () => {
  it('sin hoyos no hay línea', () => {
    expect(detalleHoyosSinAnotarTimba([])).toBeUndefined()
  })
  it('un hoyo: singular', () => {
    expect(detalleHoyosSinAnotarTimba([17])).toBe('Hoyo 17 sin anotar: cuenta como no jugado y quien no anotó lo pierde.')
  })
  it('varios: la lista real con "y"', () => {
    expect(detalleHoyosSinAnotarTimba([15, 16, 17])).toBe('Hoyos 15, 16 y 17 sin anotar: cuentan como no jugados y quien no anotó los pierde.')
  })
})

describe('hojaFinalizarTimba (no habla de "marcar como par": en la Timba casi todo lo vacío es no jugado)', () => {
  it('sin nada pendiente: solo la pregunta', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [], parEnPantalla: null })).toEqual({ titulo: '¿Finalizar la Timba?', detalle: undefined })
  })
  it('hoyos no jugados sin par en pantalla (nadie anotó el hoyo en pantalla)', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [10, 11], parEnPantalla: null })).toEqual({
      titulo: '¿Finalizar la Timba?',
      detalle: 'Hoyos 10 y 11 sin anotar: cuentan como no jugados y quien no anotó los pierde.',
    })
  })
  it('un jugador queda con par en el hoyo en pantalla (singular)', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [], parEnPantalla: { hoyo: 18, nombres: ['Beto'] } }).detalle)
      .toBe('En el hoyo 18, Beto queda con par.')
  })
  it('varios jugadores con par (plural) junto a la línea de no jugados', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [11], parEnPantalla: { hoyo: 18, nombres: ['Beto', 'Caro', 'Dani'] } }).detalle)
      .toBe('Hoyo 11 sin anotar: cuenta como no jugado y quien no anotó lo pierde. En el hoyo 18, Beto, Caro y Dani quedan con par.')
  })
  it('par en pantalla sin nombres: sin línea', () => {
    expect(hojaFinalizarTimba({ hoyosSinJugar: [], parEnPantalla: { hoyo: 18, nombres: [] } }).detalle).toBeUndefined()
  })
})
