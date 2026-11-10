// @vitest-environment jsdom
// Registro (primer contacto): parseFloat("+2") registraba un plus como hándicap 2, y el onBlur con 0..54 ya lo
// dejaba en "2" antes de enviar. "18,5" se leía 18.
// Estos tests verifican lo que se MANDA en signUp (options.data.indice), nada más: hoy ese metadato no llega a
// profiles.indice porque el trigger handle_new_user no lo copia (#777, PR aparte con migración).
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

  it.each([['+2', -2], ['18,5', 18.5], ['', null]])('"%s" se manda en signUp como %s (y el blur no lo cambia)', async (texto, indice) => {
    expect(await enviar(texto)).toBe(texto)
    expect(signUp).toHaveBeenCalledTimes(1)
    expect((signUp.mock.calls[0] as unknown as [{ options: { data: { indice: unknown } } }])[0].options.data.indice).toBe(indice)
  })

  it('"abc" avisa y no llama a signUp; el botón no se apaga por el índice', async () => {
    await enviar('abc')
    expect(signUp).not.toHaveBeenCalled()
    expect(boton().disabled).toBe(false)
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus, o déjalo vacío.')
  })

  it.each(['-', '+', '.', ','])('"%s" a medio escribir: no avisa mientras se tipea; al tocar "Crear cuenta" avisa, enfoca el campo y no llama a signUp', async texto => {
    render(<RegisterPage />)
    // Todo lo obligatorio lleno: el click de verdad tiene que pasar la validación nativa del form.
    fireEvent.change(screen.getByPlaceholderText('Tu nombre y apellido'), { target: { value: 'Ana Pérez' } })
    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), { target: { value: 'a@b.cl' } })
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'clave-segura-123' } })
    fireEvent.click(document.querySelector('input[type="checkbox"]')!)
    fireEvent.change(campo(), { target: { value: texto } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(boton().disabled).toBe(false)
    await act(async () => { fireEvent.click(boton()) })
    expect(signUp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus, o déjalo vacío.')
    expect(campo().getAttribute('aria-describedby')).toBe('registro-indice-error')
    expect(document.activeElement).toBe(campo())
    // Al volver a escribir, el aviso del envío se va.
    fireEvent.change(campo(), { target: { value: '12' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fuera del rango WHS ("60") avisa el rango y no registra', async () => {
    await enviar('60')
    expect(signUp).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/^Revisa el índice de handicap/)
  })
})
