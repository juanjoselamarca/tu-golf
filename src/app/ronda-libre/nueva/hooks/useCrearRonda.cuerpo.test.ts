// El body de POST /api/ronda-libre/create: con equipos de club (scramble rápido) y sin ellos.
import { describe, it, expect } from 'vitest'
import { cuerpoParaCrearRonda, equiposConIndices, jugadoresDeLaRonda, type Args } from './useCrearRonda'
import { CONFIG_SKINS_POR_DEFECTO } from '@/golf/formats/skins'
import { ID_DEL_CREADOR, type RivalDelCreador } from './useFormularioDeRonda'

const RIVAL: RivalDelCreador = { id: 'r1', tipo: 'invitado', nombre: 'Pedro', telefono: '', handicap: 10, tees: null, profileId: null }

const base = (over: Partial<Args> = {}): Args => ({
  userId: 'u1', courseId: 'c1', cancha: 'Los Leones', teeGlobal: 'blanco',
  jugadores: jugadoresDeLaRonda({ creador: { nombre: 'Juanjo', indice: 12.4 }, teeGlobal: 'blanco', rivales: [] }),
  equipos: [], formato: 'scramble', modo: 'neto', fecha: '2026-11-23',
  forma: { holes: 18, hoyoInicio: 1, esMultiRecorrido: false }, recorridos: [],
  llevaElScoreDelGrupo: true,
  ...over,
})

const cuerpo = (args: Args) => cuerpoParaCrearRonda(args, equiposConIndices(args.equipos, args.jugadores))

describe('cuerpoParaCrearRonda — equipos de club', () => {
  const club = [{ nombre: 'Los Tigres', handicap: 8 }, { nombre: 'Equipo 2', handicap: 12 }]

  it('manda equipos_de_club con un celular, sin `equipos`, y al creador como único jugador', () => {
    const body = cuerpo(base({ equiposDeClub: club, quienAnotaEquiposDeClub: 'uno' }))
    expect(body.equipos_de_club).toEqual({ equipos: club, quien_anota: 'uno' })
    expect(body.equipos).toBeUndefined()
    expect(body.jugadores.map(j => [j.nombre, j.user_id])).toEqual([['Juanjo', 'u1']])
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('equipos')
  })

  it('«Cada equipo en su celular» viaja tal cual (el servidor deriva admin_mode)', () => {
    expect(cuerpo(base({ equiposDeClub: club, quienAnotaEquiposDeClub: 'cada_equipo' })).equipos_de_club?.quien_anota).toBe('cada_equipo')
  })

  it('con 1 equipo no se pregunta: quien_anota viaja null', () => {
    expect(cuerpo(base({ equiposDeClub: [club[0]] })).equipos_de_club?.quien_anota).toBeNull()
  })

  it('gross: los hándicaps viajan null', () => {
    const body = cuerpo(base({ modo: 'gross', equiposDeClub: [{ nombre: 'Los Tigres', handicap: null }] }))
    expect(body.modo_juego).toBe('gross')
    expect(body.equipos_de_club?.equipos).toEqual([{ nombre: 'Los Tigres', handicap: null }])
  })
})

describe('cuerpoParaCrearRonda — scramble con jugadores (sin cambios)', () => {
  it('manda `equipos` por posición y no manda equipos_de_club', () => {
    const jugadores = jugadoresDeLaRonda({ creador: { nombre: 'Juanjo', indice: 12.4 }, teeGlobal: 'blanco', rivales: [RIVAL] })
    const body = cuerpo(base({ jugadores, equipos: [{ nombre: 'Los Tigres', miembros: [ID_DEL_CREADOR, 'r1'] }] }))
    expect(body.equipos).toEqual([{ nombre: 'Los Tigres', jugadorIndices: [0, 1] }])
    expect(body.equipos_de_club).toBeUndefined()
    expect(body.admin_mode).toBe(true)
  })

  it('un formato individual no manda ni equipos ni equipos_de_club', () => {
    const body = cuerpo(base({ formato: 'stroke_play', modo: 'gross' }))
    expect(body.equipos).toBeUndefined()
    expect(body.equipos_de_club).toBeUndefined()
  })
})

describe('cuerpoParaCrearRonda — skins', () => {
  it('viaja como skins con sus reglas en reglas_juego', () => {
    const reglas = { ...CONFIG_SKINS_POR_DEFECTO, pozoPorJugador: 10000 }
    const body = cuerpo(base({ formato: 'stroke_play', skins: { reglasJuego: reglas, problema: null } }))
    expect(body.formato_juego).toBe('skins')
    expect(body.reglas_juego).toEqual(reglas)
  })
})
