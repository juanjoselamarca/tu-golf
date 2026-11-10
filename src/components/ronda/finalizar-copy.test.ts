import { describe, it, expect } from 'vitest'
import { textoConfirmarFinalizar, avisoTarjetasNoGuardadas } from './finalizar-copy'

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
