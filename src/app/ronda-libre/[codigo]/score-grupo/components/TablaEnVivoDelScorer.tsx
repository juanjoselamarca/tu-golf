'use client'

import { useMemo, useState } from 'react'
import { TeamLeaderboards } from '../../components/TeamLeaderboards'
import { isSharedBallFormat } from '@/golf/formats'
import { crearHcpAMostrar } from '@/lib/data/ronda-libre-live-api'
import { fechaDeLaRonda } from '@/lib/ronda/fecha-de-la-ronda'
import type { HoleData, RondaLibre } from '@/types/ronda'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

interface TablaEnVivoDelScorerProps {
  ronda: RondaLibre
  /** Los equipos que anota este celular (con los golpes recién tocados). */
  propios: readonly EquipoDelScorer[]
  /** Los de otro celular (un celular por equipo): el scorer los relee solo, cada pocos segundos. */
  ajenos: readonly EquipoDelScorer[]
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
  playerDisplayHcp: Record<string, number>
}

/**
 * Pestaña «Leaderboard» del scorer de bola compartida (scramble, foursome; Juanjo, 26-nov): la misma tabla que ve el espectador
 * (`TeamLeaderboards`, con el % de ganar del scramble), armada con lo que el scorer ya tiene. No abre otra conexión:
 * los equipos propios van con lo anotado en este celular y los ajenos con la última relectura del scorer. Solo bola
 * compartida: ahí los golpes viven en el equipo (`EquipoDelScorer.scores`); en best ball viven por jugador y la tabla
 * los leería de la ronda cargada al abrir, no de lo recién anotado (revisión Fable).
 */
/** ¿El scorer va con «Scorecard» / «Leaderboard» arriba? Timba y bola compartida; best ball no (ver arriba). */
export function scorerConPestanas(formato: string | null | undefined, esTimba: boolean): boolean {
  return esTimba || isSharedBallFormat(formato)
}

export function TablaEnVivoDelScorer({ ronda, propios, ajenos, parMap, holeDataMap, playerHcp, playerDisplayHcp }: TablaEnVivoDelScorerProps) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const equipos = useMemo(() => {
    const propiosIds = new Set(propios.map(e => e.id))
    return [...propios, ...ajenos.filter(e => !propiosIds.has(e.id))]
  }, [propios, ajenos])
  const siMap = useMemo(() => {
    const m: Record<number, number> = {}
    for (const [h, d] of Object.entries(holeDataMap)) if (d?.stroke_index != null) m[Number(h)] = d.stroke_index
    return m
  }, [holeDataMap])
  // El scorer leyó los perfiles con sesión: el HCP que muestra la tarjeta es el mismo que va acá. `sinIndice` va
  // vacío porque solo best ball pinta HCP individual y esta tabla es de bola compartida (`scorerConPestanas`).
  const hcpAMostrar = useMemo(
    () => crearHcpAMostrar(ronda.ronda_libre_jugadores, playerDisplayHcp, [], 'todos'),
    [ronda.ronda_libre_jugadores, playerDisplayHcp],
  )
  if (equipos.length === 0 || Object.keys(parMap).length === 0) {
    return <p style={{ padding: '24px 12px', textAlign: 'center', fontSize: '14px', color: 'var(--text-2)' }}>La tabla aparece cuando haya equipos en la ronda.</p>
  }
  return (
    <TeamLeaderboards
      ronda={ronda}
      equipos={equipos}
      parMap={parMap}
      siMap={siMap}
      courseHcpMap={playerHcp}
      hcpAMostrar={hcpAMostrar}
      fechaDisplay={fechaDeLaRonda(ronda.fecha)}
      expandedTeam={expandido}
      onToggleTeam={(id) => setExpandido(prev => prev === id ? null : id)}
      enVivo
    />
  )
}
