// Ensayo 24-nov: sin el hándicap del equipo en la vista, la tabla decía «HCP 0» (el motor juega un HCP ausente
// como 0, pero ese 0 no es un hándicap). Y la vista pública cuenta jugadores y equipos sin el creador estructural.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TeamLeaderboards } from './TeamLeaderboards'
import { textoDeParticipantes } from './RondaHeader'
import { participantesDeLaRonda } from '@/golf/ronda-libre/equipos-de-club'
import { crearHcpAMostrar } from '@/lib/data/ronda-libre-live-api'
import type { RondaLibre } from '@/types/ronda'

afterEach(cleanup)

const parMap = { 1: 4, 2: 4, 3: 4 }
const siMap = { 1: 1, 2: 2, 3: 3 }
const ronda = (formato_juego: string) => ({
  id: 'r1', codigo: 'SCR1', course_name: 'Los Leones', course_id: 'c1', tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-11-24', estado: 'en_curso', modo_juego: 'gross', formato_juego,
  ronda_libre_jugadores: [{ id: 'j1', nombre: 'Juan', user_id: 'u1', handicap: null, tees: null, scores: {} }],
}) as unknown as RondaLibre

function pintar(formato: string, handicap_equipo: number | null) {
  const r = ronda(formato)
  render(
    <TeamLeaderboards
      ronda={r}
      equipos={[
        { id: 'e1', nombre: 'Los Ross', jugadorIds: ['j1'], scores: { 1: 4 }, handicap_equipo, handicap_equipo_juego: handicap_equipo, handicap_origen: 'club' },
        { id: 'e2', nombre: 'Los Lamarca', jugadorIds: [], scores: { 1: 5 }, handicap_equipo, handicap_equipo_juego: handicap_equipo, handicap_origen: 'club' },
      ] as never}
      parMap={parMap} siMap={siMap} courseHcpMap={{}} hcpAMostrar={crearHcpAMostrar(r.ronda_libre_jugadores, {}, [], 'todos')}
      fechaDisplay="24 nov" expandedTeam={null} onToggleTeam={() => {}}
    />,
  )
}

describe('TeamLeaderboards — HCP del equipo', () => {
  it('scramble sin hándicap en la vista: no aparece un «HCP 0» falso', () => {
    pintar('scramble', null)
    expect(screen.getByText('Los Ross')).toBeTruthy()
    expect(screen.queryByText(/HCP/)).toBeNull()
  })
  it('scramble con el HCP del club: se ve el real', () => {
    pintar('scramble', 9)
    expect(screen.getAllByText('HCP 9')).toHaveLength(2)
  })
  it('un HCP 0 de verdad sí se muestra', () => {
    pintar('scramble', 0)
    expect(screen.getAllByText('HCP 0')).toHaveLength(2)
  })
})

describe('Encabezado: cuántos juegan', () => {
  const club = [
    { jugadorIds: ['creador'], handicap_origen: 'club' as const },
    { jugadorIds: [], handicap_origen: 'club' as const },
  ]
  it('ronda de 2 equipos de club: «2 equipos» (el creador va por estructura, no juega)', () => {
    expect(textoDeParticipantes(participantesDeLaRonda(['creador'], club))).toBe('2 equipos')
  })
  it('equipos con jugadores: «2 equipos · 4 jugadores»', () => {
    const eqs = [{ jugadorIds: ['a', 'b'] }, { jugadorIds: ['c', 'd'] }]
    expect(textoDeParticipantes(participantesDeLaRonda(['a', 'b', 'c', 'd'], eqs))).toBe('2 equipos · 4 jugadores')
  })
  it('sin equipos: «1 jugador» / «3 jugadores»', () => {
    expect(textoDeParticipantes(participantesDeLaRonda(['a'], []))).toBe('1 jugador')
    expect(textoDeParticipantes(participantesDeLaRonda(['a', 'b', 'c'], []))).toBe('3 jugadores')
  })
})
