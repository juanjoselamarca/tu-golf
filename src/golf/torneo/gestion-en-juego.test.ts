import { describe, expect, it } from 'vitest'
import {
  equipoIncompleto,
  handicapDeEquipoCalculable,
  motivoParaNoColocar,
  motivoTamanoDeEquipo,
  tarjetaTieneAnotaciones,
  type CodigoMotivoNoColocar,
  type GrupoEnJuego,
  type OperacionEnJuego,
} from './gestion-en-juego'
import { CONCEDE } from '@/golf/formats/match-play'
import { isMatchPlayFormat, KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { FORMAT_META, type FormatoJuego } from '@/golf/core/rules'

describe('match play: una sola noción', () => {
  it('isMatchPlayFormat (esta gestión) y FORMAT_META.requiereParejas (formatoDeLaTarjetaDelGrupo) coinciden', () => {
    const claves = new Set([...KNOWN_FORMAT_KEYS, ...Object.keys(FORMAT_META)])
    for (const k of claves) {
      expect(isMatchPlayFormat(k), k).toBe(Boolean(FORMAT_META[k as FormatoJuego]?.requiereParejas))
    }
  })
})
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

describe('equipoIncompleto (D5, D7) / motivoTamanoDeEquipo', () => {
  it('individuales y formato desconocido: nunca incompleto', () => {
    for (const f of ['stroke_play', 'stableford', 'match_play', null, 'inventado']) expect(equipoIncompleto(f, 1)).toBe(false)
  })
  it('equipos: con jugadores y bajo el mínimo; vacío no', () => {
    expect(equipoIncompleto('best_ball', 1)).toBe(true)
    expect(equipoIncompleto('scramble', 1)).toBe(true)
    expect(equipoIncompleto('foursome', 1)).toBe(true)
    expect(equipoIncompleto('best_ball', 2)).toBe(false)
    expect(equipoIncompleto('scramble', 4)).toBe(false)
    expect(equipoIncompleto('foursome', 2)).toBe(false)
    expect(equipoIncompleto('scramble', 0)).toBe(false)
  })
  it('cuenta FILAS: una pareja con un WD no está incompleta (R23.4); un equipo en formación con 1 fila sí', () => {
    const conUnWd = G('e', 1, true, 2)
    expect(equipoIncompleto('best_ball', conUnWd.integrantes)).toBe(false)
    expect(equipoIncompleto('scramble', conUnWd.integrantes)).toBe(false)
    const enFormacion = G('f', 1)
    expect(equipoIncompleto('scramble', enFormacion.integrantes)).toBe(true)
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
const ACTIVO = { tieneGolpes: false, compite: true }
const ACTIVO_CON_GOLPES = { tieneGolpes: true, compite: true }
const WD = { tieneGolpes: false, compite: false }
const PERSONALIZADO_4: TeamHandicapConfig = { modo: 'personalizado', porcentajes: [25, 20, 15, 10] }

type Caso = {
  nombre: string
  format: string | null
  op: OperacionEnJuego
  inscrito?: { tieneGolpes: boolean; compite: boolean }
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
  { nombre: 'D1 · un WD con golpes tampoco se elimina (y no se le ofrece retirar)', format: 'stroke_play', op: { tipo: 'borrar', origen: G('o', 2, true, 3) }, inscrito: { tieneGolpes: true, compite: false }, esperado: 'borrar-con-golpes' },
  { nombre: 'D8 · un DQ de un match en juego no se elimina ni pasa a WD', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 1, true, 2) }, inscrito: { tieneGolpes: false, compite: false }, esperado: 'borrar-match-en-juego' },

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
  { nombre: 'mejor bola · borrar sin golpes dejando en 1 una pareja con golpes', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 2, true) }, esperado: 'equipo-con-golpes-incompleto' },
  { nombre: 'D11 mejor bola · un WD no se cambia de grupo', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 2, false, 3), destino: G('d', 2) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D11 individual · un DQ con golpes no se cambia de grupo', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 2, true, 3), destino: G('d', 2) }, inscrito: { tieneGolpes: true, compite: false }, esperado: 'retirado-no-se-mueve' },
  { nombre: 'D11 match play · un WD no se cambia de grupo', format: 'match_play', op: { tipo: 'mover', origen: G('o', 1, false, 2), destino: G('d', 1) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },

  // ── Scramble (D3, D7) ──
  { nombre: 'D3 scramble · mover con golpes en ambos: permitido', format: 'scramble', op: { tipo: 'mover', origen: G('o', 4, true), destino: G('d', 3, true) }, esperado: null },
  { nombre: 'D3 scramble · agregar a equipo con golpes: permitido', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 3, true) }, esperado: null },
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
  { nombre: 'R22 foursome · no se completa una pareja cuyo compañero es WD', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1, true, 2) }, esperado: 'foursome-con-retirado' },
  { nombre: 'D11 foursome · un WD no se mueve a completar otra pareja', format: 'foursome', op: { tipo: 'mover', origen: G('o', 1, false, 2), destino: G('d', 1) }, inscrito: WD, esperado: 'retirado-no-se-mueve' },
  { nombre: 'R22 foursome · no se completa moviendo a un activo a una pareja con un WD', format: 'foursome', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 0, true, 1) }, esperado: 'foursome-con-retirado' },
  { nombre: 'D3 foursome · personalizado porcentaje_suma: se completa', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1) }, handicap: { modo: 'personalizado', porcentaje_suma: 40 }, esperado: null },
  { nombre: 'D3 foursome · personalizado con la forma de scramble: hándicap incalculable', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1) }, handicap: { modo: 'personalizado', porcentajes: [50, 50] }, esperado: 'handicap-de-equipo' },
  { nombre: 'D7 foursome · borrar sin golpes deja la pareja en 1', format: 'foursome', op: { tipo: 'borrar', origen: G('o', 2) }, esperado: null },
  { nombre: 'D1 foursome · borrar con golpes de la pareja: WD', format: 'foursome', op: { tipo: 'borrar', origen: G('o', 2, true) }, esperado: 'borrar-con-golpes' },

  // ── Formato desconocido: falla cerrado ──
  { nombre: 'formato null', format: null, op: { tipo: 'borrar', origen: null }, esperado: 'formato-desconocido' },
  { nombre: 'formato inventado', format: 'inventado', op: { tipo: 'agregar', destino: G('d', 1) }, esperado: 'formato-desconocido' },
]

const SEIS_FORMATOS = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']

describe('motivoParaNoColocar (D1-D10)', () => {
  it.each(casos)('$nombre → $esperado', ({ format, op, inscrito, handicap, esperado }) => {
    const m = motivoParaNoColocar(format, op, inscrito ?? ACTIVO, handicap ?? null)
    expect(m?.codigo ?? null).toBe(esperado)
    if (m) {
      expect(m.mensaje.length).toBeGreaterThan(0)
      // Solo D1 y D8 ofrecen "Retirar" en vez de eliminar, y nunca a quien ya es WD/DQ.
      const compite = (inscrito ?? ACTIVO).compite
      const retirar = compite && (m.codigo === 'borrar-con-golpes' || m.codigo === 'borrar-match-en-juego')
      expect(m.ofreceRetirar).toBe(retirar)
      expect(m.mensaje.includes('Retíralo')).toBe(retirar)
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
