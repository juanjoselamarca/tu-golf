import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EquiposDeOtroCelular } from './EquiposDeOtroCelular'

const share = vi.fn(async () => ({ ok: true }))
vi.mock('@/components/share/useShare', () => ({ useShare: () => ({ share }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

const eq = (id: string, nombre: string, anotador: string | null, anotadorNombre: string | null = null) =>
  ({ id, nombre, handicap_equipo: 8, handicap_equipo_juego: 8, handicap_origen: 'club' as const, scores: {}, jugadorIds: [], jugadorNombres: [], ronda_id: 'r1', anotador_user_id: anotador, anotador_nombre: anotadorNombre })

describe('EquiposDeOtroCelular', () => {
  it('para quien no es el creador, un equipo sin reclamar «lo anota» el creador por su nombre', () => {
    render(<EquiposDeOtroCelular codigo="ABC" nombreCreador="Juanjo" puedeLiberar={false} enCurso={null} onLiberar={vi.fn()} onTomar={vi.fn()}
      equipos={[eq('e1', 'Los Tigres', null), eq('e3', 'Los Cóndores', 'u3', 'Pedro')]} />)
    expect(screen.getByText('· lo anota Juanjo', { exact: false })).toBeTruthy()
    expect(screen.getByText('· lo anota Pedro', { exact: false })).toBeTruthy()
    expect(screen.queryByText(/otro celular/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Liberar' })).toBeNull()
  })

  it('para el creador, uno sin reclamar dice «sin celular todavía» y «Anotarlo yo» pide confirmación', () => {
    const onTomar = vi.fn()
    render(<EquiposDeOtroCelular codigo="ABC" nombreCreador="Juanjo" puedeLiberar enCurso={null} onLiberar={vi.fn()} onTomar={onTomar}
      equipos={[eq('e2', 'Los Pumas', null), eq('e3', 'Los Cóndores', 'u3', 'Pedro')]} />)
    expect(screen.getByText('· sin celular todavía', { exact: false })).toBeTruthy()
    expect(screen.queryByText('· lo anota Juanjo', { exact: false })).toBeNull()
    expect(screen.getByRole('button', { name: 'Liberar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Anotarlo yo' }))
    expect(onTomar).not.toHaveBeenCalled()
    expect(screen.getByText('¿Anotar Los Pumas desde tu celular?')).toBeTruthy()
    const botones = screen.getAllByRole('button', { name: 'Anotarlo yo' })
    fireEvent.click(botones[botones.length - 1])
    expect(onTomar).toHaveBeenCalledWith('e2')
  })

  it('con un equipo sin celular, el creador tiene a la vista el link para que anoten (antes escondido en el ícono)', () => {
    render(<EquiposDeOtroCelular codigo="ABC" nombreCreador="Juanjo" puedeLiberar enCurso={null} onLiberar={vi.fn()} onTomar={vi.fn()}
      equipos={[eq('e2', 'Los Pumas', null)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link para que anoten su equipo' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect((share.mock.calls[0] as unknown as [{ url: string }])[0].url).toMatch(/\/ronda-libre\/ABC\/score-grupo$/)
  })
  it('sin equipos sin celular (todos tomados), o para quien no es el creador: no aparece', () => {
    const { unmount } = render(<EquiposDeOtroCelular codigo="ABC" nombreCreador="Juanjo" puedeLiberar enCurso={null} onLiberar={vi.fn()} onTomar={vi.fn()}
      equipos={[eq('e3', 'Los Cóndores', 'u3', 'Pedro')]} />)
    expect(screen.queryByRole('button', { name: /Enviar link/ })).toBeNull()
    unmount()
    render(<EquiposDeOtroCelular codigo="ABC" nombreCreador="Juanjo" puedeLiberar={false} enCurso={null} onLiberar={vi.fn()} onTomar={vi.fn()}
      equipos={[eq('e2', 'Los Pumas', null)]} />)
    expect(screen.queryByRole('button', { name: /Enviar link/ })).toBeNull()
  })
})
