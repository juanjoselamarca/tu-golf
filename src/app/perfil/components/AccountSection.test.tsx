/**
 * Regresión: la fila "Mi plan" del perfil decía PRO a TODOS.
 *
 * El 01-nov-2026 los 48 perfiles de producción eran `free` y los 48 leían un
 * badge PRO en su propia cuenta: `<ProBadge tier="pro" />` estaba fijo en el
 * JSX. Estos tests fallan con el badge fijo y pasan leyendo el tier real.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountSection } from './AccountSection'
import type { Profile } from '@/lib/data/perfil'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

const perfil = (subscription_tier: string | null): Profile => ({
  id: 'u1',
  name: 'Juanjo',
  indice: 12.4,
  avatar_url: null,
  indice_golfers: null,
  indice_golfers_updated_at: null,
  nivel: null,
  nivel_updated_at: null,
  nivel_expires_at: null,
  subscription_tier,
})

const edit = {
  editing: false,
  setEditing: vi.fn(),
  saving: false,
  saved: false,
  editName: '',
  setEditName: vi.fn(),
  editIndice: '',
  setEditIndice: vi.fn(),
  save: vi.fn(),
  cancel: vi.fn(),
} as unknown as Parameters<typeof AccountSection>[0]['edit']

function filaDelPlan() {
  return screen.getByText('Mi plan').parentElement as HTMLElement
}

describe('AccountSection — fila "Mi plan"', () => {
  it('un usuario free lee "Gratis", no "PRO"', () => {
    render(<AccountSection profile={perfil('free')} userEmail="a@b.cl" edit={edit} />)
    expect(filaDelPlan().textContent).toContain('Gratis')
    expect(filaDelPlan().textContent).not.toContain('PRO')
  })

  it('sin tier en la base tampoco dice PRO', () => {
    render(<AccountSection profile={perfil(null)} userEmail="a@b.cl" edit={edit} />)
    expect(filaDelPlan().textContent).toContain('Gratis')
    expect(filaDelPlan().textContent).not.toContain('PRO')
  })

  it('un tier basura no pinta el badge dorado', () => {
    render(<AccountSection profile={perfil('premium')} userEmail="a@b.cl" edit={edit} />)
    expect(filaDelPlan().textContent).toContain('Gratis')
    expect(filaDelPlan().textContent).not.toContain('PRO')
  })

  it('un pro sí lee PRO', () => {
    render(<AccountSection profile={perfil('pro')} userEmail="a@b.cl" edit={edit} />)
    expect(filaDelPlan().textContent).toContain('PRO')
    expect(filaDelPlan().textContent).not.toContain('PRO+')
  })

  it('un pro_plus lee PRO+', () => {
    render(<AccountSection profile={perfil('pro_plus')} userEmail="a@b.cl" edit={edit} />)
    expect(filaDelPlan().textContent).toContain('PRO+')
  })

  it('la fila sigue llevando a /planes recordando el origen', () => {
    render(<AccountSection profile={perfil('free')} userEmail="a@b.cl" edit={edit} />)
    const link = screen.getByText('Mi plan').closest('a')
    expect(link?.getAttribute('href')).toBe('/planes?volver=%2Fperfil')
  })
})
