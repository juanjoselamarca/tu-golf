// Timba libre (formato `personalizado`): ninguna vista genérica de ronda libre muestra un neto ni un ranking
// falso (spec docs/specs/formato-personalizado.md, "Para el PR C"). Un test por cada entrada de la lista.
// Anotar golpes sigue igual: la tarjeta del scorer muestra los golpes y el resultado vs par del hoyo.
import { describe, it, expect } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import { rankTeams } from '@/lib/ronda/team-ranking'
import { buildLeaderboardShareData, buildShareText } from '@/lib/ronda/share'
import { crearHcpAMostrar } from '@/lib/data/ronda-libre-live-api'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'
import type { FormatoJuego, HoleData, Jugador, RondaLibre } from '@/types/ronda'
import { IndividualLeaderboard } from './components/IndividualLeaderboard'
import { TeamLeaderboards } from './components/TeamLeaderboards'
import { TEXTO_PUNTOS_DE_LA_TIMBA } from './components/AvisoPuntosDeLaTimba'
import { formatoTieneGWI } from '@/golf/stats/gwi'
import { gwiDeRondaLibre } from '@/lib/data/gwi-ronda-libre'
import { useGrupoScoreboard } from './score-grupo/hooks/useGrupoScoreboard'
import { PlayerSelectorScreen } from './score/components/PlayerSelectorScreen'
import { PlayerScoreCard } from './score-grupo/components/PlayerScoreCard'

// El tipo de la app aún no incluye `personalizado` (llega de la base como string).
const TIMBA = 'personalizado' as unknown as FormatoJuego

const parMap = { 1: 4, 2: 4, 3: 4 }
const siMap = { 1: 1, 2: 2, 3: 3 }
// Sin course handicap en el mapa (en una Timba `/live` no lo entrega) e índices declarados distintos:
// el viejo fallback `Math.round(j.handicap ?? 0)` daría un neto inventado.
const jugadores = [
  { id: 'j1', nombre: 'Juan', user_id: null, handicap: 10, tees: null, scores: { 1: 4, 2: 5, 3: 4 } },
  { id: 'j2', nombre: 'Pedro', user_id: null, handicap: 14, tees: null, scores: { 1: 5, 2: 5, 3: 5 } },
  { id: 'j3', nombre: 'Diego', user_id: null, handicap: 6, tees: null, scores: { 1: 6, 2: 4, 3: 4 } },
]
const ronda = {
  id: 'r1', codigo: 'TIMBA1', course_name: 'Los Leones', course_id: 'c1', tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-11-16', estado: 'en_curso', modo_juego: 'neto', formato_juego: TIMBA, ronda_libre_jugadores: jugadores,
} as unknown as RondaLibre
const hcpAMostrar = crearHcpAMostrar(jugadores, {}, [], 'todos')

describe('Timba libre — sin ranking ni neto genérico', () => {
  it('buildLeaderboard: no arma tabla', () => {
    expect(buildLeaderboard({
      jugadores: jugadores as never, holes: 18, hoyoInicio: 1, parMap, siMap, courseHcpMap: {},
      modoJuego: 'neto', formatoJuego: TIMBA,
    })).toEqual([])
  })

  it('rankTeams: no arma ranking de equipos', () => {
    expect(rankTeams({
      equipos: [{ id: 'e1', nombre: 'A', jugadorIds: ['j1', 'j2'], scores: {}, handicap_equipo: null, handicap_equipo_juego: null }] as never,
      jugadores: jugadores as never, parMap, siMap, courseHcpMap: {}, holes: 18, hoyoInicio: 1, formato: TIMBA, modo: 'neto',
    })).toEqual([])
  })

  it('buildShareText: no nombra un líder por golpes ni por neto', () => {
    const texto = buildShareText(ronda, parMap, siMap, {})
    expect(texto).not.toMatch(/Juan|Pedro|Diego/)
    expect(texto).toContain('Timba libre')
    expect(texto).toContain('Los Leones')
  })

  it('buildLeaderboardShareData: la imagen no lleva jugadores ordenados', () => {
    const lbFalso = buildLeaderboard({
      jugadores: jugadores as never, holes: 18, hoyoInicio: 1, parMap, siMap, courseHcpMap: {}, modoJuego: 'gross', formatoJuego: 'stroke_play',
    })
    const data = buildLeaderboardShareData({
      ronda, leaderboard: lbFalso, equipos: [], parMap, siMap, courseHcpMap: {}, fechaDisplay: '16 nov', codigo: 'TIMBA1', isFinished: false,
    })
    expect(data.players).toEqual([])
  })

  it('IndividualLeaderboard: muestra el aviso de la Timba, sin HCP ni neto', () => {
    render(
      <IndividualLeaderboard
        ronda={ronda} leaderboard={[]} isNetoMode hasCourse parMap={parMap} siMap={siMap} courseHcpMap={{}}
        hcpAMostrar={hcpAMostrar} fechaDisplay="16 nov" expanded={null} onToggleExpand={() => {}}
      />,
    )
    expect(screen.getByText(TEXTO_PUNTOS_DE_LA_TIMBA)).toBeTruthy()
    expect(screen.queryByText('HCP')).toBeNull()
    expect(screen.queryByText(/Neto/)).toBeNull()
  })

  it('TeamLeaderboards: muestra el aviso de la Timba, sin tabla', () => {
    render(
      <TeamLeaderboards
        ronda={ronda}
        equipos={[{ id: 'e1', nombre: 'Equipo 1', jugadorIds: ['j1', 'j2'], scores: { 1: 4 }, handicap_equipo: null, handicap_equipo_juego: null }] as never}
        parMap={parMap} siMap={siMap} courseHcpMap={{}} hcpAMostrar={hcpAMostrar} fechaDisplay="16 nov"
        expandedTeam={null} onToggleTeam={() => {}}
      />,
    )
    expect(screen.getByText(TEXTO_PUNTOS_DE_LA_TIMBA)).toBeTruthy()
    expect(screen.queryByText('Equipo 1')).toBeNull()
  })

  it('PlayerSelectorScreen: lista a los jugadores para anotar, sin HCP', () => {
    const conHcp = crearHcpAMostrar(jugadores, { j1: 10, j2: 14, j3: 6 }, [], 'todos')
    render(
      <PlayerSelectorScreen
        jugadores={jugadores as Jugador[]} hcpAMostrar={conHcp} formatoJuego={TIMBA}
        scores={{}} hoyoInicio={1} holes={18} onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Juan')).toBeTruthy()
    expect(screen.queryByText(/HCP/)).toBeNull()
  })

  it('PlayerScoreCard: anota golpes igual (score y vs par), sin HCP, sin neto ni golpes recibidos genéricos', () => {
    const HOYO: HoleData = { numero: 1, par: 4, stroke_index: 1, yardaje: null }
    render(
      <PlayerScoreCard
        jugador={{ id: 'j1', nombre: 'Juan', user_id: null, scores: {}, handicap: 18 }}
        playerScores={{ 1: 5 }} currentHole={1} par={4} holeData={HOYO}
        totals={{ gross: 5, vsPar: 1, out: 5, inn: 0, holesPlayed: 1, parJugado: 4 }} played={1}
        hcp={18} displayHcp={18} dotHcp={18} siAllocByHole={{ 1: 1 }} ordenHoyos={[1]} holeDataMap={{ 1: HOYO }}
        totalHoles={18} modoJuego="neto" formatoJuego={TIMBA} showNetStableford pending={false}
        onChange={() => {}} theme={SCORER_THEME}
      />,
    )
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.queryByText(/HCP/)).toBeNull()
    expect(screen.queryByText(/Net/)).toBeNull()
    expect(screen.queryByTestId('golpes-recibidos-genericos')).toBeNull()
  })

  it('GwiPanel: la página no lo monta en una Timba (formatoTieneGWI)', () => {
    expect(formatoTieneGWI('personalizado')).toBe(false)
    expect(formatoTieneGWI('stroke_play')).toBe(true)
    expect(formatoTieneGWI('best_ball')).toBe(true)
  })

  it('gwiDeRondaLibre (servidor): en una Timba no calcula ni publica el GWI, aunque el visor tenga sesión', async () => {
    const leerIndices = async () => { throw new Error('no debería leer índices en una Timba') }
    for (const modo of ['neto', 'gross']) {
      const supabase = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { ...ronda, modo_juego: modo } }) }) }) }) }
      const r = await gwiDeRondaLibre(supabase as never, 'TIMBA1', 'u1', leerIndices as never)
      expect(r?.jugadores).toEqual([])
      expect(r?.results).toEqual([])
    }
  })

  it('useGrupoScoreboard: sin golpes recibidos genéricos (hint GOLPES ni punto dorado) aunque haya hándicap', () => {
    const orden = [1, 2, 3]
    const holeDataMap: Record<number, HoleData> = Object.fromEntries(orden.map(h => [h, { numero: h, par: 4, stroke_index: h, yardaje: null }]))
    const b = renderHook(() => useGrupoScoreboard({
      ronda: { holes: 18, modo_juego: 'neto', formato_juego: TIMBA } as never,
      jugadores: jugadores as unknown as Jugador[], scores: {}, parMap, holeDataMap, playerHcp: { j1: 30, j2: 30, j3: 30 },
      equipos: [], ordenHoyos: orden, currentHole: 1, isLastHole: false, matchResult: null,
    })).result.current
    expect(b.maxStrokesOnHole).toBe(0)
    expect(orden.some(h => b.hoyoConGolpe(h))).toBe(false)
  })

  it('el aviso no nombra una pestaña que todavía no existe', () => {
    expect(TEXTO_PUNTOS_DE_LA_TIMBA).not.toMatch(/pestaña/i)
  })
})
