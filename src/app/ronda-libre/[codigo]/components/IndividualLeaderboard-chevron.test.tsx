// Inbox 16-oct-2026 (ronda real en Club de Polo): la fila de "Alberto Chadwick" se veía "Alberto Ch…" sin la flecha
// ▲/▼ porque el chevron vivía DENTRO del span con ellipsis y el nombre largo lo truncaba. Con la tarjeta de Alberto
// abierta, la única flecha visible era la de "Papa ▼": no se sabía qué fila estaba expandida.
// Contrato: el chevron es hermano del nombre (no hijo), no se encoge, y el nombre sigue truncando con ellipsis.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IndividualLeaderboard } from './IndividualLeaderboard'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import type { RondaLibre } from '@/types/ronda'
import { crearHcpAMostrar } from '@/lib/data/ronda-libre-live-api'

const parMap = { 1: 4, 2: 4, 3: 4 }
const siMap = { 1: 1, 2: 2, 3: 3 }
const LARGO = 'Alberto Chadwick Larraín de la Fuente'
const jugadores = [
  { id: 'j1', nombre: 'Papa', user_id: null, handicap: null, tees: null, scores: { 1: 4, 2: 5, 3: 4 } },
  { id: 'j2', nombre: LARGO, user_id: 'u2', handicap: 15, tees: null, scores: { 1: 5, 2: 5, 3: 5 } },
  { id: 'j3', nombre: 'Sin jugar', user_id: null, handicap: 10, tees: null, scores: {} },
]
const ronda = {
  id: 'r1', codigo: 'ABC123', course_name: 'Club de Polo', course_id: 'c1', tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-10-16', estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stroke_play', ronda_libre_jugadores: jugadores,
} as unknown as RondaLibre
const courseHcpMap = { j1: 0, j2: 18, j3: 11 }
const leaderboard = buildLeaderboard({
  jugadores: jugadores as never, holes: 18, hoyoInicio: 1, parMap, siMap, courseHcpMap, modoJuego: 'gross', formatoJuego: 'stroke_play',
})

const pintar = (expanded: string | null) => render(
  <IndividualLeaderboard
    ronda={ronda} leaderboard={leaderboard} isNetoMode={false} hasCourse parMap={parMap} siMap={siMap}
    courseHcpMap={courseHcpMap} hcpAMostrar={crearHcpAMostrar(jugadores, courseHcpMap, ['j1'], new Set())}
    fechaDisplay="16 oct" expanded={expanded} onToggleExpand={() => {}}
  />,
)

const nombreDe = (nombre: string) => screen.getAllByText(nombre)[0] as HTMLElement
const chevronDe = (nombre: string) => {
  const n = nombreDe(nombre)
  return Array.from(n.parentElement!.children).find(el => el !== n && /[▲▼]/.test(el.textContent ?? '')) as HTMLElement | undefined
}

describe('IndividualLeaderboard — chevron de expandir con nombres largos', () => {
  it('la fila expandida muestra ▲ fuera del span truncable, aunque el nombre sea largo', () => {
    pintar('j2')
    const nombre = nombreDe(LARGO)
    expect(nombre.textContent).toBe(LARGO) // el nombre no lleva la flecha adentro
    expect(nombre.style.textOverflow).toBe('ellipsis')
    expect(nombre.style.overflow).toBe('hidden')
    const chevron = chevronDe(LARGO)
    expect(chevron?.textContent).toBe('▲')
    expect(chevron?.style.flexShrink).toBe('0')
    expect(chevron?.getAttribute('aria-hidden')).toBe('true')
    expect(chevronDe('Papa')?.textContent).toBe('▼')
  })

  it('el contenedor nombre+chevron es flex con minWidth 0 (sin eso la celda de la grilla no deja truncar)', () => {
    pintar(null)
    const cont = nombreDe(LARGO).parentElement as HTMLElement
    expect(cont.style.display).toBe('flex')
    expect(cont.style.minWidth).toBe('0px')
    expect(chevronDe(LARGO)?.textContent).toBe('▼')
  })

  it('sin hoyos jugados no hay chevron (no hay tarjeta que abrir)', () => {
    pintar(null)
    expect(chevronDe('Sin jugar')).toBeUndefined()
  })

  it('el botón sigue anunciando expandir/colapsar por nombre (a11y intacta)', () => {
    pintar('j2')
    expect(screen.getByLabelText(`Colapsar scorecard de ${LARGO}`)).toBeTruthy()
    expect(screen.getByLabelText('Expandir scorecard de Papa')).toBeTruthy()
  })
})
