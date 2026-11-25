import { describe, it, expect, vi } from 'vitest'
import { accionesDeLaTarjeta, tarjetaCongelada } from './tarjeta-congelada'

describe('tarjetaCongelada', () => {
  it('acepta golpes solo sin finalizar y sin un cambio de quién anota en vuelo', () => {
    expect(tarjetaCongelada({ finalizing: false, discarding: false, anotadorEnCurso: null })).toBe(false)
    expect(tarjetaCongelada({ finalizing: true, discarding: false, anotadorEnCurso: null })).toBe(true)
    // «Descartando…» (revisión P2-a, 24-nov): la ronda se está borrando, Finalizar no se ofrece ni se anotan golpes.
    expect(tarjetaCongelada({ finalizing: false, discarding: true, anotadorEnCurso: null })).toBe(true)
    // «Dejar este equipo» en vuelo: un +/− ahora quedaría pendiente y el servidor lo rechazaría (P0003) sin aviso.
    expect(tarjetaCongelada({ finalizing: false, discarding: false, anotadorEnCurso: 'e1' })).toBe(true)
  })
})

describe('accionesDeLaTarjeta', () => {
  const montar = (congelada: boolean) => {
    const espias = {
      marcarInteraccion: vi.fn(),
      anotarJugador: vi.fn(),
      anotarEquipo: vi.fn(),
      pasarAlSiguienteHoyo: vi.fn(async () => {}),
      confirmarHoyo: vi.fn(async () => {}),
    }
    return { espias, acciones: accionesDeLaTarjeta({ congelada, ...espias }) }
  }

  it('con la tarjeta congelada (Dejar este equipo en vuelo) ni golpes ni «Siguiente»: no hay par del relleno pendiente', async () => {
    const { espias, acciones } = montar(tarjetaCongelada({ finalizing: false, discarding: false, anotadorEnCurso: 'e1' }))
    acciones.anotar('j1', 1)
    acciones.anotarEquipo('e1', -1)
    await acciones.siguiente()
    expect(espias.anotarJugador).not.toHaveBeenCalled()
    expect(espias.anotarEquipo).not.toHaveBeenCalled()
    expect(espias.pasarAlSiguienteHoyo).not.toHaveBeenCalled()
    expect(espias.marcarInteraccion).not.toHaveBeenCalled()
  })

  it('finalizando, «Siguiente» tampoco rellena ni avanza', async () => {
    const { espias, acciones } = montar(tarjetaCongelada({ finalizing: true, discarding: false, anotadorEnCurso: null }))
    await acciones.siguiente()
    expect(espias.pasarAlSiguienteHoyo).not.toHaveBeenCalled()
  })

  it('sin congelar: anota (marcando la interacción) y «Siguiente» rellena y avanza', async () => {
    const { espias, acciones } = montar(false)
    acciones.anotar('j1', 1)
    acciones.anotarEquipo('e1', -1)
    await acciones.siguiente()
    expect(espias.anotarJugador).toHaveBeenCalledWith('j1', 1)
    expect(espias.anotarEquipo).toHaveBeenCalledWith('e1', -1)
    expect(espias.marcarInteraccion).toHaveBeenCalledTimes(2)
    expect(espias.pasarAlSiguienteHoyo).toHaveBeenCalledTimes(1)
  })

  it('«Guardar hoyo N»: congelada no guarda; sin congelar guarda y marca la interacción', async () => {
    const congelada = montar(true)
    await congelada.acciones.guardarHoyo()
    expect(congelada.espias.confirmarHoyo).not.toHaveBeenCalled()
    const libre = montar(false)
    await libre.acciones.guardarHoyo()
    expect(libre.espias.confirmarHoyo).toHaveBeenCalledTimes(1)
    expect(libre.espias.marcarInteraccion).toHaveBeenCalledTimes(1)
  })
})
