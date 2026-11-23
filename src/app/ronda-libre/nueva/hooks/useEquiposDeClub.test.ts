// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { MAX_EQUIPOS_DE_CLUB } from '@/golf/ronda-libre/equipos-de-club'
import { NOMBRE_EQUIPO_MAX } from '@/golf/ronda-libre/nombre-de-equipo'
import { validarNuevaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import {
  equiposDeClubParaEnviar,
  handicapDeClubDesdeTexto,
  textoDeHandicapDeClub,
  useEquiposDeClub,
} from './useEquiposDeClub'

interface Props { formato: FormatoJuego; modo: ModoJuego; netoBloqueado: boolean }

/** El modo vive en un estado de verdad (como en el formulario): lo que el hook pide con `onModo` se ve en `modo`. */
const montar = (over: Partial<Props> = {}) => {
  const onModo = vi.fn()
  const props: Props = { formato: 'scramble', modo: 'neto', netoBloqueado: false, ...over }
  const hook = renderHook((p: Props) => {
    const [modo, setModo] = useState<ModoJuego>(p.modo)
    const club = useEquiposDeClub({
      ...p, modo, onModo: m => { onModo(m); setModo(m) },
    })
    return { ...club, modo, setModo }
  }, { initialProps: props })
  return { ...hook, onModo, props }
}

describe('textoDeHandicapDeClub / handicapDeClubDesdeTexto', () => {
  it('el campo solo deja dígitos y un separador, hasta 4 caracteres', () => {
    expect(textoDeHandicapDeClub('12')).toBe('12')
    expect(textoDeHandicapDeClub('-8')).toBe('8')
    expect(textoDeHandicapDeClub('8a')).toBe('8')
    expect(textoDeHandicapDeClub('8,5')).toBe('8,5')
    expect(textoDeHandicapDeClub('123456')).toBe('1234')
  })

  it('vacío es "falta" (null), no 0; 0 escrito es 0', () => {
    expect(handicapDeClubDesdeTexto('')).toBeNull()
    expect(handicapDeClubDesdeTexto('  ')).toBeNull()
    expect(handicapDeClubDesdeTexto('0')).toBe(0)
    expect(handicapDeClubDesdeTexto('8')).toBe(8)
  })

  it('la coma chilena es decimal: "8,5" es 8.5 y no 85 (lo frena el validador)', () => {
    expect(handicapDeClubDesdeTexto('8,5')).toBe(8.5)
    expect(handicapDeClubDesdeTexto('8.5')).toBe(8.5)
    expect(Number.isNaN(handicapDeClubDesdeTexto('.'))).toBe(true)
  })
})

describe('equiposDeClubParaEnviar', () => {
  const equipos = [
    { id: 'a', nombre: ' Los Tigres ', handicap: '8' },
    { id: 'b', nombre: '', handicap: '' },
  ]

  it('neto: nombre como se ve (vacío → «Equipo N») y el número escrito; vacío viaja null', () => {
    expect(equiposDeClubParaEnviar(equipos, 'neto')).toEqual([
      { nombre: 'Los Tigres', handicap: 8 },
      { nombre: 'Equipo 2', handicap: null },
    ])
  })

  it('gross: el hándicap no viaja aunque esté escrito', () => {
    expect(equiposDeClubParaEnviar(equipos, 'gross').map(e => e.handicap)).toEqual([null, null])
  })

  it('lo que se envía pasa por el validador compartido, con su copy', () => {
    const problema = (paraEnviar: ReturnType<typeof equiposDeClubParaEnviar>) => validarNuevaRonda({
      cancha: 'Los Leones', formato: 'scramble', modo: 'neto',
      jugadores: [{ nombre: 'Juanjo', indice: null }], equipos: [],
      equiposDeClub: { equipos: paraEnviar, holes: 18, quienAnota: 'uno' },
    })
    expect(problema(equiposDeClubParaEnviar(equipos, 'neto'))?.detalle).toBe('Escribe el hándicap de Equipo 2.')
    expect(problema(equiposDeClubParaEnviar([{ id: 'a', nombre: '', handicap: '8,5' }], 'neto'))?.detalle)
      .toBe('El hándicap de equipo va de 0 a 36, sin decimales.')
    expect(problema(equiposDeClubParaEnviar([{ id: 'a', nombre: '', handicap: '8' }], 'neto'))).toBeNull()
  })
})

describe('useEquiposDeClub', () => {
  it('arranca en «Con jugadores», con un equipo vacío y sin nada que enviar', () => {
    const { result } = montar()
    expect(result.current.soloEquipos).toBe(false)
    expect(result.current.equipos).toHaveLength(1)
    expect(result.current.paraEnviar).toBeNull()
  })

  it('entrar a «Solo equipos» desde Gross pasa la ronda a Neto si el plan lo permite', () => {
    const { result, onModo } = montar({ modo: 'gross' })
    act(() => result.current.elegirSoloEquipos(true))
    expect(result.current.soloEquipos).toBe(true)
    expect(onModo).toHaveBeenCalledExactlyOnceWith('neto')
    expect(result.current.modo).toBe('neto')
    expect(result.current.paraEnviar).toEqual([{ nombre: 'Equipo 1', handicap: null }])
  })

  it('ida y vuelta: Gross → «Solo equipos» (Neto) → «Con jugadores» devuelve Gross', () => {
    const { result, onModo } = montar({ modo: 'gross' })
    act(() => result.current.elegirSoloEquipos(true))
    act(() => result.current.elegirSoloEquipos(false))
    expect(result.current.modo).toBe('gross')
    expect(onModo.mock.calls).toEqual([['neto'], ['gross']])
    expect(result.current.paraEnviar).toBeNull()
  })

  it('ida y vuelta desde Neto: el modo no se toca ni al entrar ni al salir', () => {
    const { result, onModo } = montar({ modo: 'neto' })
    act(() => result.current.elegirSoloEquipos(true))
    act(() => result.current.elegirSoloEquipos(false))
    expect(result.current.modo).toBe('neto')
    expect(onModo).not.toHaveBeenCalled()
  })

  it('tocar el segmento que ya está activo no hace nada', () => {
    const { result, onModo } = montar({ modo: 'gross' })
    act(() => result.current.elegirSoloEquipos(false))
    expect(onModo).not.toHaveBeenCalled()
    act(() => result.current.elegirSoloEquipos(true))
    act(() => result.current.elegirSoloEquipos(true))
    expect(onModo).toHaveBeenCalledTimes(1)
    expect(result.current.soloEquipos).toBe(true)
  })

  it('si el usuario elige Gross dentro de «Solo equipos», al volver manda lo que eligió', () => {
    const { result, onModo } = montar({ modo: 'gross' })
    act(() => result.current.elegirSoloEquipos(true))
    act(() => result.current.setModo('gross'))
    act(() => result.current.elegirSoloEquipos(false))
    expect(result.current.modo).toBe('gross')
    expect(onModo).toHaveBeenCalledTimes(1)
  })

  it('con el Neto bloqueado por plan entra igual, sin tocar el modo (queda en Gross)', () => {
    const { result, onModo } = montar({ netoBloqueado: true, modo: 'gross' })
    act(() => result.current.elegirSoloEquipos(true))
    act(() => result.current.elegirSoloEquipos(false))
    expect(result.current.modo).toBe('gross')
    expect(onModo).not.toHaveBeenCalled()
  })

  it('fuera de Scramble lo elegido no cuenta: la ronda va con jugadores', () => {
    const { result, rerender, props } = montar()
    act(() => result.current.elegirSoloEquipos(true))
    rerender({ ...props, formato: 'best_ball' })
    expect(result.current.soloEquipos).toBe(false)
    expect(result.current.paraEnviar).toBeNull()
    rerender({ ...props, formato: 'scramble' })
    expect(result.current.soloEquipos).toBe(true)
  })

  it('agrega hasta el tope del modo y no más', () => {
    const { result } = montar()
    for (let i = 0; i < MAX_EQUIPOS_DE_CLUB + 2; i++) act(() => result.current.agregar())
    expect(result.current.equipos).toHaveLength(MAX_EQUIPOS_DE_CLUB)
    expect(result.current.puedeAgregar).toBe(false)
    expect(new Set(result.current.equipos.map(e => e.id)).size).toBe(MAX_EQUIPOS_DE_CLUB)
  })

  it('quita cualquier equipo menos el último que queda', () => {
    const { result } = montar()
    act(() => result.current.agregar())
    act(() => result.current.renombrar(1, 'Los Pumas'))
    act(() => result.current.quitar(0))
    expect(result.current.equipos.map(e => e.nombre)).toEqual(['Los Pumas'])
    act(() => result.current.quitar(0))
    expect(result.current.equipos).toHaveLength(1)
  })

  it('el nombre se corta en el tope de la API y el hándicap pasa por el filtro del campo', () => {
    const { result } = montar()
    act(() => result.current.renombrar(0, 'x'.repeat(NOMBRE_EQUIPO_MAX + 10)))
    act(() => result.current.escribirHandicap(0, '1a2'))
    expect(result.current.equipos[0].nombre).toHaveLength(NOMBRE_EQUIPO_MAX)
    expect(result.current.equipos[0].handicap).toBe('12')
  })

  it('repetir una ronda de club: «Solo equipos», mismos nombres, hándicaps vacíos y sin tocar el modo', () => {
    const { result, onModo } = montar()
    act(() => result.current.escribirHandicap(0, '15'))
    act(() => result.current.restaurar(['Los Tigres', 'Los Pumas', 'Los Cóndores']))
    expect(result.current.soloEquipos).toBe(true)
    expect(result.current.equipos.map(e => [e.nombre, e.handicap])).toEqual([
      ['Los Tigres', ''], ['Los Pumas', ''], ['Los Cóndores', ''],
    ])
    expect(onModo).not.toHaveBeenCalled()
  })

  it('repetir: el nombre que se puso solo («Equipo 2» en la posición 2) vuelve vacío; uno escrito se respeta', () => {
    const { result } = montar()
    act(() => result.current.restaurar(['Equipo 1', 'Equipo 2', 'Equipo 2']))
    expect(result.current.equipos.map(e => e.nombre)).toEqual(['', '', 'Equipo 2'])
  })

  it('repetir una ronda sin equipos de club vuelve a «Con jugadores» y limpia lo escrito', () => {
    const { result } = montar()
    act(() => result.current.elegirSoloEquipos(true))
    act(() => result.current.renombrar(0, 'Los Tigres'))
    act(() => result.current.restaurar(null))
    expect(result.current.soloEquipos).toBe(false)
    expect(result.current.equipos.map(e => e.nombre)).toEqual([''])
  })
})
