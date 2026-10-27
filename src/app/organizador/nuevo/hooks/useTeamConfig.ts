// src/app/organizador/nuevo/hooks/useTeamConfig.ts
//
// Lógica de la sección "Equipos" del wizard: lee `team_config` (aceptando la
// forma vieja) y arma cada cambio. Las transformaciones son funciones puras
// (testeadas aparte); el hook solo las conecta con `applyChange`.
//
// Reglas:
//   - Ausente = oficial. Best ball no usa handicap de equipo (no se escribe).
//   - Al elegir "Personalizado" se parte de la asignación oficial (scramble:
//     un % por posición; foursome: % de la suma).
//   - Cambiar el tamaño con un personalizado de scramble vuelve sus % a los
//     oficiales del nuevo tamaño: un % por jugador, nunca un largo distinto.
//   - Un personalizado sin % (lo puede proponer la IA) se muestra vacío; el
//     primer % que se escribe completa el resto con los oficiales.

import { useMemo } from 'react'
import type { TeamConfig, TeamHandicapConfig, TournamentConfig } from '@/lib/draft/types'
import { leerTeamConfig } from '@/lib/draft/team-config-legacy'
import {
  asignacionOficialScramble, FOURSOME_PCT_SUMA_OFICIAL, type TamanoEquipo,
} from '@/golf/formats/team-handicap'

export type { TamanoEquipo }
export type ModoHandicapEquipo = TeamHandicapConfig['modo']

const DEFAULT_TEAM_CONFIG: TeamConfig = { size: 2, formation_mode: 'manual' }

/** team_config del borrador en la forma nueva, con defaults para lo que falte. */
export function resolverTeamConfig(raw: unknown): TeamConfig {
  const leido = leerTeamConfig(raw) ?? {}
  const size = leido.size === 3 || leido.size === 4 ? leido.size : 2
  return { ...DEFAULT_TEAM_CONFIG, ...leido, size }
}

export function modoDeHandicap(tc: TeamConfig): ModoHandicapEquipo {
  return tc.handicap?.modo === 'personalizado' ? 'personalizado' : 'oficial'
}

/** Porcentajes guardados del scramble personalizado, o null si no hay (o no calzan con el tamaño). */
export function porcentajesGuardados(tc: TeamConfig): readonly number[] | null {
  const h = tc.handicap
  return h?.modo === 'personalizado' && 'porcentajes' in h && Array.isArray(h.porcentajes) ? h.porcentajes : null
}

/** % de la suma guardado del foursome personalizado, o null. */
export function porcentajeSumaGuardado(tc: TeamConfig): number | null {
  const h = tc.handicap
  return h?.modo === 'personalizado' && 'porcentaje_suma' in h && typeof h.porcentaje_suma === 'number'
    ? h.porcentaje_suma
    : null
}

function oficialesScramble(size: TamanoEquipo): number[] {
  return [...(asignacionOficialScramble(size) ?? [])]
}

export function conTamano(tc: TeamConfig, size: TamanoEquipo): TeamConfig {
  if (porcentajesGuardados(tc)) {
    return { ...tc, size, handicap: { modo: 'personalizado', porcentajes: oficialesScramble(size) } }
  }
  return { ...tc, size }
}

export function conModo(tc: TeamConfig, formato: TournamentConfig['format'], modo: ModoHandicapEquipo): TeamConfig {
  if (modo === modoDeHandicap(tc)) return tc
  if (modo === 'oficial') return { ...tc, handicap: { modo: 'oficial' } }
  const handicap: TeamHandicapConfig = formato === 'foursome'
    ? { modo: 'personalizado', porcentaje_suma: FOURSOME_PCT_SUMA_OFICIAL }
    : { modo: 'personalizado', porcentajes: oficialesScramble(tc.size) }
  return { ...tc, handicap }
}

/** Fija el % del jugador en `posicion` (0 = menor handicap). */
export function conPorcentaje(tc: TeamConfig, posicion: number, valor: number): TeamConfig {
  const actuales = porcentajesGuardados(tc)
  const base = actuales && actuales.length === tc.size ? [...actuales] : oficialesScramble(tc.size)
  base[posicion] = valor
  return { ...tc, handicap: { modo: 'personalizado', porcentajes: base } }
}

export function conPorcentajeSuma(tc: TeamConfig, valor: number): TeamConfig {
  return { ...tc, handicap: { modo: 'personalizado', porcentaje_suma: valor } }
}

export function useTeamConfig(
  config: TournamentConfig,
  applyChange: (partial: Partial<TournamentConfig>) => void,
) {
  const tc = useMemo(() => resolverTeamConfig(config.team_config), [config.team_config])
  const guardar = (next: TeamConfig) => applyChange({ team_config: next })

  return {
    tc,
    modo: modoDeHandicap(tc),
    porcentajes: porcentajesGuardados(tc),
    porcentajeSuma: porcentajeSumaGuardado(tc),
    setTamano: (size: TamanoEquipo) => guardar(conTamano(tc, size)),
    setModo: (modo: ModoHandicapEquipo) => {
      const next = conModo(tc, config.format, modo)
      if (next !== tc) guardar(next)
    },
    setPorcentaje: (posicion: number, valor: number) => guardar(conPorcentaje(tc, posicion, valor)),
    setPorcentajeSuma: (valor: number) => guardar(conPorcentajeSuma(tc, valor)),
    setFormationMode: (formation_mode: TeamConfig['formation_mode']) => guardar({ ...tc, formation_mode }),
    setMinDrives: (min: number) => guardar({ ...tc, min_drives_per_player: min }),
  }
}
