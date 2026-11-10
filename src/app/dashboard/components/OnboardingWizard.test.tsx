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

  it('placeholder angosto y pista fija del plus bajo el campo, enlazada', () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    expect(campo().placeholder).toBe('ej. 18')
    const pista = screen.getByText('Si eres plus, escribe +2.')
    expect(campo().getAttribute('aria-describedby')).toBe(pista.id)
  })

  it('vacío (obligatorio sin "No tengo / No sé") no deja seguir', () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    expect(siguiente().disabled).toBe(true)
  })

  it('"abc" avisa en vivo (sin "o déjalo vacío": aquí es obligatorio) y no guarda', async () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.change(campo(), { target: { value: 'abc' } })
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus.')
    await act(async () => { fireEvent.click(siguiente()) })
    expect(actualizarIndice).not.toHaveBeenCalled()
  })

  it.each(['+', '-'])('"%s" a medio escribir: "Siguiente" sigue activo; al tocarlo avisa, enfoca el campo y no guarda', async v => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.change(campo(), { target: { value: v } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(siguiente().disabled).toBe(false)
    await act(async () => { fireEvent.click(siguiente()) })
    expect(actualizarIndice).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus.')
    expect(document.activeElement).toBe(campo())
  })
})
