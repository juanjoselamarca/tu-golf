/**
 * Máscara por visor del GWI, vista desde la UI. Los cuatro paneles que pintan el
 * GWI (GwiPanel de la ronda libre, LeaderboardView del scorer, TournamentTabs del
 * torneo y el propio GWILeaderboard) pasan `results` tal cual llegan del servidor
 * a `GWILeaderboard`, que es el único que dibuja "Patrón", la tendencia y las
 * píldoras. Aquí: con la respuesta real de `construirRespuestaGWI`, la fila del
 * rival nunca muestra "Patrón" ni "Historial"/"Cancha"; la propia sí.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, fireEvent, within } from '@testing-library/react'
import GWILeaderboard from '@/components/GWILeaderboard'
import { construirRespuestaGWI, filasDelVisorGWI, type JugadorGWIInput } from '@/golf/stats/gwi'

const conPatron = { back9Collapse: { confidence: 1, avgDiff: 12 } }
const jugador = (id: string, nombre: string, currentScore: number): JugadorGWIInput => ({
  id, nombre, handicapIndex: 12, currentScore, hoyosCompletados: 14,
  modoJuego: 'gross', formatoJuego: 'stroke_play',
  historicalAvg: 6, historicalRoundsCount: 20, courseAvg: -3.7, courseRoundsCount: 5,
  patterns: conPatron,
})
const inputs = [jugador('p1', 'Ana', 0), jugador('p2', 'Bea', 3)]
const meta = { totalHoyos: 18, modoJuego: 'gross' as const, formatoJuego: 'stroke_play' as const }
const duenos = [{ id: 'p1', user_id: 'u-ana' }, { id: 'p2', user_id: 'u-bea' }]

function pintar(viewer: string | null) {
  const { results } = construirRespuestaGWI(inputs, meta, filasDelVisorGWI(duenos, viewer))
  render(<GWILeaderboard results={results} hoyosRestantes={4} totalHoyos={18} modoJuego="gross" />)
}

/** El bloque de una fila (botón + detalle), expandido: el panel abre una fila a la vez. */
function fila(nombre: string): HTMLElement {
  const boton = screen.getByText(nombre).closest('button')!
  const bloque = boton.parentElement as HTMLElement
  if (bloque.children.length === 1) fireEvent.click(boton)
  return bloque
}

describe('GWILeaderboard — máscara por visor', () => {
  it('Ana mira: ve SU patrón y SUS píldoras; la fila de Bea no muestra "Patrón"', () => {
    pintar('u-ana')
    expect(within(fila('Ana')).queryByText(/Patrón: colapso back 9/)).not.toBeNull()
    expect(within(fila('Ana')).queryByText('Historial')).not.toBeNull()
    expect(within(fila('Bea')).queryAllByText(/Patrón/)).toHaveLength(0)
    expect(within(fila('Bea')).queryByText('Historial')).toBeNull()
    expect(within(fila('Bea')).queryByText('Cancha')).toBeNull()
    // Tendencia neutra del rival.
    expect(within(fila('Bea')).queryByText('→')).not.toBeNull()
  })

  it('espectador anónimo: ninguna fila muestra "Patrón", "Historial" ni "Cancha"', () => {
    pintar(null)
    for (const nombre of ['Ana', 'Bea']) {
      expect(within(fila(nombre)).queryAllByText(/Patrón/)).toHaveLength(0)
      expect(within(fila(nombre)).queryByText('Historial')).toBeNull()
      expect(within(fila(nombre)).queryByText('Cancha')).toBeNull()
    }
  })
})

describe('canario de fuente — ningún panel pinta el patrón por su cuenta', () => {
  // Si un panel empezara a dibujar "Patrón" o a calcular la tendencia él mismo,
  // se saltaría la máscara del servidor.
  const PANELES = [
    'src/app/ronda-libre/[codigo]/components/GwiPanel.tsx',
    'src/app/ronda-libre/[codigo]/score/components/LeaderboardView.tsx',
    'src/components/TournamentTabs.tsx',
  ]
  it.each(PANELES)('%s delega en GWILeaderboard con los results del servidor', (ruta) => {
    const fuente = readFileSync(join(process.cwd(), ruta), 'utf-8')
    expect(fuente).toMatch(/<GWILeaderboard[\s\S]*?results=\{[^}]*results\}/)
    expect(fuente).not.toMatch(/Patrón|patrones\.alerta|\.tendencia\b/)
  })
})
