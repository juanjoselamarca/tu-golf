import { describe, expect, it } from 'vitest'
import {
  handicapDeEquipoCalculable,
  motivoParaNoColocar,
  motivoTamanoDeEquipo,
  rangoDeEquipo,
  tarjetaTieneGolpes,
  type CodigoMotivoNoColocar,
  type GrupoEnJuego,
  type OperacionEnJuego,
} from './gestion-en-juego'
import { CONCEDE } from '@/golf/formats/match-play'
import type { TeamHandicapConfig } from '@/golf/formats/team-handicap'

const HOYOS_18 = Array.from({ length: 18 }, (_, i) => i + 1)
const HOYOS_9_DESDE_EL_10 = [10, 11, 12, 13, 14, 15, 16, 17, 18]

describe('tarjetaTieneGolpes', () => {
  it('sin scores o vacía: no', () => {
    expect(tarjetaTieneGolpes(null, HOYOS_18)).toBe(false)
    expect(tarjetaTieneGolpes(undefined, HOYOS_18)).toBe(false)
    expect(tarjetaTieneGolpes({}, HOYOS_18)).toBe(false)
  })
  it('un hoyo anotado, con clave string (JSONB) o numérica (scorer): sí', () => {
    expect(tarjetaTieneGolpes({ '3': 5 }, HOYOS_18)).toBe(true)
    expect(tarjetaTieneGolpes({ 3: 5 }, HOYOS_18)).toBe(true)
  })
  it('un hoyo concedido en match play ya es un match en juego', () => {
    expect(tarjetaTieneGolpes({ '1': CONCEDE }, HOYOS_18)).toBe(true)
  })
  it('null en un hoyo no es un golpe', () => {
    expect(tarjetaTieneGolpes({ '1': null }, HOYOS_18)).toBe(false)
  })
  it('recorre los hoyos de la ronda: un 9 desde el 10 con golpes en el 12', () => {
    expect(tarjetaTieneGolpes({ '12': 4 }, HOYOS_9_DESDE_EL_10)).toBe(true)
  })
})

describe('rangoDeEquipo / motivoTamanoDeEquipo', () => {
  it('individuales: sin rango', () => {
    for (const f of ['stroke_play', 'stableford', 'match_play', null]) expect(rangoDeEquipo(f)).toBeNull()
  })
  it('equipos: el rango de FORMAT_META', () => {
    expect(rangoDeEquipo('best_ball')).toEqual({ min: 2, max: 4 })
    expect(rangoDeEquipo('scramble')).toEqual({ min: 2, max: 4 })
    expect(rangoDeEquipo('foursome')).toEqual({ min: 2, max: 2 })
  })
  it('mensaje igual al del inicio; los grupos vacíos no cuentan', () => {
    const g = (name: string, n: number) => ({ name, players: Array.from({ length: n }) })
    expect(motivoTamanoDeEquipo('scramble', [g('A', 2), g('B', 0)])).toBeNull()
    expect(motivoTamanoDeEquipo('foursome', [g('Pareja 1', 3)])).toBe(
      'Tamaño de equipo incorrecto. En Foursome, cada equipo debe tener 2 jugadores. Corrige: "Pareja 1" (3).',
    )
    expect(motivoTamanoDeEquipo('stroke_play', [g('A', 7)])).toBeNull()
  })
})

describe('handicapDeEquipoCalculable', () => {
  it('personalizado de scramble definido para 4: no calcula con 3', () => {
    const cfg: TeamHandicapConfig = { modo: 'personalizado', porcentajes: [25, 20, 15, 10] }
    expect(handicapDeEquipoCalculable('scramble', 4, cfg)).toBe(true)
    expect(handicapDeEquipoCalculable('scramble', 3, cfg)).toBe(false)
  })
  it('fuera de bola compartida no hay hándicap de equipo', () => {
    expect(handicapDeEquipoCalculable('best_ball', 3, null)).toBe(true)
  })
})

// ─── motivoParaNoColocar: tabla formato × operación × golpes ─────────────────

const G = (id: string, miembros: number, tieneGolpes = false, integrantes = miembros): GrupoEnJuego => ({
  id, miembros, integrantes, tieneGolpes,
})
const ACTIVO = { tieneGolpes: false, compite: true }
const ACTIVO_CON_GOLPES = { tieneGolpes: true, compite: true }

type Caso = {
  nombre: string
  format: string
  op: OperacionEnJuego
  inscrito?: { tieneGolpes: boolean; compite: boolean }
  handicap?: TeamHandicapConfig | null
  esperado: CodigoMotivoNoColocar | null
}

const casos: Caso[] = [
  // ── Individual (stroke play / stableford) ──
  { nombre: 'individual · agregar a grupo sin golpes', format: 'stroke_play', op: { tipo: 'agregar', destino: G('d', 3) }, esperado: null },
  { nombre: 'D4 individual · agregar a grupo con golpes (se confirma, no se bloquea)', format: 'stableford', op: { tipo: 'agregar', destino: G('d', 3, true) }, esperado: null },
  { nombre: 'individual · mover sin golpes', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 3) }, esperado: null },
  { nombre: 'D2 individual · mover con golpes (se lleva sus golpes)', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 1, true), destino: G('d', 3, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: null },
  { nombre: 'individual · mover al mismo grupo', format: 'stroke_play', op: { tipo: 'mover', origen: G('o', 3), destino: G('o', 3) }, esperado: 'mismo-grupo' },
  { nombre: 'D1 individual · borrar sin golpes: se elimina', format: 'stroke_play', op: { tipo: 'borrar', origen: G('o', 3, true) }, esperado: null },
  { nombre: 'D1 individual · borrar con golpes: WD', format: 'stroke_play', op: { tipo: 'borrar', origen: G('o', 3, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },
  { nombre: 'D1 · borrar inscrito sin grupo', format: 'stroke_play', op: { tipo: 'borrar', origen: null }, esperado: null },
  { nombre: 'D1 · un WD con golpes tampoco se elimina', format: 'stroke_play', op: { tipo: 'borrar', origen: G('o', 2, true, 3) }, inscrito: { tieneGolpes: true, compite: false }, esperado: 'borrar-con-golpes' },

  // ── Match play (D6) ──
  { nombre: 'D6 · agregar a grupo sin golpes', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 1) }, esperado: null },
  { nombre: 'D6 · agregar a grupo con golpes', format: 'match_play', op: { tipo: 'agregar', destino: G('d', 2, true) }, esperado: 'match-play-con-golpes' },
  { nombre: 'D6 · mover sin golpes en ninguno', format: 'match_play', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 1) }, esperado: null },
  { nombre: 'D6 · mover con golpes en el origen', format: 'match_play', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 1) }, esperado: 'match-play-con-golpes' },
  { nombre: 'D6 · mover con golpes en el destino', format: 'match_play', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 2, true) }, esperado: 'match-play-con-golpes' },
  { nombre: 'D6+D1 · borrar con golpes: WD', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 2, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },
  { nombre: 'D6+D1 · borrar sin golpes del grupo sin golpes', format: 'match_play', op: { tipo: 'borrar', origen: G('o', 2) }, esperado: null },

  // ── Mejor bola (D2 + invariantes de tamaño) ──
  { nombre: 'D4 mejor bola · agregar a equipo con golpes y cupo', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 2, true) }, esperado: null },
  { nombre: 'mejor bola · agregar a equipo lleno', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 4) }, esperado: 'equipo-lleno' },
  { nombre: 'D5 mejor bola · agregar a equipo en formación (vacío)', format: 'best_ball', op: { tipo: 'agregar', destino: G('d', 0) }, esperado: null },
  { nombre: 'mejor bola · mover sin golpes en ninguno', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 2) }, esperado: null },
  { nombre: 'D2 mejor bola · mover con golpes en el origen', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 3, true), destino: G('d', 2) }, esperado: 'mejor-bola-con-golpes' },
  { nombre: 'D2 mejor bola · mover con golpes solo en el destino', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 3), destino: G('d', 2, true) }, esperado: 'mejor-bola-con-golpes' },
  { nombre: 'mejor bola · mover dejando el origen bajo el mínimo', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 2), destino: G('d', 2) }, esperado: 'equipo-incompleto' },
  { nombre: 'mejor bola · mover el único del origen (queda vacío)', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 1), destino: G('d', 2) }, esperado: null },
  { nombre: 'D1 mejor bola · borrar con golpes: WD', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 3, true) }, inscrito: ACTIVO_CON_GOLPES, esperado: 'borrar-con-golpes' },
  { nombre: 'D1 mejor bola · borrar sin golpes de un equipo de 3', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 3, true) }, esperado: null },
  { nombre: 'mejor bola · borrar sin golpes dejando una pareja en 1', format: 'best_ball', op: { tipo: 'borrar', origen: G('o', 2) }, esperado: 'equipo-incompleto' },
  { nombre: 'riesgo WD/DQ · mover un WD no cambia el tamaño del destino lleno', format: 'best_ball', op: { tipo: 'mover', origen: G('o', 2, false, 3), destino: G('d', 4) }, inscrito: { tieneGolpes: false, compite: false }, esperado: null },

  // ── Bola compartida: scramble (D3) ──
  { nombre: 'D3 scramble · mover con golpes en ambos: permitido', format: 'scramble', op: { tipo: 'mover', origen: G('o', 4, true), destino: G('d', 3, true) }, esperado: null },
  { nombre: 'D3 scramble · agregar a equipo con golpes: permitido', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 3, true) }, esperado: null },
  { nombre: 'D3 scramble · destino lleno', format: 'scramble', op: { tipo: 'mover', origen: G('o', 3, true), destino: G('d', 4, true) }, esperado: 'equipo-lleno' },
  { nombre: 'D3 scramble · origen bajo el mínimo', format: 'scramble', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 2, true) }, esperado: 'equipo-incompleto' },
  { nombre: 'D3 scramble · equipo con golpes nunca queda sin miembros', format: 'scramble', op: { tipo: 'mover', origen: G('o', 1, true), destino: G('d', 2) }, esperado: 'equipo-con-golpes-sin-miembros' },
  { nombre: 'D3 scramble · ni moviendo a su último WD', format: 'scramble', op: { tipo: 'mover', origen: G('o', 0, true, 1), destino: G('d', 2) }, inscrito: { tieneGolpes: false, compite: false }, esperado: 'equipo-con-golpes-sin-miembros' },
  { nombre: 'D3 scramble · equipo sin golpes puede quedar vacío', format: 'scramble', op: { tipo: 'mover', origen: G('o', 1), destino: G('d', 2) }, esperado: null },
  { nombre: 'D3 scramble · hándicap personalizado para 4 y el destino queda de 3', format: 'scramble', op: { tipo: 'mover', origen: G('o', 4, true), destino: G('d', 2, true) }, handicap: { modo: 'personalizado', porcentajes: [25, 20, 15, 10] }, esperado: 'handicap-de-equipo' },
  { nombre: 'D3 scramble · hándicap personalizado para 4 y el origen queda de 3', format: 'scramble', op: { tipo: 'mover', origen: G('o', 4, true), destino: G('d', 3, true) }, handicap: { modo: 'personalizado', porcentajes: [25, 20, 15, 10] }, esperado: 'handicap-de-equipo' },
  { nombre: 'D5 scramble · equipo en formación bajo el mínimo: el hándicap se exige al completarse', format: 'scramble', op: { tipo: 'agregar', destino: G('d', 0) }, handicap: { modo: 'personalizado', porcentajes: [25, 20, 15, 10] }, esperado: null },
  { nombre: 'D1 scramble · borrar con golpes del equipo (aunque su fila esté vacía): WD', format: 'scramble', op: { tipo: 'borrar', origen: G('o', 3, true) }, esperado: 'borrar-con-golpes' },
  { nombre: 'D1 scramble · borrar sin golpes de un equipo de 3', format: 'scramble', op: { tipo: 'borrar', origen: G('o', 3) }, esperado: null },

  // ── Bola compartida: foursome (D3, pareja exacta) ──
  { nombre: 'D3 foursome · mover entre parejas completas: lleno', format: 'foursome', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 2, true) }, esperado: 'equipo-lleno' },
  { nombre: 'D3 foursome · completar una pareja con golpes desde un grupo de 1 sin golpes', format: 'foursome', op: { tipo: 'mover', origen: G('o', 1), destino: G('d', 1, true) }, esperado: null },
  { nombre: 'D3 foursome · sacar a uno de una pareja con golpes', format: 'foursome', op: { tipo: 'mover', origen: G('o', 2, true), destino: G('d', 1) }, esperado: 'equipo-incompleto' },
  { nombre: 'D3 foursome · agregar a una pareja incompleta con golpes', format: 'foursome', op: { tipo: 'agregar', destino: G('d', 1, true) }, esperado: null },
  { nombre: 'D1 foursome · borrar sin golpes deja la pareja en 1', format: 'foursome', op: { tipo: 'borrar', origen: G('o', 2) }, esperado: 'equipo-incompleto' },
]

describe('motivoParaNoColocar (D1-D6)', () => {
  it.each(casos)('$nombre → $esperado', ({ format, op, inscrito, handicap, esperado }) => {
    const m = motivoParaNoColocar(format, op, inscrito ?? ACTIVO, handicap ?? null)
    expect(m?.codigo ?? null).toBe(esperado)
    if (m) expect(m.mensaje.length).toBeGreaterThan(0)
  })

  it('cubre los seis formatos y las tres operaciones', () => {
    const formatos = new Set(casos.map((c) => c.format))
    for (const f of ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']) expect(formatos).toContain(f)
    for (const t of ['agregar', 'mover', 'borrar'] as const) {
      for (const f of ['stroke_play', 'match_play', 'best_ball', 'scramble', 'foursome']) {
        expect(casos.some((c) => c.format === f && c.op.tipo === t), `${f} × ${t}`).toBe(true)
      }
    }
  })
})
