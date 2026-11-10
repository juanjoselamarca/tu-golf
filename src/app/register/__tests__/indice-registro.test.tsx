// @vitest-environment jsdom
// Registro (primer contacto): parseFloat("+2") registraba un plus como hándicap 2, y el onBlur con 0..54 ya lo
// dejaba en "2" antes de enviar. "18,5" se leía 18.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const signUp = vi.hoisted(() => vi.fn(async () => ({ data: { session: null, user: null }, error: null })))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ auth: { signUp, signInWithOAuth: vi.fn() } }) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import RegisterPage from '../page'

const campo = () => screen.getByLabelText(/Índice de hándicap/) as HTMLInputElement
const boton = () => screen.getByRole('button', { name: /Crear mi cuenta/ }) as HTMLButtonElement

async function enviar(indice: string) {
  render(<RegisterPage />)
  fireEvent.change(screen.getByPlaceholderText('tu@email.com'), { target: { value: 'a@b.cl' } })
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'clave-segura-123' } })
  fireEvent.change(campo(), { target: { value: indice } })
  fireEvent.blur(campo())
  const trasBlur = campo().value
  await act(async () => { fireEvent.submit(campo().closest('form')!) })
  return trasBlur
}

describe('registro — índice de hándicap', () => {
  beforeEach(() => signUp.mockClear())

  it.each([['+2', -2], ['18,5', 18.5], ['', null]])('"%s" se registra como %s (y el blur no lo cambia)', async (texto, indice) => {
    expect(await enviar(texto)).toBe(texto)
    expect(signUp).toHaveBeenCalledTimes(1)
    expect((signUp.mock.calls[0] as unknown as [{ options: { data: { indice: unknown } } }])[0].options.data.indice).toBe(indice)
  })

  it('"abc" avisa, bloquea el botón y no registra', async () => {
    await enviar('abc')
    expect(signUp).not.toHaveBeenCalled()
    expect(boton().disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus.')
  })

  it('"+" a medio escribir bloquea sin avisar', async () => {
    await enviar('+')
    expect(signUp).not.toHaveBeenCalled()
    expect(boton().disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fuera del rango WHS ("60") avisa el rango y no registra', async () => {
    await enviar('60')
    expect(signUp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/^Revisa el índice de handicap/)
  })
})
