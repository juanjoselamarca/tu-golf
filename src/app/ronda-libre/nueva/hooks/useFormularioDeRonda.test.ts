// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RondaReciente } from '@/lib/data/ronda-libre-nueva'

// Plan del usuario: lo controla cada test. El hook real lee la suscripción.
const acceso = vi.hoisted(() => ({ loading: false, pro: false }))
vi.mock('@/hooks/useAccesoNeto', () => ({
  useAccesoNeto: () => ({ loading: acceso.loading, puedeUsar: () => acceso.pro }),
}))

import { ID_DEL_CREADOR, useFormularioDeRonda } from './useFormularioDeRonda'

const rondaVieja = (over: Partial<RondaReciente> = {}): RondaReciente => ({
  course_name: 'Club de Golf Los Leones', course_id: null, tees: 'blanco', holes: 18,
  formato_juego: 'match_play', modo_juego: 'neto', fecha: '2026-09-01', jugadores: [
    { nombre: 'Juanjo', handicap: 12.4, tees: null, esCreador: true },
    { nombre: 'Nico', handicap: 8.1, tees: 'azul', esCreador: false },
  ],
  ...over,
})

beforeEach(() => {
  acceso.loading = false
  acceso.pro = false
})

describe('useFormularioDeRonda — modo según plan', () => {
  it('free: Stroke Play Neto → Match Play queda en Gross y con el Neto bloqueado', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.setModo('neto'))
    expect(result.current.modo).toBe('neto') // stroke play neto es libre
    expect(result.current.netoBloqueado).toBe(false)

    act(() => result.current.elegirFormato('match_play'))
    expect(result.current.modo).toBe('gross')
    expect(result.current.netoBloqueado).toBe(true)
  })

  it('free: volver a Stroke Play recupera el Neto que había pedido', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.setModo('neto'))
    act(() => result.current.elegirFormato('match_play'))
    act(() => result.current.elegirFormato('stroke_play'))
    expect(result.current.modo).toBe('neto')
  })

  it('free: repetir un Match Play Neto viejo arma un Match Play Gross', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja()))
    expect(result.current.formato).toBe('match_play')
    expect(result.current.modo).toBe('gross')
  })

  it('free: Match Play Gross es libre y se respeta', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('match_play'))
    act(() => result.current.setModo('gross'))
    expect(result.current.modo).toBe('gross')
  })

  it('Pro: Match Play Neto se respeta, al elegirlo y al repetir', () => {
    acceso.pro = true
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('match_play'))
    act(() => result.current.setModo('neto'))
    expect(result.current.modo).toBe('neto')
    expect(result.current.netoBloqueado).toBe(false)

    const otro = renderHook(() => useFormularioDeRonda())
    act(() => otro.result.current.repetirRonda(rondaVieja()))
    expect(otro.result.current.modo).toBe('neto')
  })

  it('mientras el plan carga no se bloquea ni se corrige; al resolver free cae a Gross', () => {
    acceso.loading = true
    const { result, rerender } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja()))
    expect(result.current.modo).toBe('neto')
    expect(result.current.netoBloqueado).toBe(false)

    acceso.loading = false
    rerender()
    expect(result.current.modo).toBe('gross')
    expect(result.current.netoBloqueado).toBe(true)
  })

  it('un modo_juego desconocido en una ronda vieja no se copia', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja({ formato_juego: 'stroke_play', modo_juego: 'raro' })))
    expect(result.current.modo).toBe('gross')
  })
})

describe('useFormularioDeRonda — quién anota se deriva del formato', () => {
  it('Stroke Play solo: nadie que anotar por nadie, se pregunta y por defecto cada uno en su celular', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    expect(result.current.preguntaQuienAnota).toBe(true)
    expect(result.current.llevaElScoreDelGrupo).toBe(false)
    expect(result.current.rivales).toEqual([])
    expect(result.current.rivalesEnJuego).toEqual([])
  })

  it('"Yo anoto por todos" abre la primera tarjeta; "cada uno" la cierra si sigue en blanco', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirQuienAnota(true))
    expect(result.current.llevaElScoreDelGrupo).toBe(true)
    expect(result.current.rivales).toHaveLength(1)

    act(() => result.current.elegirQuienAnota(false))
    expect(result.current.llevaElScoreDelGrupo).toBe(false)
    expect(result.current.rivales).toEqual([])
  })

  it('"cada uno en su celular" guarda a los rivales escritos pero no los manda a la ronda', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirQuienAnota(true))
    act(() => result.current.actualizarRival(0, 'nombre', 'Nico'))
    act(() => result.current.elegirQuienAnota(false))
    expect(result.current.rivales.map(r => r.nombre)).toEqual(['Nico'])
    expect(result.current.rivalesEnJuego).toEqual([])
    expect(result.current.rivalesConNombre).toEqual([])

    act(() => result.current.elegirQuienAnota(true))
    expect(result.current.rivalesEnJuego.map(r => r.nombre)).toEqual(['Nico'])
  })

  it('Match Play y Stableford no preguntan: anota uno y el rival ya está abierto', () => {
    for (const formato of ['match_play', 'stableford'] as const) {
      const { result } = renderHook(() => useFormularioDeRonda())
      act(() => result.current.elegirFormato(formato))
      expect(result.current.preguntaQuienAnota).toBe(false)
      expect(result.current.llevaElScoreDelGrupo).toBe(true)
      expect(result.current.rivales).toHaveLength(1)
      expect(result.current.equipos).toEqual([])
    }
  })
})

describe('useFormularioDeRonda — formatos por equipo (R4794T, 07-nov-2026)', () => {
  it('elegir Scramble arma Equipo 1 con el creador y UN compañero en blanco, sin preguntar nada', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    expect(result.current.preguntaQuienAnota).toBe(false)
    expect(result.current.llevaElScoreDelGrupo).toBe(true)
    expect(result.current.rivales).toHaveLength(1)
    expect(result.current.equipos).toEqual([
      { nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, result.current.rivales[0].id] },
    ])
  })

  it('volver de Scramble a Stroke Play apaga el modo de grupo y borra el compañero en blanco', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.elegirFormato('stroke_play'))
    expect(result.current.llevaElScoreDelGrupo).toBe(false)
    expect(result.current.rivales).toEqual([])
    expect(result.current.equipos).toEqual([])
  })

  it('volver a Stroke Play con un compañero escrito lo conserva y deja "yo anoto por todos"', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.actualizarRival(0, 'nombre', 'Nico'))
    act(() => result.current.elegirFormato('stroke_play'))
    expect(result.current.anotaPorTodos).toBe(true)
    expect(result.current.llevaElScoreDelGrupo).toBe(true)
    expect(result.current.rivales.map(r => r.nombre)).toEqual(['Nico'])
    expect(result.current.equipos).toEqual([])
  })

  it('"+ Agregar equipo rival" abre un segundo equipo con dos tarjetas en blanco', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.agregarEquipoRival())
    expect(result.current.rivales).toHaveLength(3)
    expect(result.current.equipos.map(e => e.miembros.length)).toEqual([2, 2])
    expect(result.current.equipos[1].nombre).toBe('Equipo 2')
    expect(result.current.equipos[1].miembros).toEqual(result.current.rivales.slice(1).map(r => r.id))
  })

  it('"+ Agregar compañero" suma al equipo pedido; con 4 en un solo equipo no cabe el rival', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.agregarRival(undefined, 0))
    act(() => result.current.agregarRival(undefined, 0))
    expect(result.current.rivales).toHaveLength(3)
    expect(result.current.equipos).toHaveLength(1)
    expect(result.current.equipos[0].miembros).toHaveLength(4)

    act(() => result.current.agregarEquipoRival())
    expect(result.current.equipos).toHaveLength(1)
    act(() => result.current.agregarRival(undefined, 0))
    expect(result.current.rivales).toHaveLength(3)
  })

  it('un jugador reciente ocupa la tarjeta en blanco del equipo en vez de sumar otra', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    const idEnBlanco = result.current.rivales[0].id
    act(() => result.current.agregarRival({ nombre: 'Nico', handicap: 8.1, tees: 'azul' }))
    expect(result.current.rivales).toHaveLength(1)
    expect(result.current.rivales[0]).toMatchObject({ id: idEnBlanco, nombre: 'Nico' })
    expect(result.current.equipos[0].miembros).toEqual([ID_DEL_CREADOR, idEnBlanco])
  })

  it('quitar al único compañero deja al creador solo en Equipo 1; quitar el último del rival borra el equipo', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.agregarEquipoRival())
    act(() => result.current.quitarRival(0))
    expect(result.current.equipos[0].miembros).toEqual([ID_DEL_CREADOR])

    act(() => result.current.quitarRival(0))
    act(() => result.current.quitarRival(0))
    expect(result.current.rivales).toEqual([])
    expect(result.current.equipos).toEqual([{ nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR] }])
  })

  it('quitar un equipo se lleva a su gente; el equipo del creador no se quita', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.agregarEquipoRival())
    act(() => result.current.quitarEquipo(0))
    expect(result.current.equipos).toHaveLength(2)
    act(() => result.current.quitarEquipo(1))
    expect(result.current.equipos).toHaveLength(1)
    expect(result.current.rivales).toHaveLength(1)
  })

  it('mover al compañero en un Scramble 2+2 lo intercambia: el creador no queda solo; renombrar sólo toca el nombre', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.agregarEquipoRival())
    const [compañero, rival1, rival2] = result.current.rivales.map(r => r.id)
    act(() => result.current.moverAlEquipo(compañero))
    expect(result.current.equipos[0].miembros).toEqual([ID_DEL_CREADOR, rival2])
    expect(result.current.equipos[1].miembros).toEqual([rival1, compañero])

    act(() => result.current.renombrarEquipo(1, 'Los Cóndores'))
    expect(result.current.equipos[1].nombre).toBe('Los Cóndores')
    expect(result.current.equipos[1].miembros).toHaveLength(2)
  })

  it('Foursome 2+2 (los dos equipos llenos): mover cambia las parejas en vez de no hacer nada', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('foursome'))
    act(() => result.current.agregarEquipoRival())
    const [compañero, rival1, rival2] = result.current.rivales.map(r => r.id)
    act(() => result.current.moverAlEquipo(compañero))
    expect(result.current.equipos.map(e => e.miembros)).toEqual([[ID_DEL_CREADOR, rival2], [rival1, compañero]])
    act(() => result.current.moverAlEquipo(rival1))
    expect(result.current.equipos.map(e => e.miembros)).toEqual([[ID_DEL_CREADOR, rival1], [rival2, compañero]])
  })

  it('con un solo equipo no hay a dónde mover a nadie', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    const antes = result.current.equipos
    act(() => result.current.moverAlEquipo(result.current.rivales[0].id))
    expect(result.current.equipos).toEqual(antes)
  })

  it('quitar el equipo al que se movió el creador lo devuelve al primero en vez de sacarlo de la ronda', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.agregarEquipoRival())
    const [compañero, , rival2] = result.current.rivales.map(r => r.id)
    act(() => result.current.moverAlEquipo(ID_DEL_CREADOR))
    expect(result.current.equipos[1].miembros).toContain(ID_DEL_CREADOR)
    expect(result.current.equipos[0].miembros).toEqual([rival2, compañero])

    act(() => result.current.quitarEquipo(1))
    expect(result.current.equipos).toHaveLength(1)
    expect(result.current.equipos[0].miembros).toEqual([ID_DEL_CREADOR, rival2, compañero])
    expect(result.current.rivales.map(r => r.id)).toEqual([compañero, rival2])
  })

  it('cambiar de Scramble a Best Ball conserva los equipos armados; a Foursome con 3 los rearma', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    act(() => result.current.agregarEquipoRival())
    act(() => result.current.renombrarEquipo(0, 'Nosotros'))
    const antes = result.current.equipos
    act(() => result.current.elegirFormato('best_ball'))
    expect(result.current.equipos).toEqual(antes)

    act(() => result.current.quitarRival(2))
    expect(result.current.equipos.map(e => e.miembros.length)).toEqual([2, 1])
    act(() => result.current.elegirFormato('foursome'))
    expect(result.current.equipos.map(e => e.miembros.length)).toEqual([2, 1])
    expect(result.current.equipos[0].nombre).toBe('Nosotros')
  })

  it('repetir una ronda de 4 en Scramble reparte 2+2 y deja al usuario en la cancha, con todo cargado', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja({
      formato_juego: 'scramble', modo_juego: 'gross',
      jugadores: [
        { nombre: 'Juanjo', handicap: 12.4, tees: null, esCreador: true },
        { nombre: 'Nico', handicap: 8.1, tees: 'azul', esCreador: false },
        { nombre: 'Pedro', handicap: 20, tees: null, esCreador: false },
        { nombre: 'Max', handicap: 5, tees: null, esCreador: false },
      ],
    })))
    // En la cancha: la fecha, los recorridos y la mitad de un 9 hoyos se eligen ahí.
    expect(result.current.paso).toBe(1)
    expect(result.current.llevaElScoreDelGrupo).toBe(true)
    const [nico, pedro, max] = result.current.rivales.map(r => r.id)
    expect(result.current.equipos).toEqual([
      { nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, nico] },
      { nombre: 'Equipo 2', miembros: [pedro, max] },
    ])
  })

  it('una tarjeta sin nombre dentro de un equipo pide el nombre, no "asignar a un equipo"', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('scramble'))
    expect(result.current.problemaDelFormulario?.detalle).toBe('Escribe el nombre del jugador que falta.')

    act(() => result.current.agregarEquipoRival())
    expect(result.current.problemaDelFormulario?.detalle).toBe('Escribe el nombre de los 3 jugadores que faltan.')

    act(() => result.current.rivales.forEach((r, i) => result.current.actualizarRival(i, 'nombre', `Rival ${i}`)))
    expect(result.current.problemaDelFormulario).toBeNull()
  })

  it('en Stroke Play una tarjeta en blanco no pide nombre: no hay equipos que la esperen', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirQuienAnota(true))
    expect(result.current.rivalesEnJuego.some(r => !r.nombre.trim())).toBe(true)
    expect(result.current.problemaDelFormulario).toBeNull()
  })

  it('repetir una ronda de 2 en Scramble arma un solo equipo', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja({ formato_juego: 'scramble', modo_juego: 'gross' })))
    expect(result.current.rivales.map(r => r.nombre)).toEqual(['Nico'])
    expect(result.current.equipos).toEqual([
      { nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, result.current.rivales[0].id] },
    ])
  })
})

describe('useFormularioDeRonda — jugadores recientes', () => {
  it('repetir una ronda trae a los rivales con su índice y su tee, sin el creador, anotando por todos', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    // El creador viene SEGUNDO: la base no garantiza el orden de los jugadores.
    act(() => result.current.repetirRonda(rondaVieja({
      formato_juego: 'stroke_play',
      jugadores: [
        { nombre: 'Nico', handicap: 8.1, tees: 'azul', esCreador: false },
        { nombre: 'Juanjo', handicap: 12.4, tees: null, esCreador: true },
        { nombre: 'Pedro', handicap: null, tees: null, esCreador: false },
      ],
    })))
    expect(result.current.rivales.map(r => [r.nombre, r.handicap, r.tees])).toEqual([
      ['Nico', 8.1, 'azul'],
      ['Pedro', null, null],
    ])
    expect(result.current.llevaElScoreDelGrupo).toBe(true)
    expect(result.current.paso).toBe(1)
  })

  it('repetir una ronda que jugó solo queda en "cada uno en su celular"', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja({
      formato_juego: 'stroke_play',
      jugadores: [{ nombre: 'Juanjo', handicap: 12.4, tees: null, esCreador: true }],
    })))
    expect(result.current.llevaElScoreDelGrupo).toBe(false)
    expect(result.current.rivales).toEqual([])
  })

  it('un jugador reciente ocupa la tarjeta en blanco en vez de sumar otra', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirQuienAnota(true))
    expect(result.current.rivales).toHaveLength(1)
    const idEnBlanco = result.current.rivales[0].id

    act(() => result.current.agregarRival({ nombre: 'Nico', handicap: 8.1, tees: 'azul' }))
    expect(result.current.rivales).toHaveLength(1)
    expect(result.current.rivales[0]).toMatchObject({ id: idEnBlanco, nombre: 'Nico', handicap: 8.1, tees: 'azul' })

    act(() => result.current.agregarRival({ nombre: 'Pedro', handicap: 20, tees: null }))
    expect(result.current.rivales.map(r => r.nombre)).toEqual(['Nico', 'Pedro'])
  })

  it('"+ Agregar jugador" siempre suma una tarjeta nueva, hasta el tope del formato', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirQuienAnota(true))
    act(() => result.current.agregarRival())
    expect(result.current.rivales).toHaveLength(2)
    act(() => result.current.agregarRival())
    act(() => result.current.agregarRival())
    expect(result.current.rivales).toHaveLength(3)
  })
})
