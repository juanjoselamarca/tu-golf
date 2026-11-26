import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { desajusteDeJugadoresDelSkins, useReleerSiCambianLosJugadoresDelSkins } from './useReleerSiCambianLosJugadoresDelSkins'

// Revisión Fable #898 (P1-1): el creador edita el Skins desde la página (quita a C, suma a D) con el scorer abierto en
// otra pestaña. La vista del scorer se relee sola y trae [A, B, D]; la ronda en pantalla sigue con [A, B, C].
const jug = (...ids: string[]) => ids.map(id => ({ id }))

describe('desajusteDeJugadoresDelSkins', () => {
  it('calzan (en cualquier orden de la ronda) o sin vista: null', () => {
    expect(desajusteDeJugadoresDelSkins({ jugadorIds: ['a', 'b', 'c'] }, jug('c', 'a', 'b'))).toBeNull()
    expect(desajusteDeJugadoresDelSkins(null, jug('a'))).toBeNull()
    expect(desajusteDeJugadoresDelSkins({ jugadorIds: ['a'] }, undefined)).toBeNull()
  })
  it('uno quitado y otro sumado, o uno de más: hay desajuste', () => {
    expect(desajusteDeJugadoresDelSkins({ jugadorIds: ['a', 'b', 'd'] }, jug('a', 'b', 'c'))).not.toBeNull()
    expect(desajusteDeJugadoresDelSkins({ jugadorIds: ['a', 'b'] }, jug('a', 'b', 'c'))).not.toBeNull()
  })
})

describe('useReleerSiCambianLosJugadoresDelSkins', () => {
  it('la vista trae la lista editada: relee la ronda una vez, y no en bucle si sigue igual', () => {
    const recargar = vi.fn()
    const { rerender } = renderHook(
      (p: { ids: string[]; jugadores: { id: string }[] }) =>
        useReleerSiCambianLosJugadoresDelSkins({ vista: { jugadorIds: p.ids }, jugadores: p.jugadores, recargar }),
      { initialProps: { ids: ['a', 'b', 'c'], jugadores: jug('a', 'b', 'c') } },
    )
    expect(recargar).not.toHaveBeenCalled()

    rerender({ ids: ['a', 'b', 'd'], jugadores: jug('a', 'b', 'c') })
    expect(recargar).toHaveBeenCalledTimes(1)
    // Otro render con el mismo desajuste (la relectura todavía no llega, u otra vista igual): no relee de nuevo.
    rerender({ ids: ['a', 'b', 'd'], jugadores: jug('a', 'b', 'c') })
    expect(recargar).toHaveBeenCalledTimes(1)
    // Llegó la ronda nueva: calzan, nada más que hacer.
    rerender({ ids: ['a', 'b', 'd'], jugadores: jug('a', 'b', 'd') })
    expect(recargar).toHaveBeenCalledTimes(1)
    // Una segunda edición (quitan a B): otro desajuste, otra relectura.
    rerender({ ids: ['a', 'd'], jugadores: jug('a', 'b', 'd') })
    expect(recargar).toHaveBeenCalledTimes(2)
  })
})
