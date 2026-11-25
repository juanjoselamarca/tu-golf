import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CONFIG_SKINS_POR_DEFECTO } from '@/golf/formats/skins'
import type { EstadoDelPermiso } from './usePermisoDeJuego'
import { AVISO_SKINS_CANCELADO, AVISO_SKINS_NO_DISPONIBLE, ESPERANDO_EL_SKINS, useRepetirRonda } from './useRepetirRonda'

const SKINS = { ...CONFIG_SKINS_POR_DEFECTO, pozoPorJugador: 5000 }

function montar(permiso: EstadoDelPermiso) {
  const acciones = { repetirBase: vi.fn(), ponerSkins: vi.fn(), soltarSkins: vi.fn() }
  const h = renderHook(({ p }) => useRepetirRonda({ permiso: p, ...acciones }), { initialProps: { p: permiso } })
  return { ...h, acciones }
}

describe('useRepetirRonda — repetir un Skins espera el permiso', () => {
  it('con permiso: repite con sus reglas', () => {
    const { result, acciones } = montar('si')
    act(() => result.current.repetir({ skins: SKINS }))
    expect(acciones.repetirBase).toHaveBeenCalledTimes(1)
    expect(acciones.ponerSkins).toHaveBeenCalledWith(SKINS)
    expect(result.current.aviso).toBeNull()
  })

  it('permiso cargando: no degrada en silencio; aplica el Skins cuando llega el «sí»', () => {
    const { result, acciones, rerender } = montar('cargando')
    act(() => result.current.repetir({ skins: SKINS }))
    expect(acciones.ponerSkins).not.toHaveBeenCalled()
    expect(result.current.esperandoPermiso).toBe(true)
    rerender({ p: 'si' })
    expect(acciones.ponerSkins).toHaveBeenCalledWith(SKINS)
    expect(result.current.esperandoPermiso).toBe(false)
    expect(result.current.aviso).toBeNull()
  })

  it('permiso cargando y llega «no» (o sin señal): queda sin Skins y lo avisa', () => {
    const { result, acciones, rerender } = montar('cargando')
    act(() => result.current.repetir({ skins: SKINS }))
    rerender({ p: 'no' })
    expect(acciones.ponerSkins).not.toHaveBeenCalled()
    expect(acciones.soltarSkins).toHaveBeenCalled()
    expect(result.current.aviso).toBe(AVISO_SKINS_NO_DISPONIBLE)
  })

  it('una ronda que no era Skins suelta el Skins y no avisa; repetir otra borra el aviso y lo pendiente', () => {
    const { result, acciones, rerender } = montar('no')
    act(() => result.current.repetir({ skins: SKINS }))
    expect(result.current.aviso).toBe(AVISO_SKINS_NO_DISPONIBLE)
    act(() => result.current.repetir({ skins: null }))
    expect(result.current.aviso).toBeNull()
    rerender({ p: 'cargando' })
    act(() => result.current.repetir({ skins: SKINS }))
    act(() => result.current.repetir({ skins: null }))
    rerender({ p: 'si' })
    expect(acciones.ponerSkins).not.toHaveBeenCalled()
  })

  it('esperando el permiso, «Crear» queda bloqueado; al llegar, se libera', () => {
    const { result, rerender } = montar('cargando')
    act(() => result.current.repetir({ skins: SKINS }))
    expect(result.current.bloqueoDeCrear).toEqual(ESPERANDO_EL_SKINS)
    rerender({ p: 'si' })
    expect(result.current.bloqueoDeCrear).toBeNull()
  })

  it('cambiar el formato o los equipos mientras espera (descartar) cancela el Skins pendiente', () => {
    const { result, acciones, rerender } = montar('cargando')
    act(() => result.current.repetir({ skins: SKINS }))
    act(() => result.current.descartar())
    expect(result.current.esperandoPermiso).toBe(false)
    expect(result.current.bloqueoDeCrear).toBeNull()
    rerender({ p: 'si' })
    expect(acciones.ponerSkins).not.toHaveBeenCalled()
  })

  it('el aviso «No pudimos activar…» se descarta (X o tocar el formato)', () => {
    const { result } = montar('no')
    act(() => result.current.repetir({ skins: SKINS }))
    expect(result.current.aviso).toBe(AVISO_SKINS_NO_DISPONIBLE)
    act(() => result.current.descartar())
    expect(result.current.aviso).toBeNull()
  })

  it('cancelar el Skins mientras se confirma no libera «Crear» en silencio: queda el aviso de que va sin Skins', () => {
    // Vuelta 3 Fable: la X «Descartar aviso» cancelaba el Skins y habilitaba «Crear» sin decir nada.
    const { result, acciones, rerender } = montar('cargando')
    act(() => result.current.repetir({ skins: SKINS }))
    act(() => result.current.cancelarSkins())
    expect(result.current.esperandoPermiso).toBe(false)
    expect(result.current.bloqueoDeCrear).toBeNull()
    expect(result.current.aviso).toBe(AVISO_SKINS_CANCELADO)
    // El «sí» que llega tarde no lo vuelve a poner, y el aviso sigue hasta que el usuario lo cierre.
    rerender({ p: 'si' })
    expect(acciones.ponerSkins).not.toHaveBeenCalled()
    expect(result.current.aviso).toBe(AVISO_SKINS_CANCELADO)
    act(() => result.current.descartar())
    expect(result.current.aviso).toBeNull()
    // Repetir otra ronda borra el aviso de la cancelada.
    act(() => result.current.cancelarSkins())
    act(() => result.current.repetir({ skins: null }))
    expect(result.current.aviso).toBeNull()
  })
})
