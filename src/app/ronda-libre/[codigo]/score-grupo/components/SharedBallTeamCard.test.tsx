// #602 — Tarjeta del equipo (scramble / foursome) en el scorer de grupo.
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SharedBallTeamCard } from './SharedBallTeamCard'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'
import { hoyosDeBolaCompartida, totalesBolaCompartida } from '@/golf/formats'
import type { HoleData } from '@/types/ronda'
import { conteoDeDrives } from '@/golf/formats/drives-scramble'
import type { DrivesDeUnEquipo } from '../hooks/useDrivesDelScorer'

const ordenHoyos = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const holeDataMap: Record<number, HoleData> = Object.fromEntries(
  ordenHoyos.map(h => [h, { numero: h, par: 4, stroke_index: h * 2 - 1, yardaje: null }]),
)
const parMap = Object.fromEntries(ordenHoyos.map(h => [h, 4]))
const equipo = {
  id: 'e1', nombre: 'Padre e hijo', handicap_equipo: 10, handicap_equipo_juego: null, jugadorIds: ['a', 'b'], jugadorNombres: ['Juan', 'Juanito'],
  scores: Object.fromEntries(ordenHoyos.map(h => [String(h), 5])),
}

const pintar = (modoJuego: 'gross' | 'neto') => render(
  <SharedBallTeamCard
    equipo={equipo} formatoJuego="scramble" modoJuego={modoJuego} currentHole={9} par={4}
    totales={totalesBolaCompartida('scramble', equipo, hoyosDeBolaCompartida(ordenHoyos, parMap, holeDataMap))}
    foursomeInvertido={false} onToggleInvertido={() => {}} onChange={() => {}} theme={SCORER_THEME}
  />,
)

describe('SharedBallTeamCard — totales del equipo', () => {
  it('neto 9h: muestra el NETO del motor (mitad del handicap 18h) y el gross como secundario', () => {
    pintar('neto')
    expect(screen.getByText('Neto')).toBeTruthy()
    expect(screen.getByText('+4')).toBeTruthy()          // 45 − 5 golpes − 36
    expect(screen.getByText('Gross +9 · 45')).toBeTruthy()
    expect(screen.getByText('HCP 10')).toBeTruthy()      // escala 18h, igual que el board
  })
  it('gross: el vs par gross, sin "Neto" ni chip de handicap (no juega)', () => {
    pintar('gross')
    expect(screen.getByText('+9')).toBeTruthy()
    expect(screen.getByText('45')).toBeTruthy()
    expect(screen.queryByText('Neto')).toBeNull()
    expect(screen.queryByText(/^HCP/)).toBeNull()
  })
})

describe('SharedBallTeamCard — equipo de club (scramble rápido)', () => {
  const deClub = {
    ...equipo, nombre: 'Los Tigres', handicap_equipo: 8, handicap_equipo_juego: 8,
    handicap_origen: 'club' as const, jugadorIds: ['creador'], jugadorNombres: ['Juanjo'],
  }
  const pintarDeClub = (modoJuego: 'gross' | 'neto') => render(
    <SharedBallTeamCard
      equipo={deClub} formatoJuego="scramble" modoJuego={modoJuego} currentHole={9} par={4}
      totales={totalesBolaCompartida('scramble', deClub, hoyosDeBolaCompartida(ordenHoyos, parMap, holeDataMap))}
      foursomeInvertido={false} onToggleInvertido={() => {}} onChange={() => {}} theme={SCORER_THEME}
    />,
  )

  it('no muestra al creador como integrante: solo el nombre del equipo y su HCP del club', () => {
    pintarDeClub('neto')
    expect(screen.getByText('Los Tigres')).toBeTruthy()
    expect(screen.queryByText('Juanjo')).toBeNull()
    expect(screen.getByText('HCP 8')).toBeTruthy()
  })

  it('en gross tampoco muestra integrantes ni HCP, y no deja una fila vacía bajo el nombre', () => {
    pintarDeClub('gross')
    expect(screen.queryByText('Juanjo')).toBeNull()
    expect(screen.queryByText(/^HCP/)).toBeNull()
    expect(screen.getByText('Los Tigres').nextElementSibling).toBeNull()
  })
})

describe('SharedBallTeamCard — drives del scramble', () => {
  const jugadores = ['Juanjo', 'Pedro', 'Diego', 'Tomás']
  const H18 = Array.from({ length: 18 }, (_, i) => i + 1)
  // Juanjo 3, Pedro 1, Diego 4, Tomás 2 (10 hoyos con drive).
  const marcados = { '1': 0, '2': 0, '3': 0, '4': 1, '5': 2, '6': 2, '7': 2, '8': 2, '9': 3, '10': 3 }
  const drives = (elegir = vi.fn(), driveDelHoyo: number | null = 2): DrivesDeUnEquipo => ({
    jugadores, driveDelHoyo, minimo: 4, aviso: null, elegir, hoyosSinDrive: [],
    conteo: conteoDeDrives({ jugadores, drives: marcados, minimo: 4, hoyos: H18 }),
  })
  const pintarConDrives = (d: DrivesDeUnEquipo | null, deshabilitados = false, faltaDrive = false) => render(
    <SharedBallTeamCard
      equipo={equipo} formatoJuego="scramble" modoJuego="gross" currentHole={9} par={4}
      totales={null} foursomeInvertido={false} onToggleInvertido={() => {}} onChange={() => {}}
      drives={d} drivesDeshabilitados={deshabilitados} faltaDrive={faltaDrive} theme={SCORER_THEME}
    />,
  )

  it('sin drives la tarjeta queda igual: ni «Drive de:» ni conteo', () => {
    pintarConDrives(null)
    expect(screen.queryByText('Drive de:')).toBeNull()
    expect(screen.queryByTestId('conteo-drives')).toBeNull()
  })

  it('un botón por jugador de al menos 44 px, con el del hoyo marcado; tocar llama con su índice', () => {
    const elegir = vi.fn()
    pintarConDrives(drives(elegir))
    const botones = jugadores.map(n => screen.getByRole('button', { name: n }))
    for (const b of botones) expect(parseInt(b.style.minHeight)).toBeGreaterThanOrEqual(44)
    expect(botones.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])
    fireEvent.click(botones[1])
    expect(elegir).toHaveBeenCalledWith(1)
  })

  it('conteo dentro de cada botón (Juanjo 26-nov): «lleva/mínimo» de cada uno, ✓ al que cumplió, y en texto para el lector', () => {
    pintarConDrives(drives())
    expect(screen.getByTestId('conteo-drives').textContent).toBe('Mín. 4: Juanjo 3 · Pedro 1 · Diego 4 ✓ · Tomás 2')
    const botones = jugadores.map(n => screen.getByRole('button', { name: n }))
    expect(botones.map(b => b.lastElementChild?.textContent)).toEqual(['3/4', '1/4', '4/4 ✓', '2/4'])
    expect(botones.map(b => b.querySelector('[data-cumple="true"]') != null)).toEqual([false, false, true, false])
  })

  it('sin mínimo (0): solo cuántos lleva cada uno, sin «/» ni ✓', () => {
    pintarConDrives({ ...drives(), minimo: null, conteo: conteoDeDrives({ jugadores, drives: marcados, minimo: null, hoyos: H18 }) })
    const botones = jugadores.map(n => screen.getByRole('button', { name: n }))
    expect(botones.map(b => b.lastElementChild?.textContent)).toEqual(['3', '1', '4', '2'])
  })

  it('sin el drive del hoyo e intentando avanzar: «Drive de» destacado y lo pide', () => {
    pintarConDrives(drives(vi.fn(), null), false, true)
    expect(screen.getByRole('alert').textContent).toBe('Marca de quién fue el drive para seguir')
    expect(document.querySelector('[data-falta-drive="true"]')).not.toBeNull()
  })

  it('el aviso de riesgo se muestra cuando lo hay', () => {
    pintarConDrives({ ...drives(), aviso: 'A Pedro le faltan 3 drives · quedan 3 hoyos' })
    expect(screen.getByRole('status').textContent).toBe('A Pedro le faltan 3 drives · quedan 3 hoyos')
  })

  it('tarjeta congelada: los botones no responden', () => {
    const elegir = vi.fn()
    pintarConDrives(drives(elegir), true)
    const b = screen.getByRole('button', { name: 'Pedro' }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
  })
})
