import { describe, it, expect } from 'vitest'
import { textoConfirmarFinalizar, avisoTarjetasNoGuardadas, detalleHoyosSinAnotarTimba, hojaFinalizarTimba, TEXTO_TARJETA_COMPLETA, TEXTO_TARJETA_COMPLETA_EQUIPO, hojaTerminarEquipo, avisoEquipoIncompletoAlTerminar, textoFaltaQueTerminen } from './finalizar-copy'

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

describe('tarjeta completa y «Terminar mi equipo»', () => {
  it('quien cierra: la invitación a finalizar; un celular por equipo: a terminar el equipo', () => {
    expect(TEXTO_TARJETA_COMPLETA).toBe('Tarjeta completa · Finalizar ronda')
    expect(TEXTO_TARJETA_COMPLETA_EQUIPO).toBe('Tarjeta completa · Terminar mi equipo')
  })
  it('la hoja de terminar (copy de Juanjo 27-nov)', () => {
    expect(hojaTerminarEquipo(0)).toEqual({
      titulo: '¿Terminar tu equipo?',
      detalle: 'Tu tarjeta queda cerrada y pasas al leaderboard. La ronda se cierra sola cuando termine el último equipo.',
      textoConfirmar: 'Terminar mi equipo',
    })
  })
  it('con hoyos sin anotar, la hoja dice que quedan con par (singular y plural)', () => {
    expect(hojaTerminarEquipo(1).detalle).toMatch(/^El hoyo sin anotar queda con par\. Tu tarjeta/)
    expect(hojaTerminarEquipo(3).detalle).toMatch(/^Los 3 hoyos sin anotar quedan con par\. Tu tarjeta/)
  })
  it('equipo incompleto: nombra el equipo y el hoyo, y dice qué hacer', () => {
    expect(avisoEquipoIncompletoAlTerminar('Los Pumas', 7)).toBe('Los Pumas no tiene golpes en el hoyo 7. Anótalo y vuelve a tocar Terminar mi equipo.')
    expect(avisoEquipoIncompletoAlTerminar('Los Pumas', null)).toBe('A Los Pumas le faltan hoyos. Anótalos y vuelve a tocar Terminar mi equipo.')
  })
})

describe('textoFaltaQueTerminen (vista en vivo, un celular por equipo)', () => {
  it('uno: singular, con el nombre entre comillas', () => {
    expect(textoFaltaQueTerminen(['Los Tigres'])).toBe('Falta que termine: «Los Tigres»')
  })
  it('varios: plural, separados por coma', () => {
    expect(textoFaltaQueTerminen(['Los Tigres', 'Equipo 3'])).toBe('Falta que terminen: «Los Tigres», «Equipo 3»')
  })
  it('ninguno: nada', () => {
    expect(textoFaltaQueTerminen([])).toBeNull()
  })
})
