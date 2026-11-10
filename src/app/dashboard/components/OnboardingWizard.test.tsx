// @vitest-environment jsdom
// Onboarding (primer contacto): type=number con min=0 no dejaba escribir un plus, y parseFloat("+2") daba 2.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const actualizarIndice = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/lib/data/perfil', () => ({ actualizarIndice }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { OnboardingWizard } from './OnboardingWizard'

const campo = () => screen.getByLabelText('Handicap Index') as HTMLInputElement
const siguiente = () => screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement

describe('OnboardingWizard — índice', () => {
  beforeEach(() => actualizarIndice.mockClear())

  it.each([['+2', -2], ['18,5', 18.5], ['0', 0]])('"%s" se guarda como %s', async (texto, indice) => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.change(campo(), { target: { value: texto } })
    expect(siguiente().disabled).toBe(false)
    await act(async () => { fireEvent.click(siguiente()) })
    expect(actualizarIndice).toHaveBeenCalledWith({}, 'u1', indice)
  })

  it('"abc" avisa y no deja seguir', () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.change(campo(), { target: { value: 'abc' } })
    expect(siguiente().disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus.')
  })

  it('"+" a medio escribir no deja seguir ni avisa', () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.change(campo(), { target: { value: '+' } })
    expect(siguiente().disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
