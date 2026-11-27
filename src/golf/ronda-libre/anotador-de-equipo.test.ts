import { describe, it, expect } from 'vitest'
import {
  anotaSinSerJugador,
  anotadoresDeEquipos,
  cierraLaRonda,
  entradaAlScorerDeEquipos,
  equipoAjenoIncompleto,
  equipoTerminado,
  equiposPorTerminar,
  equiposTerminadosDelCelular,
  equiposConParAutomatico,
  equiposDeOtroCelular,
  equiposLibres,
  equiposQueAnota,
  equiposQueConfirmanElHoyo,
  equiposQueNoConfirmanElHoyo,
  equiposSinParAutomatico,
  equiposTomados,
  nombreDelAnotador,
  nombreDelCreador,
  nombreDeQuienAnota,
  nombreDelAnotadorDelCelular,
  equipoLiberadoSinElHoyo,
  ofreceAnotarMiEquipo,
  unCelularPorEquipo,
  type EquipoConAnotador,
} from './anotador-de-equipo'

const CREADOR = 'u-creador'
const PEDRO = 'u-pedro'
const JUAN = 'u-juan'
const EXTRANO = 'u-extrano'

const multi = { formato_juego: 'scramble', admin_mode: false, creador_id: CREADOR, admin_user_id: null, ronda_libre_jugadores: [{ user_id: CREADOR }] }
const unCelular = { ...multi, admin_mode: true, admin_user_id: CREADOR }

const club = (id: string, anotador: string | null, nombre: string | null = null): EquipoConAnotador =>
  ({ id, handicap_origen: 'club', anotador_user_id: anotador, anotador_nombre: nombre })
// Equipo 1 lo anota el creador (lo pone la API al crear), el 2 Pedro, el 3 nadie.
const equipos = [club('e1', CREADOR, 'Creador'), club('e2', PEDRO, 'Pedro'), club('e3', null)]
const ids = (es: readonly EquipoConAnotador[]) => es.map(e => e.id)

describe('unCelularPorEquipo', () => {
  it('bola compartida, sin admin_mode y con equipos de club', () => {
    expect(unCelularPorEquipo(multi, equipos)).toBe(true)
    expect(unCelularPorEquipo({ ...multi, admin_mode: null }, equipos)).toBe(true) // SQL: admin_mode IS NOT TRUE
    expect(unCelularPorEquipo({ ...multi, formato_juego: 'foursome' }, equipos)).toBe(true)
  })
  it('no con admin_mode, sin equipos de club ni fuera de bola compartida', () => {
    expect(unCelularPorEquipo(unCelular, equipos)).toBe(false)
    expect(unCelularPorEquipo(multi, [{ ...club('x', null), handicap_origen: 'calculado' }])).toBe(false)
    expect(unCelularPorEquipo(multi, [{}])).toBe(false) // lectura sin la columna
    expect(unCelularPorEquipo(multi, [])).toBe(false)
    expect(unCelularPorEquipo({ ...multi, formato_juego: 'best_ball' }, equipos)).toBe(false)
    expect(unCelularPorEquipo({ ...multi, formato_juego: 'stroke_play' }, equipos)).toBe(false)
  })
})

describe('equiposQueAnota (matriz)', () => {
  it('ronda de un celular: todos los equipos, para cualquiera (como siempre)', () => {
    for (const u of [CREADOR, PEDRO, EXTRANO, null]) expect(ids(equiposQueAnota(unCelular, equipos, u))).toEqual(['e1', 'e2', 'e3'])
  })
  it('creador: el suyo; uno sin reclamar y sin golpes queda en la franja (Juanjo 26-nov); nunca el de Pedro', () => {
    expect(ids(equiposQueAnota(multi, equipos, CREADOR))).toEqual(['e1'])
    expect(ids(equiposDeOtroCelular(multi, equipos, CREADOR))).toEqual(['e2', 'e3'])
  })
  it('creador: uno sin reclamar pasa a su celular con «Anotarlo yo» (tomado) o si ya tiene golpes', () => {
    expect(ids(equiposQueAnota(multi, equipos, CREADOR, new Set(['e3'])))).toEqual(['e1', 'e3'])
    const conGolpes = [equipos[0], equipos[1], { ...club('e3', null), scores: { 1: 4 } }]
    expect(ids(equiposQueAnota(multi, conGolpes, CREADOR))).toEqual(['e1', 'e3'])
    // Tomado a mano no le quita nada a otro celular: e2 sigue siendo de Pedro.
    expect(ids(equiposQueAnota(multi, equipos, CREADOR, new Set(['e2'])))).toEqual(['e1'])
    expect(ids(equiposQueAnota(multi, equipos, PEDRO, new Set(['e3'])))).toEqual(['e2'])
  })
  it('Pedro: solo el que reclamó', () => {
    expect(ids(equiposQueAnota(multi, equipos, PEDRO))).toEqual(['e2'])
  })
  it('una cuenta sin equipo, o sin sesión: ninguno (ni los libres: esos son del creador)', () => {
    expect(equiposQueAnota(multi, equipos, JUAN)).toEqual([])
    expect(equiposQueAnota(multi, equipos, null)).toEqual([])
    expect(equiposQueAnota(multi, equipos, undefined)).toEqual([])
  })
  it('liberado: el equipo vuelve al creador (la franja lo marca tomado) y deja de ser de Pedro', () => {
    const liberado = [equipos[0], club('e2', null), equipos[2]]
    expect(ids(equiposQueAnota(multi, liberado, CREADOR, new Set(['e2'])))).toEqual(['e1', 'e2'])
    expect(equiposQueAnota(multi, liberado, PEDRO)).toEqual([])
  })
  it('el creador que liberó su propio equipo lo sigue anotando (queda libre)', () => {
    const todosAjenos = [club('e1', null), club('e2', PEDRO), club('e3', JUAN)]
    expect(ids(equiposQueAnota(multi, todosAjenos, CREADOR))).toEqual(['e1'])
  })
  it('equiposDeOtroCelular es el complemento exacto', () => {
    for (const [u, t] of [[CREADOR, new Set<string>()], [CREADOR, new Set(['e3'])], [PEDRO, new Set<string>()], [JUAN, new Set<string>()], [null, new Set<string>()]] as const) {
      const mios = ids(equiposQueAnota(multi, equipos, u, t))
      const ajenos = ids(equiposDeOtroCelular(multi, equipos, u, t))
      expect([...mios, ...ajenos].sort()).toEqual(['e1', 'e2', 'e3'])
      expect(mios.filter(id => ajenos.includes(id))).toEqual([])
    }
    expect(equiposDeOtroCelular(unCelular, equipos, CREADOR)).toEqual([])
  })
})

describe('anotaSinSerJugador', () => {
  it('creador o marcador designado: sí, aunque no tengan fila de jugador', () => {
    expect(anotaSinSerJugador({ creador_id: 'c', admin_user_id: null }, 'c')).toBe(true)
    expect(anotaSinSerJugador({ creador_id: 'c', admin_user_id: 'm' }, 'm')).toBe(true)
  })
  it('cualquier otra cuenta, o sin sesión: no', () => {
    expect(anotaSinSerJugador({ creador_id: 'c', admin_user_id: 'm' }, 'x')).toBe(false)
    expect(anotaSinSerJugador({ creador_id: null, admin_user_id: null }, null)).toBe(false)
    expect(anotaSinSerJugador({ creador_id: null, admin_user_id: null }, undefined)).toBe(false)
  })
})

describe('entradaAlScorerDeEquipos', () => {
  it('un celular por equipo: creador anota, quien tiene equipo anota, el resto elige', () => {
    expect(entradaAlScorerDeEquipos(multi, equipos, CREADOR)).toBe('anota')
    expect(entradaAlScorerDeEquipos(multi, equipos, PEDRO)).toBe('anota')
    expect(entradaAlScorerDeEquipos(multi, equipos, JUAN)).toBe('elegir_equipo')
    expect(entradaAlScorerDeEquipos(multi, [club('e1', PEDRO), club('e2', JUAN)], CREADOR)).toBe('anota')
  })
  it('un celular: solo creador, marcador o jugador con cuenta (puede_anotar_ronda); el resto, en vivo', () => {
    expect(entradaAlScorerDeEquipos(unCelular, equipos, CREADOR)).toBe('anota')
    expect(entradaAlScorerDeEquipos({ ...unCelular, admin_user_id: 'u-marcador' }, equipos, 'u-marcador')).toBe('anota')
    expect(entradaAlScorerDeEquipos({ ...unCelular, ronda_libre_jugadores: [{ user_id: PEDRO }] }, equipos, PEDRO)).toBe('anota')
    expect(entradaAlScorerDeEquipos(unCelular, equipos, EXTRANO)).toBe('en_vivo')
  })
  it('scramble de jugadores de siempre (sin club): misma regla de un celular', () => {
    const calc = [{ id: 'a', handicap_origen: 'calculado' as const }]
    const r = { ...multi, admin_mode: false, ronda_libre_jugadores: [{ user_id: CREADOR }, { user_id: PEDRO }] }
    expect(entradaAlScorerDeEquipos(r, calc, PEDRO)).toBe('anota')
    expect(entradaAlScorerDeEquipos(r, calc, EXTRANO)).toBe('en_vivo')
  })
  it('sin sesión: en vivo', () => {
    expect(entradaAlScorerDeEquipos(multi, equipos, null)).toBe('en_vivo')
  })
})

describe('anotadoresDeEquipos (aviso a seguidores)', () => {
  it('las cuentas que anotan un equipo de club en una ronda de un celular por equipo', () => {
    expect(anotadoresDeEquipos(multi, equipos)).toEqual([CREADOR, PEDRO])
  })
  it('nadie en una ronda de un celular (la RPC no deja escribir por anotador)', () => {
    expect(anotadoresDeEquipos(unCelular, equipos)).toEqual([])
  })
})

describe('nombreDelAnotador', () => {
  it('el nombre, o «otro celular» si no llegó', () => {
    expect(nombreDelAnotador({ anotador_nombre: 'Pedro' })).toBe('Pedro')
    expect(nombreDelAnotador({ anotador_nombre: null })).toBe('otro celular')
    expect(nombreDelAnotador({ anotador_nombre: '  ' })).toBe('otro celular')
  })
})

describe('equipoAjenoIncompleto', () => {
  const hoyos = [10, 11, 12, 13, 14, 15, 16, 17, 18]
  const lleno = Object.fromEntries(hoyos.map(h => [String(h), 4]))
  it('el primer equipo al que le falta un hoyo y el primer hoyo que falta, en el orden de la ronda', () => {
    const a = { ...club('e2', PEDRO, 'Pedro'), nombre: 'Los Tigres', scores: lleno }
    const b = { ...club('e3', JUAN, 'Juan'), nombre: 'Equipo 3', scores: { '10': 4, '11': 5, '12': 3 } }
    expect(equipoAjenoIncompleto([a, b], hoyos)).toEqual({ equipo: b, hoyo: 13 })
  })
  it('todos completos o sin ajenos: null', () => {
    expect(equipoAjenoIncompleto([{ ...club('e2', PEDRO), nombre: 'X', scores: lleno }], hoyos)).toBeNull()
    expect(equipoAjenoIncompleto([], hoyos)).toBeNull()
  })
})

describe('cierraLaRonda', () => {
  it('un celular por equipo: solo el creador', () => {
    expect(cierraLaRonda(multi, equipos, CREADOR)).toBe(true)
    expect(cierraLaRonda(multi, equipos, PEDRO)).toBe(false)
    expect(cierraLaRonda(multi, equipos, null)).toBe(false)
  })
  it('ronda de un celular: sin cambio (cierra quien anota)', () => {
    expect(cierraLaRonda(unCelular, equipos, PEDRO)).toBe(true)
    expect(cierraLaRonda({ ...multi, formato_juego: 'best_ball' }, equipos, JUAN)).toBe(true)
  })
})

describe('nombreDelCreador', () => {
  it('el jugador de la ronda con la cuenta del creador', () => {
    expect(nombreDelCreador({ creador_id: CREADOR, ronda_libre_jugadores: [{ user_id: CREADOR, nombre: ' Juanjo ' }] })).toBe('Juanjo')
  })
  it('sin creador, sin jugador o sin nombre: null', () => {
    expect(nombreDelCreador({ creador_id: null, ronda_libre_jugadores: [] })).toBeNull()
    expect(nombreDelCreador({ creador_id: CREADOR, ronda_libre_jugadores: [{ user_id: EXTRANO, nombre: 'X' }] })).toBeNull()
    expect(nombreDelCreador({ creador_id: CREADOR, ronda_libre_jugadores: [{ user_id: CREADOR, nombre: '  ' }] })).toBeNull()
  })
})

describe('equiposConParAutomatico / equiposSinParAutomatico (par fantasma, P1-a)', () => {
  it('un celular por equipo, creador: solo su equipo reclamado; el sin reclamar NO recibe par aunque lo anote', () => {
    expect(ids(equiposQueAnota(multi, equipos, CREADOR, new Set(['e3'])))).toEqual(['e1', 'e3'])
    expect(ids(equiposConParAutomatico(multi, equipos, CREADOR))).toEqual(['e1'])
    expect(ids(equiposSinParAutomatico(multi, equipos, CREADOR))).toEqual(['e2', 'e3'])
  })
  it('un celular por equipo, anotador: solo el suyo', () => {
    expect(ids(equiposConParAutomatico(multi, equipos, PEDRO))).toEqual(['e2'])
    expect(ids(equiposSinParAutomatico(multi, equipos, PEDRO))).toEqual(['e1', 'e3'])
  })
  it('sin sesión: ninguno recibe par', () => {
    expect(equiposConParAutomatico(multi, equipos, null)).toEqual([])
    expect(ids(equiposSinParAutomatico(multi, equipos, undefined))).toEqual(['e1', 'e2', 'e3'])
  })
  it('«Yo anoto todos» (un celular): todos reciben par, como siempre', () => {
    expect(ids(equiposConParAutomatico(unCelular, equipos, CREADOR))).toEqual(['e1', 'e2', 'e3'])
    expect(equiposSinParAutomatico(unCelular, equipos, CREADOR)).toEqual([])
  })
})

describe('equiposLibres / equiposTomados («Elige tu equipo»)', () => {
  it('libres = sin anotador; tomados = con anotador; juntos cubren todos sin repetir', () => {
    expect(ids(equiposLibres(equipos))).toEqual(['e3'])
    expect(ids(equiposTomados(equipos))).toEqual(['e1', 'e2'])
  })
  it('anotador undefined (copia sin las columnas) cuenta como libre', () => {
    const viejo = { id: 'e9', handicap_origen: 'club' as const }
    expect(ids(equiposLibres([viejo]))).toEqual(['e9'])
    expect(equiposTomados([viejo])).toEqual([])
  })
})

describe('ofreceAnotarMiEquipo (CTA de la ronda en vivo)', () => {
  it('queda un equipo libre: se ofrece a cualquier cuenta', () => {
    expect(ofreceAnotarMiEquipo(equipos, EXTRANO)).toBe(true)
  })
  it('todos tomados: solo a quien ya anota uno (vuelve a su scorer)', () => {
    const tomados = [club('e1', CREADOR), club('e2', PEDRO)]
    expect(ofreceAnotarMiEquipo(tomados, EXTRANO)).toBe(false)
    expect(ofreceAnotarMiEquipo(tomados, PEDRO)).toBe(true)
  })
  it('sin sesión: nunca', () => {
    expect(ofreceAnotarMiEquipo(equipos, null)).toBe(false)
  })
})

describe('nombreDeQuienAnota (franja de equipos de otro celular)', () => {
  it('sin reclamar: lo anota el creador, con su nombre (no «otro celular»)', () => {
    expect(nombreDeQuienAnota(club('e3', null), 'Juanjo')).toBe('Juanjo')
    expect(nombreDeQuienAnota(club('e3', null), null)).toBe('quien creó la ronda')
  })
  it('reclamado: el nombre del anotador; sin nombre, «otro celular»', () => {
    expect(nombreDeQuienAnota(club('e2', PEDRO, 'Pedro'), 'Juanjo')).toBe('Pedro')
    expect(nombreDeQuienAnota(club('e2', PEDRO, null), 'Juanjo')).toBe('otro celular')
  })
})

describe('equiposQueConfirmanElHoyo: el par gris que este celular guarda (ensayo 24-nov, Liberar)', () => {
  const conGolpes = (e: EquipoConAnotador, scores: Record<string, number>): EquipoConAnotador => ({ ...e, scores })
  it('liberado con golpes: el creador confirma su hoyo en pantalla, pero el cierre no le rellena hoyos (sigue P1-a)', () => {
    const lista = [club('e1', CREADOR), club('e2', PEDRO), conGolpes(club('e3', null), { 1: 4, 2: 5 })]
    expect(ids(equiposQueConfirmanElHoyo(multi, lista, CREADOR))).toEqual(['e1', 'e3'])
    expect(ids(equiposQueNoConfirmanElHoyo(multi, lista, CREADOR))).toEqual(['e2'])
    expect(ids(equiposConParAutomatico(multi, lista, CREADOR))).toEqual(['e1'])
  })
  it('sin reclamar y sin golpes: no se confirma (P1-a)… salvo que el creador lo haya tomado («Anotarlo yo»)', () => {
    const lista = [club('e1', CREADOR), conGolpes(club('e3', null), {})]
    expect(ids(equiposQueConfirmanElHoyo(multi, lista, CREADOR))).toEqual(['e1'])
    expect(ids(equiposQueConfirmanElHoyo(multi, lista, CREADOR, new Set(['e3'])))).toEqual(['e1', 'e3'])
    expect(ids(equiposQueNoConfirmanElHoyo(multi, lista, CREADOR, new Set(['e3'])))).toEqual([])
  })
  it('solo el creador: otra cuenta nunca confirma un equipo sin reclamar, aunque tenga golpes', () => {
    const lista = [club('e1', CREADOR), club('e2', PEDRO), conGolpes(club('e3', null), { 1: 4 })]
    expect(ids(equiposQueConfirmanElHoyo(multi, lista, PEDRO))).toEqual(['e2'])
  })
  it('un equipo de otro celular con golpes no se confirma desde acá', () => {
    const lista = [club('e1', CREADOR), conGolpes(club('e2', PEDRO), { 1: 4 })]
    expect(ids(equiposQueConfirmanElHoyo(multi, lista, CREADOR))).toEqual(['e1'])
  })
  it('sin sesión: ninguno. Ronda de un celular: todos', () => {
    expect(equiposQueConfirmanElHoyo(multi, equipos, null)).toEqual([])
    expect(ids(equiposQueConfirmanElHoyo(unCelular, equipos, CREADOR))).toEqual(['e1', 'e2', 'e3'])
  })
})

describe('nombreDelAnotadorDelCelular (nunca el correo)', () => {
  const jugadores = [{ user_id: CREADOR, nombre: 'Juanjo' }, { user_id: null, nombre: 'Invitado' }]
  it('jugador de la ronda: su nombre en la ronda', () => {
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [club('e1', CREADOR, 'Perfil')], userId: CREADOR })).toBe('Juanjo')
  })
  it('no juega pero reclamó un equipo: el nombre de su perfil copiado en el equipo', () => {
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [club('e2', PEDRO, 'Cristián Ross')], userId: PEDRO })).toBe('Cristián Ross')
  })
  it('sin equipo con nombre: el perfil leído', () => {
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [club('e2', PEDRO, null)], userId: PEDRO, nombreDePerfil: ' Max ' })).toBe('Max')
  })
  it('sin nada: genérico (nunca el correo)', () => {
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [], userId: JUAN, nombreDePerfil: '  ' })).toBe('Anotador')
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [], userId: null })).toBe('Anotador')
  })
  it('alta sin nombre (profiles.name = parte local del correo): se descarta en cada fuente, nunca sale el correo', () => {
    const email = 'Ensayo-Ross-17955@gmail.com'
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [club('e2', PEDRO, 'ensayo-ross-17955')], userId: PEDRO, email })).toBe('Anotador')
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [club('e2', PEDRO, null)], userId: PEDRO, nombreDePerfil: 'ensayo-ross-17955', email })).toBe('Anotador')
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [club('e2', PEDRO, 'Cristián Ross')], userId: PEDRO, email })).toBe('Cristián Ross')
    expect(nombreDelAnotadorDelCelular({ jugadores, equipos: [club('e2', PEDRO, 'ross@golf.cl')], userId: PEDRO })).toBe('Anotador')
  })
  it('nombre tecleado en la ronda igual a la parte local («Max» con max@…): es legítimo, se muestra', () => {
    expect(nombreDelAnotadorDelCelular({ jugadores: [{ user_id: PEDRO, nombre: 'Max' }], equipos: [], userId: PEDRO, email: 'max@golf.cl' })).toBe('Max')
  })
})

describe('equipoLiberadoSinElHoyo', () => {
  const base = { sinParAutomatico: [{ id: 'e2' }], noConfirmanElHoyo: [] as { id: string }[], hoyo: 18 }
  it('equipo liberado que este celular anota, sin golpes en el hoyo: sí', () => {
    expect(equipoLiberadoSinElHoyo({ ...base, equipos: [{ id: 'e1', scores: {} }, { id: 'e2', scores: { '17': 4 } }] })).toBe(true)
  })
  it('ya tiene el hoyo, no es liberado, o este celular no lo confirma: no', () => {
    expect(equipoLiberadoSinElHoyo({ ...base, equipos: [{ id: 'e2', scores: { '18': 5 } }] })).toBe(false)
    expect(equipoLiberadoSinElHoyo({ ...base, equipos: [{ id: 'e1', scores: {} }] })).toBe(false)
    expect(equipoLiberadoSinElHoyo({ ...base, noConfirmanElHoyo: [{ id: 'e2' }], equipos: [{ id: 'e2', scores: {} }] })).toBe(false)
  })
})

describe('«Terminar mi equipo»: equipoTerminado, equiposPorTerminar, equiposTerminadosDelCelular', () => {
  const T = '2026-11-28T14:00:00Z'
  const term = (e: EquipoConAnotador): EquipoConAnotador => ({ ...e, terminado_at: T })
  it('equipoTerminado: solo con terminado_at', () => {
    expect(equipoTerminado(club('e1', CREADOR))).toBe(false)
    expect(equipoTerminado({ ...club('e1', CREADOR), terminado_at: null })).toBe(false)
    expect(equipoTerminado(term(club('e1', CREADOR)))).toBe(true)
  })
  it('equiposPorTerminar: los que anota este celular sin los terminados', () => {
    const es = [term(club('e1', CREADOR)), club('e2', PEDRO), club('e3', null)]
    expect(ids(equiposPorTerminar(multi, es, CREADOR))).toEqual([])
    expect(ids(equiposPorTerminar(multi, es, PEDRO))).toEqual(['e2'])
    // El creador con un equipo sin reclamar tomado a mano: termina ese también.
    expect(ids(equiposPorTerminar(multi, [club('e1', CREADOR), club('e2', PEDRO), club('e3', null)], CREADOR, new Set(['e3'])))).toEqual(['e1', 'e3'])
  })
  it('equiposPorTerminar en una ronda de un celular: todos, como siempre', () => {
    expect(ids(equiposPorTerminar(unCelular, [term(club('e1', null)), club('e2', null)], CREADOR))).toEqual(['e1', 'e2'])
  })
  it('equiposTerminadosDelCelular: solo si TODOS los suyos terminaron', () => {
    const es = [term(club('e1', CREADOR)), club('e2', PEDRO), club('e3', null)]
    expect(ids(equiposTerminadosDelCelular(multi, es, CREADOR))).toEqual(['e1'])
    expect(ids(equiposTerminadosDelCelular(multi, es, PEDRO))).toEqual([])
    expect(ids(equiposTerminadosDelCelular(multi, es, JUAN))).toEqual([]) // no anota ninguno
    // Creador que terminó el suyo pero anota otro sin terminar (lo tomó a mano): sigue anotando.
    expect(ids(equiposTerminadosDelCelular(multi, es, CREADOR, new Set(['e3'])))).toEqual([])
    expect(ids(equiposTerminadosDelCelular(unCelular, [term(club('e1', null))], CREADOR))).toEqual([])
  })
  it('entrada al scorer: con todo lo suyo terminado va a la vista en vivo (creador incluido)', () => {
    const es = [term(club('e1', CREADOR)), term(club('e2', PEDRO)), club('e3', null)]
    expect(entradaAlScorerDeEquipos(multi, es, CREADOR)).toBe('en_vivo')
    expect(entradaAlScorerDeEquipos(multi, es, PEDRO)).toBe('en_vivo')
    expect(entradaAlScorerDeEquipos(multi, es, JUAN)).toBe('elegir_equipo')
    expect(entradaAlScorerDeEquipos(multi, es, CREADOR, new Set(['e3']))).toBe('anota')
    expect(entradaAlScorerDeEquipos(multi, [club('e1', CREADOR), term(club('e2', PEDRO))], CREADOR)).toBe('anota')
  })
})
