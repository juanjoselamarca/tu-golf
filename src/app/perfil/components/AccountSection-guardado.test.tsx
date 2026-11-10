/**
 * El guardado fallido del perfil (#776) se avisa en el formulario, junto a "Guardar cambios", con
 * role="alert" y sin mover el foco al índice: el fallo es de la red, no del campo.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AccountSection } from './AccountSection'
import { useProfileEdit } from '../hooks/useProfileEdit'
import type { Profile } from '@/lib/data/perfil'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }) }),
      }),
    }),
  }),
}))

const perfil: Profile = {
  id: 'u1', name: 'Ana', indice: 12.3, avatar_url: null,
  indice_golfers: null, indice_golfers_updated_at: null,
  nivel: null, nivel_updated_at: null, nivel_expires_at: null,
  subscription_tier: 'free',
}

const onProfile = vi.fn()

function Pantalla() {
  const edit = useProfileEdit(perfil, onProfile)
  return <AccountSection profile={perfil} userEmail="a@b.cl" edit={edit} />
}

describe('AccountSection — guardado fallido', () => {
  it('avisa en el formulario junto a "Guardar cambios", no en el índice, y no mueve el foco', async () => {
    render(<Pantalla />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }))
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' })
    guardar.focus()
    await act(async () => { fireEvent.click(guardar) })
    const aviso = screen.getByRole('alert')
    expect(aviso.textContent).toBe('No pudimos guardar tus cambios. Revisa tu señal y vuelve a intentarlo.')
    // Justo antes de la fila de botones del formulario.
    expect(aviso.nextElementSibling?.contains(screen.getByRole('button', { name: 'Guardar cambios' }))).toBe(true)
    const indice = screen.getByLabelText('Índice Federación')
    expect(indice.getAttribute('aria-invalid')).toBe('false')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(onProfile).not.toHaveBeenCalled()
  })
})
