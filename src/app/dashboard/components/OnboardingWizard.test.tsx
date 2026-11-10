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
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número (12.4, o +2 si es plus).')
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
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número (12.4, o +2 si es plus).')
    expect(document.activeElement).toBe(campo())
  })
  it('si el UPDATE falla: no pasa al paso 2 y avisa en el campo', async () => {
    actualizarIndice.mockResolvedValueOnce(false)
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.change(campo(), { target: { value: '12' } })
    await act(async () => { fireEvent.click(siguiente()) })
    expect(actualizarIndice).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar tu índice. Revisa tu señal y vuelve a intentarlo.')
    expect(siguiente().disabled).toBe(false)
    expect(campo().value).toBe('12')
  })

  it('con "No tengo / No sé" y el UPDATE fallido, también avisa y no avanza', async () => {
    actualizarIndice.mockResolvedValueOnce(false)
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.click(screen.getByLabelText('No tengo / No sé'))
    await act(async () => { fireEvent.click(siguiente()) })
    expect(actualizarIndice).toHaveBeenCalledWith({}, 'u1', null)
    expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar tu índice. Revisa tu señal y vuelve a intentarlo.')
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeTruthy()
  })
  it('con "No tengo", dos fallos seguidos: el aviso se va mientras guarda y vuelve (se anuncia de nuevo)', async () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.click(screen.getByLabelText('No tengo / No sé'))
    actualizarIndice.mockResolvedValueOnce(false)
    await act(async () => { fireEvent.click(siguiente()) })
    expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar tu índice. Revisa tu señal y vuelve a intentarlo.')
    let soltar: (ok: boolean) => void = () => {}
    actualizarIndice.mockImplementationOnce(() => new Promise<boolean>(r => { soltar = r }))
    act(() => { fireEvent.click(siguiente()) })
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => { soltar(false) })
    expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar tu índice. Revisa tu señal y vuelve a intentarlo.')
  })

  it('marcar o desmarcar "No tengo / No sé" quita el aviso de un guardado fallido', async () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.click(screen.getByLabelText('No tengo / No sé'))
    actualizarIndice.mockResolvedValueOnce(false)
    await act(async () => { fireEvent.click(siguiente()) })
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('No tengo / No sé'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fallo y reintento exitoso: pasa al paso 2', async () => {
    render(<OnboardingWizard userId="u1" userName="Ana Soto" />)
    fireEvent.change(campo(), { target: { value: '12' } })
    actualizarIndice.mockResolvedValueOnce(false)
    await act(async () => { fireEvent.click(siguiente()) })
    expect(screen.getByRole('alert')).toBeTruthy()
    await act(async () => { fireEvent.click(siguiente()) })
    expect(actualizarIndice).toHaveBeenCalledTimes(2)
    expect(screen.queryByLabelText('Handicap Index')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
