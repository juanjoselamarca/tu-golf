// Skins: cerrar no inventa pares (un par decidiría un hoyo con plata). Como en la Timba, solo el hoyo en pantalla
// se rellena si alguien lo anotó; el resto queda sin resolver y la hoja lo avisa (spec «Pozo y liquidación»: un
// hoyo sin anotar al cierre no se liquida solo). La X es un hoyo anotado, no uno sin jugar.
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useGrupoScoreboard } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreboard'
import { FORMATO_SKINS } from '@/golf/formats/skins/clave'
import { hojaFinalizarSkins } from '@/components/ronda/finalizar-copy'
import type { HoleData, Jugador } from '@/types/ronda'

const orden = Array.from({ length: 18 }, (_, i) => i + 1)
const parMap = Object.fromEntries(orden.map(h => [h, 4]))
const holeDataMap: Record<number, HoleData> = Object.fromEntries(orden.map(h => [h, { numero: h, par: 4, stroke_index: h, yardaje: null }]))
const jugadores = [
  { id: 'p1', nombre: 'Ana', user_id: null, scores: {} },
  { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
] as unknown as Jugador[]
const dieciseis = Object.fromEntries(orden.slice(0, 16).map(h => [h, 4]))

const montar = (scores: Record<string, Record<number, number>>, currentHole: number, fuera?: Record<string, Record<number, true>>) =>
  renderHook(() => useGrupoScoreboard({
    ronda: { holes: 18, modo_juego: 'gross', formato_juego: FORMATO_SKINS } as never,
    jugadores, scores, parMap, holeDataMap, playerHcp: {}, equipos: [], ordenHoyos: orden, currentHole,
    isLastHole: currentHole === 18, matchResult: null, fuera,
  })).result.current

describe('useGrupoScoreboard — Skins: al cerrar no se inventan pares', () => {
  it('cierran en el 18 con el 17 sin anotar: el 17 queda sin resolver (no «marcar como par»), el 18 lleva par si alguien lo anotó', () => {
    const b = montar({ p1: { ...dieciseis, 18: 4 }, p2: dieciseis }, 18)
    // Solo el 18 de Beto se rellena (es el par gris que ve el anotador); el 17 no.
    expect(b.hoyosPorMarcar).toBe(1)
    expect(b.hoyosSinJugarTimba).toEqual([17])
    expect(b.parEnPantallaTimba).toEqual({ hoyo: 18, nombres: ['Beto'] })
    expect(hojaFinalizarSkins({ hoyosSinAnotar: b.hoyosSinJugarTimba, parEnPantalla: b.parEnPantallaTimba })).toEqual({
      titulo: '¿Finalizar el skins?',
      detalle: 'El hoyo 17 no está anotado: queda sin resolver y el skins no se liquida. En el hoyo 18, Beto queda con par.',
    })
  })
  it('la X cuenta como anotado: no es un hoyo sin resolver; sin la X, el 17 aparece', () => {
    const base = { p1: { ...dieciseis, 17: 5, 18: 4 }, p2: { ...dieciseis, 18: 5 } }
    const conX = montar(base, 18, { p2: { 17: true } })
    expect(conX.hoyosSinJugarTimba).toEqual([])
    expect(conX.hoyosPorMarcar).toBe(0)
    expect(conX.parEnPantallaTimba).toBeNull()
    const sinX = montar(base, 18)
    expect(sinX.hoyosSinJugarTimba).toEqual([17])
    expect(sinX.hoyosPorMarcar).toBe(0) // el 17 no se rellena: queda sin resolver
    expect(hojaFinalizarSkins({ hoyosSinAnotar: sinX.hoyosSinJugarTimba, parEnPantalla: sinX.parEnPantallaTimba }).detalle)
      .toBe('El hoyo 17 no está anotado: queda sin resolver y el skins no se liquida.')
  })
  it('con solo una X en el hoyo en pantalla, la hoja y el cierre coinciden: el hoyo se jugó y Beto lleva par', () => {
    // Vuelta 2 Fable (P1): la hoja veía la X de Ana y el cierre no → la hoja callaba y el 18 quedaba sin resolver.
    const b = montar({ p1: { ...dieciseis, 17: 5 }, p2: { ...dieciseis, 17: 4 } }, 18, { p1: { 18: true } })
    expect(b.hoyosSinJugarTimba).toEqual([])
    expect(b.parEnPantallaTimba).toEqual({ hoyo: 18, nombres: ['Beto'] })
    expect(b.hoyosPorMarcar).toBe(1)
  })
})
