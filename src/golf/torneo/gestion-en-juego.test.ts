import { describe, expect, it } from 'vitest'
import {
  equipoAlPie,
  equipoIncompleto,
  estadoDelInscrito,
  handicapDeEquipoCalculable,
  motivoParaNoColocar,
  motivoTamanoDeEquipo,
  mensajeDeMotivo,
  esCodigoMotivoColocar,
  politicaDeColocar,
  MENSAJE_MOTIVO_DESCONOCIDO,
  type CodigoMotivoColocar,
  tarjetaTieneAnotaciones,
  type CodigoMotivoNoColocar,
  type GrupoEnJuego,
  type InscritoAColocar,
  type OperacionEnJuego,
} from './gestion-en-juego'
import { CONCEDE } from '@/golf/formats/match-play'
import type { TeamHandicapConfig } from '@/golf/formats/team-handicap'

const HOYOS_18 = Array.from({ length: 18 }, (_, i) => i + 1)
const HOYOS_9_DESDE_EL_10 = [10, 11, 12, 13, 14, 15, 16, 17, 18]

describe('tarjetaTieneAnotaciones', () => {
  it('sin scores o vacía: no', () => {
    expect(tarjetaTieneAnotaciones(null, HOYOS_18)).toBe(false)
    expect(tarjetaTieneAnotaciones(undefined, HOYOS_18)).toBe(false)
    expect(tarjetaTieneAnotaciones({}, HOYOS_18)).toBe(false)
  })
  it('un hoyo anotado, con clave string (JSONB) o numérica (scorer): sí', () => {
    expect(tarjetaTieneAnotaciones({ '3': 5 }, HOYOS_18)).toBe(true)
    expect(tarjetaTieneAnotaciones({ 3: 5 }, HOYOS_18)).toBe(true)
  })
  it('un hoyo concedido en match play ya es un match en juego', () => {
    expect(tarjetaTieneAnotaciones({ '1': CONCEDE }, HOYOS_18)).toBe(true)
  })
  it('null en un hoyo no es una anotación', () => {
    expect(tarjetaTieneAnotaciones({ '1': null }, HOYOS_18)).toBe(false)
  })
  it('recorre los hoyos de la ronda: un 9 desde el 10 con golpes en el 12', () => {
    expect(tarjetaTieneAnotaciones({ '12': 4 }, HOYOS_9_DESDE_EL_10)).toBe(true)
  })
})

describe('equipoAlPie (espejo de estadoDelEquipo*)', () => {
  it('foursome: con un WD/DQ la pareja entera va al pie', () => {
    expect(equipoAlPie('foursome', { miembros: 1, integrantes: 2 })).toBe(true)
    expect(equipoAlPie('foursome', { miembros: 2, integrantes: 2 })).toBe(false)
  })
  it('mejor bola: solo sin nadie compitiendo y con alguna fila', () => {
    expect(equipoAlPie('best_ball', { miembros: 0, integrantes: 2 })).toBe(true)
    expect(equipoAlPie('best_ball', { miembros: 1, integrantes: 2 })).toBe(false)
    expect(equipoAlPie('best_ball', { miembros: 0, integrantes: 0 })).toBe(false)
  })
  it('scramble e individuales: nunca al pie por un WD/DQ', () => {
    expect(equipoAlPie('scramble', { miembros: 0, integrantes: 2 })).toBe(false)
    expect(equipoAlPie('stroke_play', { miembros: 0, integrantes: 1 })).toBe(false)
    expect(equipoAlPie('match_play', { miembros: 0, integrantes: 1 })).toBe(false)
  })
})

describe('equipoIncompleto (D5, D7, D14) / motivoTamanoDeEquipo', () => {
  const g = (miembros: number, integrantes: number, tieneGolpes = false) => ({ miembros, integrantes, tieneGolpes })
  it('individuales y formato desconocido: nunca incompleto', () => {
    for (const f of ['stroke_play', 'stableford', 'match_play', null, 'inventado']) expect(equipoIncompleto(f, g(1, 1))).toBe(false)
  })
  it('D14 mejor bola: nunca incompleto, uno solo juega (R23.4), también en un grupo nuevo', () => {
    expect(equipoIncompleto('best_ball', g(1, 1))).toBe(false)
    expect(equipoIncompleto('best_ball', g(1, 1, true))).toBe(false)
    expect(equipoIncompleto('best_ball', g(1, 2, true))).toBe(false)
  })
  it('bola compartida: bajo el mínimo sí; completo o vacío no', () => {
    expect(equipoIncompleto('scramble', g(1, 1))).toBe(true)
    expect(equipoIncompleto('foursome', g(1, 1))).toBe(true)
    expect(equipoIncompleto('scramble', g(4, 4))).toBe(false)
    expect(equipoIncompleto('foursome', g(2, 2))).toBe(false)
    expect(equipoIncompleto('scramble', g(0, 0))).toBe(false)
  })
  it('D14 con golpes cuentan las FILAS: un equipo con un WD que ya juega sigue con quien queda', () => {
    expect(equipoIncompleto('scramble', g(1, 2, true))).toBe(false)
    expect(equipoIncompleto('foursome', g(1, 2, true))).toBe(false)
    expect(equipoIncompleto('scramble', g(1, 1, true))).toBe(true)
  })
  it('D14 sin golpes cuentan los que COMPITEN: los WD/DQ no completan', () => {
    // Scramble sin golpes (0 compiten, 2 WD) + agregar a X → (1, 3).
    expect(equipoIncompleto('scramble', g(0 + 1, 2 + 1))).toBe(true)
    // Scramble sin golpes (2 compiten, 1 WD) − mover a A → (1, 2).
    expect(equipoIncompleto('scramble', g(2 - 1, 3 - 1))).toBe(true)
    // Foursome sin golpes (0 compiten, 2 WD) + agregar a uno → (1, 3).
    expect(equipoIncompleto('foursome', g(0 + 1, 2 + 1))).toBe(true)
    expect(equipoIncompleto('scramble', g(2, 3))).toBe(false)
  })
  it('mensaje igual al del inicio; los grupos vacíos no cuentan', () => {
    const g = (name: string, n: number) => ({ name, players: Array.from({ length: n }) })
    expect(motivoTamanoDeEquipo('scramble', [g('A', 2), g('B', 0)])).toBeNull()
    expect(motivoTamanoDeEquipo('foursome', [g('Pareja 1', 3)])).toBe(
      'Tamaño de equipo incorrecto. En Foursome, cada equipo debe tener 2 jugadores. Corrige: "Pareja 1" (3).',
    )
    expect(motivoTamanoDeEquipo('scramble', [g('Equipo 5', 5)])).toMatch(/2 a 4 jugadores/)
    expect(motivoTamanoDeEquipo('stroke_play', [g('A', 7)])).toBeNull()
  })
})

describe('estadoDelInscrito', () => {
  it('separa retirado de sin aprobar', () => {
    expect(estadoDelInscrito('approved')).toBe('compite')
    expect(estadoDelInscrito('withdrawn')).toBe('retirado')
    expect(estadoDelInscrito('disqualified')).toBe('retirado')
    expect(estadoDelInscrito('pending')).toBe('sin-aprobar')
    expect(estadoDelInscrito('waitlist')).toBe('sin-aprobar')
    expect(estadoDelInscrito(null)).toBe('sin-aprobar')
  })
})

describe('handicapDeEquipoCalculable', () => {
  it('personalizado de scramble definido para 4: no calcula con 3', () => {
    const cfg: TeamHandicapConfig = { modo: 'personalizado', porcentajes: [25, 20, 15, 10] }
    expect(handicapDeEquipoCalculable('scramble', 4, cfg)).toBe(true)
    expect(handicapDeEquipoCalculable('scramble', 3, cfg)).toBe(false)
  })
  it('foursome: personalizado con porcentaje_suma calcula; con la forma de scramble (porcentajes) no', () => {
    expect(handicapDeEquipoCalculable('foursome', 2, { modo: 'personalizado', porcentaje_suma: 40 })).toBe(true)
    expect(handicapDeEquipoCalculable('foursome', 2, { modo: 'personalizado', porcentajes: [50, 50] })).toBe(false)
  })
  it('fuera de bola compartida no hay hándicap de equipo', () => {
    expect(handicapDeEquipoCalculable('best_ball', 3, null)).toBe(true)
  })
})

// ─── motivoParaNoColocar: tabla formato × operación × golpes ─────────────────

/** `integrantes` por defecto = `miembros` (sin WD/DQ en la tarjeta). */
const G = (id: string, miembros: number, tieneGolpes = false, integrantes = miembros): GrupoEnJuego => ({
  id, miembros, integrantes, tieneGolpes,
})
const ACTIVO: InscritoAColocar = { tieneGolpes: false, estado: 'compite', tieneFila: true }
const ACTIVO_CON_GOLPES: InscritoAColocar = { tieneGolpes: true, estado: 'compite', tieneFila: true }
const WD: InscritoAColocar = { tieneGolpes: false, estado: 'retirado', tieneFila: true }
const PENDIENTE: InscritoAColocar = { tieneGolpes: false, estado: 'sin-aprobar', tieneFila: false }
const PERSONALIZADO_4: TeamHandicapConfig = { modo: 'personalizado', porcentajes: [25, 20, 15, 10] }

type Caso = {
  nombre: string
  format: string | null
  op: OperacionEnJuego
  inscrito?: InscritoAColocar
  handicap?: TeamHandicapConfig | null
  esperado: CodigoMotivoNoColocar | null
}

const casos: Caso[] = [
  // ── Stroke play (individual) ──
  { nombre: 'individual · agregar a grupo sin golpes', format: 'stroke_play', op: { tipo: 'agregar', destino: G('d', 3) }, esperado: null },
  { nombre: 'D4 individual · agregar a grupo con golpes (se confirma, no se bloquea)', format: 'stroke_play', op: { tipo: 'agregar', destino: G('d', 3, true) }, esperado: null },
  { nombre: 'individual · mover sin golpes', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 3) }, esperado: null },
  { nombre: 'D2 individual · mover con golpes (se lleva sus golpes)', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 1, true), destino: G('d', 3, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: null },
  { nombre: 'individual · mover al mismo grupo', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 3), destino: G('o', 3) }, esperado: 'mismo-grupo' },
  { nombre: 'D1 individual · borrar sin golpes: se elimina', format: 'stroke_play', op: { tipo: 'borrar', origen: G('o', 3, true) }, esperado: null },
  { nombre: 'D1 individual · borrar con golpes: WD', format: 'stroke_play', op: { tipo: 'borrar', origen: G('o', 3, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },
  { nombre: 'D1 · borrar inscrito sin grupo y sin golpes', format: 'stroke_play', op: { tipo: 'borrar', origen: null }, esperado: null },
  { nombre: 'D1 · inscrito sin grupo con golpes en su tarjeta individual (#828): WD', format: 'stroke_play', op: { tipo: 'borrar', origen: null }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },
  { nombre: 'D1 · un WD con golpes tampoco se elimina (y no se le ofrece retirar)', format: 'stroke_play', op: { tipo: 'borrar', origen: G('o', 2, true, 3) }, inscrito: { tieneGolpes: true, estado: 'retirado' as const, tieneFila: true }, esperado: 'borrar-con-golpes' },
  { nombre: 'D8 · un DQ de un match en juego no se elimina ni pasa a WD', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 1, true, 2) }, inscrito: { tieneGolpes: false, estado: 'retirado' as const, tieneFila: true }, esperado: 'borrar-match-en-juego' },

  // ── Stableford (individual) ──
  { nombre: 'stableford · agregar', format: 'stableford', op: { tipo: 'agregar', destino: G('d', 2) }, esperado: null },
  { nombre: 'D2 stableford · mover con golpes', format: 'stableford', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 2, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: null },
  { nombre: 'D1 stableford · borrar sin golpes', format: 'stableford', op: { tipo: 'borrar', origen: G('o', 2, true) }, esperado: null },
  { nombre: 'D1 stableford · borrar con golpes: WD', format: 'stableford', op: { tipo: 'borrar', origen: G('o', 2, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },

  // ── Match play (D6, D8, D10) ──
  { nombre: 'D6 · agregar a grupo de 1 sin golpes', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 1) }, esperado: null },
  { nombre: 'D6 · agregar a grupo de 1 con golpes', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 1, true) }, esperado: 'match-play-con-golpes' },
  { nombre: 'D10 · agregar un tercero a un match sin golpes', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 2) }, esperado: 'match-play-grupo-lleno' },
  { nombre: 'D10 · mover un tercero a un match sin golpes', format: 'match_play', op: { tipo: 'mover', origen: G('o', 1), destino: G('d', 2) }, esperado: 'match-play-grupo-lleno' },
  { nombre: 'D10 · el WD también ocupa su lugar en la tarjeta', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 1, false, 2) }, esperado: 'match-play-grupo-lleno' },
  { nombre: 'D6 · mover sin golpes en ninguno', format: 'match_play', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 1) }, esperado: null },
  { nombre: 'D6 · mover con golpes en el origen', format: 'match_play', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 1) }, esperado: 'match-play-con-golpes' },
  { nombre: 'D6 · mover con golpes en el destino', format: 'match_play', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 1, true) }, esperado: 'match-play-con-golpes' },
  { nombre: 'D1 match play · borrar con golpes: WD', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 2, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },
  { nombre: 'D8 · borrar sin golpes cuando el rival ya anotó: WD', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 2, true) }, esperado: 'borrar-match-en-juego' },
  { nombre: 'D1 match play · borrar sin golpes de un grupo sin golpes', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 2) }, esperado: null },

  // ── Mejor bola (D2, D7, D9) ──
  { nombre: 'D9 mejor bola · agregar a equipo con golpes y cupo', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 2, true) }, esperado: null },
  { nombre: 'mejor bola · agregar a equipo lleno', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 4) }, esperado: 'equipo-lleno' },
  { nombre: 'D5 mejor bola · agregar a equipo en formación (vacío)', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 0) }, esperado: null },
  { nombre: 'mejor bola · mover sin golpes en ninguno', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 2) }, esperado: null },
  { nombre: 'D2 mejor bola · mover con golpes en el origen', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 3, true), destino: G('d', 2) }, esperado: 'mejor-bola-con-golpes' },
  { nombre: 'D2 mejor bola · mover con golpes solo en el destino', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 2, true) }, esperado: 'mejor-bola-con-golpes' },
  { nombre: 'D7 mejor bola · mover dejando el origen sin golpes bajo el mínimo', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 2) }, esperado: null },
  { nombre: 'mejor bola · mover el único del origen (queda vacío)', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 1), destino: G('d', 2) }, esperado: null },
  { nombre: 'D1 mejor bola · borrar con golpes: WD', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 3, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },
  { nombre: 'D1 mejor bola · borrar sin golpes de un equipo de 3 con golpes', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 3, true) }, esperado: null },
  { nombre: 'D7 mejor bola · borrar sin golpes de una pareja sin golpes (queda en 1)', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 2) }, esperado: null },
  { nombre: 'D14 mejor bola · borrar sin golpes dejando en 1 una pareja con golpes: el compañero juega solo', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 2, true) }, esperado: null },
  { nombre: 'D1/D14 mejor bola · el WD sin golpes se elimina y el compañero sigue solo (R23.4)', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 1, true, 2) }, inscrito: WD, esperado: null },
  { nombre: 'mejor bola · eliminar al último que compite de un equipo con golpes (iría al pie)', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 1, true, 2) }, esperado: 'equipo-con-golpes-incompleto' },
  { nombre: 'D14 mejor bola · agregar a un grupo nuevo (uno solo juega)', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 0) }, esperado: null },
  { nombre: 'D1 scramble · un WD de un equipo con golpes no se elimina (los golpes son del equipo)', format: 'scramble', op: { tipo: 'borrar', origen: G('o', 1, true, 2) }, inscrito: WD, esperado: 'borrar-con-golpes' },
  { nombre: 'D14 scramble · borrar a un WD de un equipo sin golpes', format: 'scramble', op: { tipo: 'borrar', origen: G('o', 1, false, 2) }, inscrito: WD, esperado: null },
  { nombre: 'mejor bola · borrar al WD sin golpes de un equipo de 3 con golpes', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 2, true, 3) }, inscrito: WD, esperado: null },
  { nombre: 'mejor bola · agregar a una pareja con golpes ya al pie (los dos WD)', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 0, true, 2) }, esperado: 'equipo-al-pie' },
  { nombre: 'D12 mejor bola · un sin aprobar tampoco saca del pie a una pareja con golpes', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 0, true, 2) }, inscrito: PENDIENTE, esperado: 'equipo-al-pie' },
  { nombre: 'mejor bola · mover a una pareja con golpes ya al pie', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 0, true, 2) }, esperado: 'mejor-bola-con-golpes' },
  { nombre: 'mejor bola · agregar a una pareja sin golpes con los dos WD: se rearma', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 0, false, 2) }, esperado: null },
  { nombre: 'mejor bola · agregar a un equipo con golpes y un WD, con activos: no está al pie', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 1, true, 2) }, esperado: null },
  { nombre: 'mejor bola · borrar al WD sin golpes de una pareja sin golpes (D7)', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 1, false, 2) }, inscrito: WD, esperado: null },
  { nombre: 'D11 mejor bola · un WD no se cambia de grupo', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 2, false, 3), destino: G('d', 2) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D11 individual · un DQ con golpes no se cambia de grupo', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 2, true, 3), destino: G('d', 2) }, inscrito: { tieneGolpes: true, estado: 'retirado' as const, tieneFila: true }, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D11 match play · un WD no se cambia de grupo', format: 'match_play', op: { tipo: 'mover', origen: G('o', 1, false, 2), destino: G('d', 1) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },

  // ── Scramble (D3, D7) ──
  { nombre: 'D3 scramble · mover con golpes en ambos: permitido', format: 'scramble', op: { tipo: 'mover', origen: G('o', 4, true), destino: G('d', 3, true) }, esperado: null },
  { nombre: 'D3 scramble · agregar a equipo con golpes: permitido', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 3, true) }, esperado: null },
  { nombre: 'D3 scramble · un jugador no sigue solo un equipo con golpes cuyos integrantes son WD', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 0, true, 2) }, esperado: 'equipo-con-golpes-incompleto' },
  { nombre: 'D3 scramble · mover a un equipo con golpes que quedaría bajo el mínimo', format: 'scramble', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 0, true, 1) }, esperado: 'equipo-con-golpes-incompleto' },
  { nombre: 'D3 scramble · agregar a equipo lleno', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 4, true) }, esperado: 'equipo-lleno' },
  { nombre: 'D3 scramble · mover a un destino lleno', format: 'scramble', op: { tipo: 'mover', origen: G('o', 3, true), destino: G('d', 4, true) }, esperado: 'equipo-lleno' },
  { nombre: 'D3 scramble · origen con golpes bajo el mínimo', format: 'scramble', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 2, true) }, esperado: 'equipo-con-golpes-incompleto' },
  { nombre: 'D3 scramble · mover al único activo deja al equipo con golpes solo con el WD', format: 'scramble', op: { tipo: 'mover', origen: G('o', 1, true, 2), destino: G('d', 2) }, esperado: 'equipo-con-golpes-incompleto' },
  { nombre: 'D3 scramble · equipo con golpes nunca queda sin filas', format: 'scramble', op: { tipo: 'mover', origen: G('o', 1, true), destino: G('d', 2) }, esperado: 'equipo-con-golpes-sin-miembros' },
  { nombre: 'D11 scramble · su último WD no se mueve', format: 'scramble', op: { tipo: 'mover', origen: G('o', 0, true, 1), destino: G('d', 2) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D11 scramble · un WD no sale de un equipo con golpes aunque queden activos', format: 'scramble', op: { tipo: 'mover', origen: G('o', 2, true, 3), destino: G('d', 2) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D7 scramble · origen sin golpes queda en 1 (incompleto)', format: 'scramble', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 2) }, esperado: null },
  { nombre: 'D3 scramble · equipo sin golpes puede quedar vacío', format: 'scramble', op: { tipo: 'mover', origen: G('o', 1), destino: G('d', 2) }, esperado: null },
  { nombre: 'D3 scramble · personalizado para 4 y el destino queda de 3', format: 'scramble', op: { tipo: 'mover', origen: G('o', 4, true), destino: G('d', 2, true) }, handicap: PERSONALIZADO_4, esperado: 'handicap-de-equipo' },
  { nombre: 'D3 scramble · personalizado para 4 y el origen queda de 3', format: 'scramble', op: { tipo: 'mover', origen: G('o', 4, true), destino: G('d', 3, true) }, handicap: PERSONALIZADO_4, esperado: 'handicap-de-equipo' },
  { nombre: 'D5 scramble · equipo en formación: el hándicap se exige al completarse', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 0) }, handicap: PERSONALIZADO_4, esperado: null },
  { nombre: 'D1 scramble · borrar con golpes del equipo (aunque su fila esté vacía): WD', format: 'scramble', op: { tipo: 'borrar', origen: G('o', 3, true) }, esperado: 'borrar-con-golpes' },
  { nombre: 'D1 scramble · borrar sin golpes de un equipo de 3', format: 'scramble', op: { tipo: 'borrar', origen: G('o', 3) }, esperado: null },

  // ── Foursome (D3, D7, pareja exacta, R22) ──
  { nombre: 'D3 foursome · mover entre parejas completas: lleno', format: 'foursome', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 2, true) }, esperado: 'equipo-lleno' },
  { nombre: 'D7 foursome · completar una pareja incompleta con el único de otra', format: 'foursome', op: { tipo: 'mover', origen: G('o', 1), destino: G('d', 1) }, esperado: null },
  { nombre: 'D3 foursome · sacar a uno de una pareja con golpes', format: 'foursome', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 1) }, esperado: 'equipo-con-golpes-incompleto' },
  { nombre: 'D5 foursome · agregar a una pareja incompleta sin golpes', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1) }, esperado: null },
  { nombre: 'R22/D13 foursome · no se completa una pareja con golpes cuyo compañero es WD', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1, true, 2) }, esperado: 'equipo-al-pie' },
  { nombre: 'D13 foursome · se completa (agregar) una pareja sin golpes con un WD', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1, false, 2) }, esperado: null },
  { nombre: 'D13 foursome · se completa (mover) una pareja sin golpes con un WD', format: 'foursome', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 1, false, 2) }, esperado: null },
  { nombre: 'D11 foursome · un WD no se mueve a completar otra pareja', format: 'foursome', op: { tipo: 'mover', origen: G('o', 1, false, 2), destino: G('d', 1) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'R22/D13 foursome · no se completa moviendo a un activo a una pareja con golpes y un WD', format: 'foursome', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 0, true, 1) }, esperado: 'equipo-al-pie' },
  { nombre: 'D3 foursome · personalizado porcentaje_suma: se completa', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1) }, handicap: { modo: 'personalizado', porcentaje_suma: 40 }, esperado: null },
  { nombre: 'D3 foursome · personalizado con la forma de scramble: hándicap incalculable', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1) }, handicap: { modo: 'personalizado', porcentajes: [50, 50] }, esperado: 'handicap-de-equipo' },
  { nombre: 'D7 foursome · borrar sin golpes deja la pareja en 1', format: 'foursome', op: { tipo: 'borrar', origen: G('o', 2) }, esperado: null },
  { nombre: 'D1 foursome · borrar con golpes de la pareja: WD', format: 'foursome', op: { tipo: 'borrar', origen: G('o', 2, true) }, esperado: 'borrar-con-golpes' },

  // ── D11 ampliado: un WD/DQ tampoco se coloca ──
  { nombre: 'D11 stroke play · agregar a un WD sin grupo', format: 'stroke_play', op: { tipo: 'agregar', destino: G('d', 2) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D11 match play · agregar a un WD sin grupo', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 1) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D11 foursome · agregar a un WD sin grupo', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D1 · un WD sin grupo y sin golpes se puede borrar', format: 'stroke_play', op: { tipo: 'borrar', origen: null }, inscrito: WD, esperado: null },

  // ── #828 fallar cerrado: golpes en su tarjeta individual ──
  { nombre: '#828 stroke play · agregar a un inscrito con golpes en su tarjeta individual', format: 'stroke_play', op: { tipo: 'agregar', destino: G('d', 2) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'agregar-con-tarjeta-individual' },
  { nombre: '#828 scramble · agregar con golpes individuales, aunque el equipo admita', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 2) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'agregar-con-tarjeta-individual' },

  // ── D12 sin aprobar (pendiente / lista de espera): colocarlo lo aprueba; borrar lo elimina ──
  { nombre: 'D12 stroke play · agregar a un sin aprobar', format: 'stroke_play', op: { tipo: 'agregar', destino: G('d', 2) }, inscrito: PENDIENTE, esperado: null },
  { nombre: 'D12 mejor bola · mover a un sin aprobar entre equipos sin golpes', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 2) }, inscrito: PENDIENTE, esperado: null },
  { nombre: 'D12 mejor bola · un sin aprobar cuenta para el tamaño del destino', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 4) }, inscrito: PENDIENTE, esperado: 'equipo-lleno' },
  { nombre: 'D12/D10 match play · un sin aprobar no entra de tercero', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 2) }, inscrito: PENDIENTE, esperado: 'match-play-grupo-lleno' },
  { nombre: 'D12/D6 match play · un sin aprobar no entra a un match con golpes', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 1, true) }, inscrito: PENDIENTE, esperado: 'match-play-con-golpes' },
  { nombre: 'D12 scramble · sacar a un sin aprobar no resta al equipo con golpes (no tiene fila)', format: 'scramble', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 2) }, inscrito: PENDIENTE, esperado: null },
  { nombre: 'D12 foursome · un sin aprobar completa una pareja', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1) }, inscrito: PENDIENTE, esperado: null },
  { nombre: 'sin aprobar · borrar de un match en juego: se elimina, no va al pie (no tiene fila)', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 2, true) }, inscrito: PENDIENTE, esperado: null },
  { nombre: 'sin aprobar · borrar de un equipo con golpes: se elimina sin tocar la tarjeta', format: 'scramble', op: { tipo: 'borrar', origen: G('o', 2, true) }, inscrito: PENDIENTE, esperado: null },
  { nombre: 'sin aprobar · con golpes (no debería existir): falla cerrado y sin retirar', format: 'stroke_play', op: { tipo: 'borrar', origen: null }, inscrito: { tieneGolpes: true, estado: 'sin-aprobar', tieneFila: false }, esperado: 'borrar-con-golpes' },

  // ── Formato desconocido: falla cerrado ──
  { nombre: 'formato null', format: null, op: { tipo: 'borrar', origen: null }, esperado: 'formato-desconocido' },
  { nombre: 'formato inventado', format: 'inventado', op: { tipo: 'agregar', destino: G('d', 1) }, esperado: 'formato-desconocido' },
  // (a) PR3: solo se resta la fila que existe (espejo de `v_sale_f`). Un WD sin fila (se retiró antes del inicio) no deja al equipo sin filas.
  { nombre: '(a) mejor bola · borrar a un WD SIN fila de un equipo con golpes y una sola fila: se elimina', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 1, true, 1) }, inscrito: { tieneGolpes: false, estado: 'retirado', tieneFila: false }, esperado: null },
  { nombre: '(a) mejor bola · borrar a un WD CON fila (la única) de un equipo con golpes: sin miembros', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 0, true, 1) }, inscrito: { tieneGolpes: false, estado: 'retirado', tieneFila: true }, esperado: 'equipo-con-golpes-sin-miembros' },
]

const SEIS_FORMATOS = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']

describe('motivoParaNoColocar (D1-D14)', () => {
  it.each(casos)('$nombre → $esperado', ({ format, op, inscrito, handicap, esperado }) => {
    const m = motivoParaNoColocar(format, op, inscrito ?? ACTIVO, handicap ?? null)
    expect(m?.codigo ?? null).toBe(esperado)
    if (m) {
      expect(m.mensaje.length).toBeGreaterThan(0)
      // Solo D1 y D8 ofrecen "Retirar" en vez de eliminar, y nunca a quien ya es WD/DQ.
      const compite = (inscrito ?? ACTIVO).estado === 'compite'
      const retirar = compite && (m.codigo === 'borrar-con-golpes' || m.codigo === 'borrar-match-en-juego')
      expect(m.ofreceRetirar).toBe(retirar)
      expect(m.mensaje.includes('Retíralo')).toBe(retirar)
      // "Sigue al pie" (sobre él) solo para quien tiene fila y ya está fuera (WD/DQ), nunca para un sin aprobar.
      if ((inscrito ?? ACTIVO).estado === 'sin-aprobar') expect(m.mensaje).not.toMatch(/sigue al pie/i)
    }
  })

  it('cubre los seis formatos × las tres operaciones', () => {
    for (const f of SEIS_FORMATOS) {
      for (const t of ['agregar', 'mover', 'borrar'] as const) {
        expect(casos.some((c) => c.format === f && c.op.tipo === t), `${f} × ${t}`).toBe(true)
      }
    }
  })
})

describe('mensajes de los motivos (d): un solo mapa, español sin voseo', () => {
  const TODOS: CodigoMotivoColocar[] = [
    'formato-desconocido', 'mismo-grupo', 'retirado-no-se-mueve', 'agregar-con-tarjeta-individual', 'borrar-con-golpes',
    'borrar-match-en-juego', 'match-play-grupo-lleno', 'match-play-con-golpes', 'mejor-bola-con-golpes', 'equipo-lleno',
    'equipo-al-pie', 'equipo-con-golpes-incompleto', 'equipo-con-golpes-sin-miembros', 'handicap-de-equipo',
    'conflicto', 'torneo-no-en-juego', 'torneo-varias-rondas', 'tarjeta-cerrada', 'tarjeta-con-timba',
    'grupo-sin-tarjeta', 'cupo-lleno',
  ]
  it.each(TODOS)('%s tiene mensaje corto, sin voseo y sin números sin detalle', (codigo) => {
    expect(esCodigoMotivoColocar(codigo)).toBe(true)
    const m = mensajeDeMotivo(codigo)
    expect(m.length).toBeGreaterThan(10)
    expect(m.length).toBeLessThanOrEqual(120)
    expect(m).not.toMatch(/undefined|null|NaN/)
    // Voseo: "ingresá", "podés", "tenés", "recargá"…
    expect(m).not.toMatch(/(^|\s)(podés|tenés|querés|recargá|intentá|ingresá|escribinos|ampliá|retiralo)(?=[\s.,:;)]|$)/iu)
  })
  it('un código que no conocemos no tiene mensaje propio', () => {
    expect(esCodigoMotivoColocar('otra-cosa')).toBe(false)
    expect(esCodigoMotivoColocar('toString')).toBe(false)
    expect(MENSAJE_MOTIVO_DESCONOCIDO.length).toBeGreaterThan(0)
  })
  it('con detalle, el mensaje lleva los números', () => {
    expect(mensajeDeMotivo('equipo-lleno', { actuales: 4, maximo: 4 })).toBe('El equipo ya tiene 4 jugadores; el máximo es 4.')
    expect(mensajeDeMotivo('equipo-con-golpes-incompleto', { enJuego: 1, minimo: 2 })).toMatch(/1 jugador en juego; el mínimo es 2/)
  })
})

describe('politicaDeColocar (b): la arma el servidor con las fuentes canónicas', () => {
  it.each([
    ['stroke_play', { equipo: false, bola_compartida: false, match_play: false, al_pie_con_retirado: false, jugadores_por_equipo: null }],
    ['stableford', { equipo: false, bola_compartida: false, match_play: false, al_pie_con_retirado: false, jugadores_por_equipo: null }],
    ['match_play', { equipo: false, bola_compartida: false, match_play: true, al_pie_con_retirado: false, jugadores_por_equipo: null }],
    ['best_ball', { equipo: true, bola_compartida: false, match_play: false, al_pie_con_retirado: false, jugadores_por_equipo: { min: 2, max: 4 } }],
    ['scramble', { equipo: true, bola_compartida: true, match_play: false, al_pie_con_retirado: false, jugadores_por_equipo: { min: 2, max: 4 } }],
    ['foursome', { equipo: true, bola_compartida: true, match_play: false, al_pie_con_retirado: true, jugadores_por_equipo: { min: 2, max: 2 } }],
  ])('%s', (formato, esperado) => {
    expect(politicaDeColocar(formato)).toEqual({ formato, jugadores_por_match: 2, ...esperado })
  })
  it('formato desconocido o null → null (falla cerrado)', () => {
    expect(politicaDeColocar(null)).toBeNull()
    expect(politicaDeColocar('fourball_inventado')).toBeNull()
  })
})
