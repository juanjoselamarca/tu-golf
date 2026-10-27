/**
 * Canario #511 — `profiles` es `TO authenticated`: con el cliente del request, un
 * visor ANÓNIMO lee 0 filas SIN error y el jugador queda con índice 0 (neto puntuado
 * como gross). Las pantallas/rutas de servidor que atienden anónimos deben leer el
 * índice con el lector de servicio `indicesDePerfil`, nunca con el cliente del request.
 * El tipo obliga a pasar ALGÚN lector; esto fija que sea el correcto.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const leer = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('canario: índices de perfil en servidor público = lector de servicio', () => {
  it('/torneo/[slug]: equipos best ball con indicesDePerfil', () => {
    const src = leer('src/app/torneo/[slug]/page.tsx')
    expect(src).toMatch(/fetchBestBallTeams\(\s*supabase,\s*tournament\.id,\s*parTotal,\s*indicesDePerfil\s*\)/)
  })

  it('scramble/foursome no leen índices: usan el handicap de equipo guardado (PR-C)', () => {
    const src = leer('src/lib/data/tournaments/teamLeaderboard.ts')
    const inicio = src.indexOf('export async function fetchScrambleTeams')
    expect(inicio).toBeGreaterThanOrEqual(0)
    const fn = src.slice(inicio).split(/\r?\n\}\r?\n/)[0]
    expect(fn).not.toMatch(/leerIndices|profiles|indiceDelMiembro/)
    expect(fn).toMatch(/handicap_equipo_juego/)
  })

  it('GET /api/gwi/ronda-libre/[codigo]: gwiDeRondaLibre con indicesDePerfil', () => {
    const src = leer('src/app/api/gwi/ronda-libre/[codigo]/route.ts')
    expect(src).toMatch(/gwiDeRondaLibre\([^)]*indicesDePerfil\s*\)/)
  })
})
