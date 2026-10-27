// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TournamentConfig } from '@/lib/draft/types'
import { EquiposSection } from './EquiposSection'

const cfg = (format: string, modo: 'gross' | 'neto' = 'neto', team_config?: unknown) =>
  ({ format, modo, prizes: [], team_config } as unknown as TournamentConfig)
const pctEquipo = () => screen.queryByRole('group', { name: 'Handicap del equipo' })

afterEach(cleanup)

describe('EquiposSection — handicap del equipo', () => {
  it('scramble y foursome: muestra el % del equipo', () => {
    for (const f of ['scramble', 'foursome']) {
      render(<EquiposSection config={cfg(f)} applyChange={vi.fn()} />)
      expect(pctEquipo()).not.toBeNull()
      cleanup()
    }
  })

  it('best ball: sin % de equipo (cada jugador usa el handicap de juego de Cómo juegan)', () => {
    render(<EquiposSection config={cfg('best_ball')} applyChange={vi.fn()} />)
    expect(pctEquipo()).toBeNull()
    expect(screen.getByLabelText('Tamaño de equipo')).toBeTruthy()
    expect(screen.getByText(/El porcentaje se elige en Cómo juegan/)).toBeTruthy()
  })

  it('best ball gross: sin % y sin la referencia al handicap de juego', () => {
    render(<EquiposSection config={cfg('best_ball', 'gross')} applyChange={vi.fn()} />)
    expect(pctEquipo()).toBeNull()
    expect(screen.queryByText(/El porcentaje se elige/)).toBeNull()
  })

  it('formato individual: no se muestra la sección', () => {
    render(<EquiposSection config={cfg('stroke_play')} applyChange={vi.fn()} />)
    expect(screen.queryByText('Equipos')).toBeNull()
  })
})

describe('EquiposSection — scramble', () => {
  it('Oficial describe la asignación según el tamaño', () => {
    for (const [size, texto] of [
      [2, '2 jugadores: 35 % del de menor handicap + 15 % del de mayor'],
      [3, '3 jugadores: 30 % + 20 % + 10 %, del menor al mayor handicap'],
      [4, '4 jugadores: 25 % + 20 % + 15 % + 10 %, del menor al mayor handicap'],
    ] as const) {
      render(<EquiposSection config={cfg('scramble', 'neto', { size, formation_mode: 'manual' })} applyChange={vi.fn()} />)
      expect(screen.getByText(texto)).toBeTruthy()
      expect((screen.getByRole('radio', { name: /Oficial/ }) as HTMLInputElement).checked).toBe(true)
      cleanup()
    }
  })

  it('sin opciones retiradas (USGA 25/15, Promedio simple) y con la nota WHS', () => {
    render(<EquiposSection config={cfg('scramble')} applyChange={vi.fn()} />)
    expect(screen.queryByText(/25\/15|Promedio simple/)).toBeNull()
    expect(screen.getByText(/con un solo redondeo final \(WHS\)/)).toBeTruthy()
  })

  it('Personalizado: un input por jugador, de menor a mayor handicap, que guarda el %', () => {
    const applyChange = vi.fn()
    const team = { size: 3, formation_mode: 'manual', handicap: { modo: 'personalizado', porcentajes: [30, 20, 10] } }
    render(<EquiposSection config={cfg('scramble', 'neto', team)} applyChange={applyChange} />)
    const menor = screen.getByLabelText('Jugador con menor handicap') as HTMLInputElement
    expect(menor.value).toBe('30')
    expect(menor.getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByLabelText('Segundo menor handicap')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Jugador con mayor handicap'), { target: { value: '15' } })
    expect(applyChange).toHaveBeenCalledWith({
      team_config: { ...team, handicap: { modo: 'personalizado', porcentajes: [30, 20, 15] } },
    })
  })

  it('Personalizado: un % fuera de 0-100 no se guarda y se explica', () => {
    const applyChange = vi.fn()
    const team = { size: 2, formation_mode: 'manual', handicap: { modo: 'personalizado', porcentajes: [35, 15] } }
    render(<EquiposSection config={cfg('scramble', 'neto', team)} applyChange={applyChange} />)
    fireEvent.change(screen.getByLabelText('Jugador con menor handicap'), { target: { value: '150' } })
    expect(applyChange).not.toHaveBeenCalled()
    expect(screen.getByText('Escribe un número entero entre 0 y 100')).toBeTruthy()
  })

  it('Personalizado que suma más de 100 %: avisa bajo los porcentajes, sin bloquear', () => {
    const team = (porcentajes: number[]) => ({ size: 2, formation_mode: 'manual', handicap: { modo: 'personalizado', porcentajes } })
    render(<EquiposSection config={cfg('scramble', 'neto', team([60, 60]))} applyChange={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/suman 120 %/)
    cleanup()
    render(<EquiposSection config={cfg('scramble', 'neto', team([35, 15]))} applyChange={vi.fn()} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('EquiposSection — foursome', () => {
  it('parejas fijas, oficial 50 % de la suma y personalizado con un solo %', () => {
    const applyChange = vi.fn()
    render(<EquiposSection config={cfg('foursome')} applyChange={applyChange} />)
    expect(screen.queryByLabelText('Tamaño de equipo')).toBeNull()
    expect(screen.getByText('Parejas: 2 jugadores por equipo.')).toBeTruthy()
    expect(screen.getByText('50 % de la suma de los handicaps de la pareja')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Personalizado/ }))
    expect(applyChange).toHaveBeenCalledWith({
      team_config: { size: 2, formation_mode: 'manual', handicap: { modo: 'personalizado', porcentaje_suma: 50 } },
    })
  })

  it('un foursome guardado con equipos de 4 ofrece volver a parejas', () => {
    const applyChange = vi.fn()
    render(<EquiposSection config={cfg('foursome', 'neto', { size: 4, formation_mode: 'manual' })} applyChange={applyChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a parejas' }))
    expect(applyChange).toHaveBeenCalledWith({ team_config: { size: 2, formation_mode: 'manual' } })
  })
})
