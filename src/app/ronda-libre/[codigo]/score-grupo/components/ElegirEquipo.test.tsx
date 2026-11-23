import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ElegirEquipo } from './ElegirEquipo'

vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

const eq = (id: string, nombre: string, anotador: string | null, anotadorNombre: string | null = null) =>
  ({ id, nombre, handicap_equipo: 8, handicap_equipo_juego: 8, handicap_origen: 'club' as const, scores: {}, jugadorIds: [], jugadorNombres: [], ronda_id: 'r1', anotador_user_id: anotador, anotador_nombre: anotadorNombre })

describe('ElegirEquipo', () => {
  it('libres se tocan; los tomados muestran quién los anota (sin nombre: «otro celular»)', () => {
    const onElegir = vi.fn()
    render(<ElegirEquipo codigo="ABC" courseName="Los Leones" enCurso={null} aviso={null} onElegir={onElegir}
      equipos={[eq('e1', 'Los Tigres', 'u1', 'Juanjo'), eq('e2', 'Los Pumas', null), eq('e3', 'Los Cóndores', 'u3', null)]} />)
    expect(screen.getByText('lo anota Juanjo')).toBeTruthy()
    expect(screen.getByText('lo anota otro celular')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Los Tigres/ })).toBeNull()
    // Un toque abre la confirmación; recién «Anotar» reclama.
    fireEvent.click(screen.getByRole('button', { name: /Los Pumas/ }))
    expect(onElegir).not.toHaveBeenCalled()
    expect(screen.getByText('¿Anotar Los Pumas desde este celular?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Anotar' }))
    expect(onElegir).toHaveBeenCalledWith('e2')
  })

  it('«Cancelar» en la confirmación no reclama nada', () => {
    const onElegir = vi.fn()
    render(<ElegirEquipo codigo="ABC" courseName={null} enCurso={null} aviso={null} onElegir={onElegir}
      equipos={[eq('e2', 'Los Pumas', null)]} />)
    fireEvent.click(screen.getByRole('button', { name: /Los Pumas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onElegir).not.toHaveBeenCalled()
    expect(screen.queryByText('¿Anotar Los Pumas desde este celular?')).toBeNull()
  })

  it('conflicto: el aviso «ya lo anota» sale arriba y la lista ya viene refrescada (el equipo perdido figura tomado)', () => {
    render(<ElegirEquipo codigo="ABC" courseName="Los Leones" enCurso={null}
      aviso={{ equipoId: 'e2', mensaje: 'Ese equipo ya lo anota Pedro. Elige otro.' }} onElegir={vi.fn()}
      equipos={[eq('e1', 'Los Tigres', 'u1', 'Juanjo'), eq('e2', 'Los Pumas', 'u-pedro', 'Pedro'), eq('e3', 'Los Cóndores', null)]} />)
    expect(screen.getByRole('alert').textContent).toBe('Ese equipo ya lo anota Pedro. Elige otro.')
    expect(screen.getByText('lo anota Pedro')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Los Cóndores/ })).toBeTruthy()
  })

  it('con un reclamo en vuelo ningún equipo acepta otro toque', () => {
    const onElegir = vi.fn()
    render(<ElegirEquipo codigo="ABC" courseName={null} enCurso="e2" aviso={null} onElegir={onElegir}
      equipos={[eq('e2', 'Los Pumas', null), eq('e3', 'Los Cóndores', null)]} />)
    expect(screen.getByText('Tomando…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Los Cóndores/ }))
    expect(onElegir).not.toHaveBeenCalled()
  })

  it('sin equipos libres: lo dice y ofrece la tabla en vivo', () => {
    render(<ElegirEquipo codigo="ABC" courseName={null} enCurso={null} aviso={null} onElegir={vi.fn()}
      equipos={[eq('e1', 'Los Tigres', 'u1', 'Juanjo')]} />)
    expect(screen.getByText('Todos los equipos ya tienen quién los anote.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver tabla en vivo' }).getAttribute('href')).toBe('/ronda-libre/ABC')
  })
})
