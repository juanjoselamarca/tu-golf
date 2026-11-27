import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EquiposDeOtroCelular } from './EquiposDeOtroCelular'

const share = vi.fn(async () => ({ ok: true }))
vi.mock('@/components/share/useShare', () => ({ useShare: () => ({ share }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

const eq = (id: string, nombre: string, anotador: string | null, anotadorNombre: string | null = null, scores: Record<string, number> = {}) =>
  ({ id, nombre, handicap_equipo: 8, handicap_equipo_juego: 8, handicap_origen: 'club' as const, scores, jugadorIds: [], jugadorNombres: [], ronda_id: 'r1', anotador_user_id: anotador, anotador_nombre: anotadorNombre })

const base = { codigo: 'ABC', nombreCreador: 'Juanjo', enCurso: null, onLiberar: vi.fn(), onTomar: vi.fn(), hayEquipoSinCelular: false }

describe('EquiposDeOtroCelular', () => {
  it('para quien no es el creador: uno sin reclamar ni golpes dice «nadie lo anota todavía»; con golpes lo anota el creador', () => {
    render(<EquiposDeOtroCelular {...base} puedeLiberar={false}
      equipos={[eq('e1', 'Los Tigres', null), eq('e2', 'Los Pumas', null, null, { '1': 4 }), eq('e3', 'Los Cóndores', 'u3', 'Pedro')]} />)
    expect(screen.getByText('· nadie lo anota todavía', { exact: false })).toBeTruthy()
    expect(screen.getByText('· lo anota Juanjo', { exact: false })).toBeTruthy()
    expect(screen.getByText('· lo anota Pedro', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Liberar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anotarlo yo' })).toBeNull()
  })

  it('para el creador, uno sin reclamar dice «nadie lo anota todavía» y «Anotarlo yo» pide confirmación', () => {
    const onTomar = vi.fn()
    render(<EquiposDeOtroCelular {...base} puedeLiberar onTomar={onTomar}
      equipos={[eq('e2', 'Los Pumas', null), eq('e3', 'Los Cóndores', 'u3', 'Pedro')]} />)
    expect(screen.getByText('· nadie lo anota todavía', { exact: false })).toBeTruthy()
    expect(screen.queryByText('· lo anota Juanjo', { exact: false })).toBeNull()
    expect(screen.getByRole('button', { name: 'Liberar' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Anotarlo yo' }))
    expect(onTomar).not.toHaveBeenCalled()
    expect(screen.getByText('¿Anotar Los Pumas desde tu celular?')).toBeTruthy()
    const botones = screen.getAllByRole('button', { name: 'Anotarlo yo' })
    fireEvent.click(botones[botones.length - 1])
    expect(onTomar).toHaveBeenCalledWith('e2')
  })

  it('con un equipo sin celular, el link para que anoten está a la vista (antes escondido en el ícono)', () => {
    render(<EquiposDeOtroCelular {...base} puedeLiberar hayEquipoSinCelular equipos={[eq('e2', 'Los Pumas', null)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link para anotar' }))
    expect(share).toHaveBeenCalledTimes(1)
    expect((share.mock.calls[0] as unknown as [{ url: string }])[0].url).toMatch(/\/ronda-libre\/ABC\/score-grupo$/)
  })

  it('tomado con «Anotarlo yo» (la franja queda sin equipos): el link sigue, es la vuelta atrás', () => {
    render(<EquiposDeOtroCelular {...base} puedeLiberar hayEquipoSinCelular equipos={[]} />)
    expect(screen.getByRole('button', { name: 'Enviar link para anotar' })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('sin equipos sin celular: no hay link; y sin equipos ni link, la franja no se pinta', () => {
    const { unmount } = render(<EquiposDeOtroCelular {...base} puedeLiberar equipos={[eq('e3', 'Los Cóndores', 'u3', 'Pedro')]} />)
    expect(screen.queryByRole('button', { name: /Enviar link/ })).toBeNull()
    unmount()
    const { container } = render(<EquiposDeOtroCelular {...base} puedeLiberar equipos={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
