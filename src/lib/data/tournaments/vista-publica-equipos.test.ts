/**
 * Torneo NETO por equipos (camino ronda libre) visto SIN sesión: los equipos viajan
 * sólo en bruto (decisión "solo bruto", 08-oct). page.tsx arma los standings con
 * `vista.modo` (gross en la vista bruta); `LiveTeam` no lleva handicap ni neto.
 */
import { describe, it, expect } from 'vitest'
import { vistaPublica } from './vista-publica'
import { computeScrambleStandings } from '@/golf/leaderboard/team-standings'
import { scrambleResultsToLiveTeams } from '@/app/torneo/[slug]/en-vivo/scrambleTeamsToLive'
import type { ScrambleTeam } from '@/golf/formats'

const HOLES = [
  { numero: 1, par: 4, stroke_index: 1 },
  { numero: 2, par: 4, stroke_index: 2 },
  { numero: 3, par: 4, stroke_index: 3 },
]
// A: bruto 15 con handicap alto (en neto gana). B: bruto 13, handicap 0 (en bruto gana).
const EQUIPOS: ScrambleTeam[] = [
  { id: 'A', nombre: 'Águilas', handicaps: [20, 24], scores: { '1': 5, '2': 5, '3': 5 } },
  { id: 'B', nombre: 'Cóndores', handicaps: [0, 0], scores: { '1': 4, '2': 5, '3': 4 } },
]
const NOMBRES = { A: ['Ana', 'Aldo'], B: ['Bea', 'Beto'] }

function equiposParaVisor(visorConSesion: boolean) {
  const vista = vistaPublica({ visorConSesion, caminoRondaLibre: true, modoJuego: 'neto', formatoJuego: 'scramble' })
  // Exactamente las dos llamadas de page.tsx con `vista.modo`.
  const ordered = computeScrambleStandings(EQUIPOS, HOLES, 12, 'scramble', vista.modo, 3)
  return scrambleResultsToLiveTeams(ordered, NOMBRES, vista.modo)
}

describe('equipos de un torneo NETO según el visor', () => {
  it('sin sesión: orden y totales BRUTOS; ningún campo de handicap o neto', () => {
    const teams = equiposParaVisor(false)
    expect(teams.map((t) => t.id)).toEqual(['B', 'A'])
    expect(teams.map((t) => t.team_total)).toEqual([13, 15])
    expect(teams.map((t) => t.vs_par)).toEqual([1, 3])
    for (const t of teams) {
      expect(Object.keys(t).sort()).toEqual(['id', 'name', 'players', 'team_scores_per_hole', 'team_total', 'thru', 'vs_par'])
    }
    // Los integrantes viajan sólo con su nombre: `handicap_index` es un 0 de relleno
    // de `nameToLivePlayer` (no es el índice de nadie) y no hay ningún campo neto.
    const texto = JSON.stringify(teams)
    expect(texto).not.toMatch(/neto/i)
    expect(texto.match(/"handicap_index":(-?[\d.]+)/g)?.every((m) => m.endsWith(':0'))).toBe(true)
  })

  it('con sesión: el ranking es el neto (control: el caso discrimina)', () => {
    const teams = equiposParaVisor(true)
    expect(teams[0].id).toBe('A')
  })
})
