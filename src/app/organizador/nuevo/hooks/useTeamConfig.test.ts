// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { TeamConfig, TournamentConfig } from '@/lib/draft/types'
import {
  resolverTeamConfig, modoDeHandicap, conTamano, conModo, conPorcentaje, conPorcentajeSuma, useTeamConfig,
} from './useTeamConfig'

const tc = (over: Partial<TeamConfig> = {}): TeamConfig => ({ size: 2, formation_mode: 'manual', ...over })

describe('resolverTeamConfig', () => {
  it('sin team_config → parejas, armado manual, handicap oficial', () => {
    const r = resolverTeamConfig(undefined)
    expect(r).toEqual({ size: 2, formation_mode: 'manual' })
    expect(modoDeHandicap(r)).toBe('oficial')
  })

  it('forma vieja guardada → forma nueva', () => {
    expect(resolverTeamConfig({ size: 3, handicap_pct: 'usga_25_15', formation_mode: 'random' }))
      .toEqual({ size: 3, formation_mode: 'random', handicap: { modo: 'oficial' } })
    const custom = resolverTeamConfig({ size: 2, handicap_pct: 'custom', handicap_pct_custom: { lower_pct: 60, higher_pct: 40 }, formation_mode: 'manual' })
    expect(custom.handicap).toEqual({ modo: 'personalizado', porcentajes: [60, 40] })
  })
})

describe('transformaciones', () => {
  it('Personalizado parte de la asignación oficial del tamaño (scramble) o del 50 % (foursome)', () => {
    expect(conModo(tc({ size: 3 }), 'scramble', 'personalizado').handicap)
      .toEqual({ modo: 'personalizado', porcentajes: [30, 20, 10] })
    expect(conModo(tc(), 'foursome', 'personalizado').handicap)
      .toEqual({ modo: 'personalizado', porcentaje_suma: 50 })
  })

  it('volver a Oficial descarta los porcentajes', () => {
    const p = tc({ handicap: { modo: 'personalizado', porcentajes: [40, 10] } })
    expect(conModo(p, 'scramble', 'oficial').handicap).toEqual({ modo: 'oficial' })
  })

  it('elegir el modo que ya está no cambia nada', () => {
    const p = tc({ handicap: { modo: 'personalizado', porcentajes: [40, 10] } })
    expect(conModo(p, 'scramble', 'personalizado')).toBe(p)
  })

  it('cambiar el tamaño con un personalizado deja un % por jugador (los oficiales del tamaño nuevo)', () => {
    const p = tc({ handicap: { modo: 'personalizado', porcentajes: [40, 10] } })
    expect(conTamano(p, 4)).toEqual(tc({ size: 4, handicap: { modo: 'personalizado', porcentajes: [25, 20, 15, 10] } }))
    expect(conTamano(tc({ handicap: { modo: 'oficial' } }), 3)).toEqual(tc({ size: 3, handicap: { modo: 'oficial' } }))
  })

  it('fijar un % cambia solo esa posición; sin % previos completa con los oficiales', () => {
    const p = tc({ size: 3, handicap: { modo: 'personalizado', porcentajes: [30, 20, 10] } })
    expect(conPorcentaje(p, 1, 25).handicap).toEqual({ modo: 'personalizado', porcentajes: [30, 25, 10] })
    const vacio = tc({ size: 2, handicap: { modo: 'personalizado' } as never })
    expect(conPorcentaje(vacio, 1, 20).handicap).toEqual({ modo: 'personalizado', porcentajes: [35, 20] })
  })

  it('un oficial con porcentajes sueltos se trata como oficial (no vuelve a Personalizado al cambiar el tamaño)', () => {
    const raro = tc({ handicap: { modo: 'oficial', porcentajes: [40, 10] } as never })
    expect(conTamano(raro, 3).handicap).toEqual({ modo: 'oficial', porcentajes: [40, 10] })
    expect(modoDeHandicap(conTamano(raro, 3))).toBe('oficial')
  })

  it('foursome: % de la suma', () => {
    expect(conPorcentajeSuma(tc(), 40).handicap).toEqual({ modo: 'personalizado', porcentaje_suma: 40 })
  })

  it('no muta el team_config de entrada', () => {
    const p = tc({ handicap: { modo: 'personalizado', porcentajes: [35, 15] } })
    conPorcentaje(p, 0, 50)
    expect(p.handicap).toEqual({ modo: 'personalizado', porcentajes: [35, 15] })
  })
})

describe('useTeamConfig', () => {
  const cfg = (team_config: unknown, format = 'scramble') =>
    ({ format, modo: 'neto', team_config } as unknown as TournamentConfig)

  it('cada cambio manda el team_config completo en la forma nueva (sin llaves viejas)', () => {
    const applyChange = vi.fn()
    const { result } = renderHook(() =>
      useTeamConfig(cfg({ size: 2, handicap_pct: 'usga_35_15', formation_mode: 'random' }), applyChange))
    result.current.setModo('personalizado')
    expect(applyChange).toHaveBeenCalledWith({
      team_config: { size: 2, formation_mode: 'random', handicap: { modo: 'personalizado', porcentajes: [35, 15] } },
    })
  })

  it('elegir el modo vigente no escribe el borrador', () => {
    const applyChange = vi.fn()
    const { result } = renderHook(() => useTeamConfig(cfg(undefined), applyChange))
    result.current.setModo('oficial')
    expect(applyChange).not.toHaveBeenCalled()
  })

  it('best ball: cambiar el armado no agrega handicap de equipo', () => {
    const applyChange = vi.fn()
    const { result } = renderHook(() => useTeamConfig(cfg({ size: 4, formation_mode: 'manual' }, 'best_ball'), applyChange))
    result.current.setFormationMode('random')
    expect(applyChange).toHaveBeenCalledWith({ team_config: { size: 4, formation_mode: 'random' } })
  })
})
