// @vitest-environment jsdom
// Invitado que se autoinscribe por el link: el hándicap se tipea como texto ("+2" plus, "18,5" con coma).
// Con type="number", "+2" dejaba el campo en '' y entraba sin hándicap, sin aviso.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormInvitado } from './FormInvitado'

function pintar(guestHandicap: string, guestName = 'Pedro Pérez') {
  const onJoin = vi.fn()
  render(
    <FormInvitado slug="copa" guestName={guestName} onGuestName={vi.fn()} guestHandicap={guestHandicap}
      onGuestHandicap={vi.fn()} guestJoining={false} onJoin={onJoin} />,
  )
  return onJoin
}
const AVISO = 'Escribe un número (12.4, o +2 si es plus) o déjalo vacío.'
const boton = () => screen.getByRole('button', { name: 'Scorear como invitado' }) as HTMLButtonElement
const campo = () => screen.getByLabelText('Índice de handicap (opcional)') as HTMLInputElement

describe('FormInvitado — hándicap', () => {
  it('el campo es de texto (acepta el "+"; el teclado decimal del iPhone no tiene signo)', () => {
    pintar('')
    expect(campo().type).toBe('text')
    expect(campo().inputMode).toBe('text')
    expect(campo().placeholder).toBe('Ej: 18.5 o +2')
  })

  it.each(['', '+1.5', '18,5', '12.4'])('"%s" es válido: sin aviso y se envía', v => {
    const onJoin = pintar(v)
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(boton())
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it.each(['-', '+', '.', ','])('"%s" a medio escribir: el botón sigue activo; al tocarlo avisa en el campo, lo enfoca y no envía', v => {
    const onJoin = pintar(v)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(boton().disabled).toBe(false)
    fireEvent.click(boton())
    expect(onJoin).not.toHaveBeenCalled()
    const aviso = screen.getByRole('alert')
    expect(aviso.textContent).toBe(AVISO)
    expect(aviso.id).toBe('guest-handicap-error')
    expect(campo().getAttribute('aria-invalid')).toBe('true')
    expect(campo().getAttribute('aria-describedby')).toBe('guest-handicap-error')
    expect(document.activeElement).toBe(campo())
  })

  it('"abc" avisa en vivo, enlazado al campo, y no envía', () => {
    const onJoin = pintar('abc')
    const aviso = screen.getByRole('alert')
    expect(aviso.textContent).toBe(AVISO)
    expect(campo().getAttribute('aria-invalid')).toBe('true')
    expect(campo().getAttribute('aria-describedby')).toBe(aviso.id)
    fireEvent.click(boton())
    expect(onJoin).not.toHaveBeenCalled()
  })
})

describe('FormInvitado — nombre', () => {
  const campoNombre = () => screen.getByLabelText('Tu nombre *') as HTMLInputElement

  it.each(['', 'P', ' P '])('"%s" (menos de 2 letras): el botón sigue activo; al tocarlo avisa en el nombre, lo enfoca y no envía', nombre => {
    const onJoin = pintar('', nombre)
    expect(boton().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(boton())
    expect(onJoin).not.toHaveBeenCalled()
    const aviso = screen.getByRole('alert')
    expect(aviso.textContent).toBe('Ingresa tu nombre (al menos 2 caracteres).')
    expect(aviso.id).toBe('guest-name-error')
    expect(campoNombre().getAttribute('aria-invalid')).toBe('true')
    expect(campoNombre().getAttribute('aria-describedby')).toBe('guest-name-error')
    expect(document.activeElement).toBe(campoNombre())
  })

  it('con nombre corto y hándicap "+", avisa primero el nombre (de arriba hacia abajo)', () => {
    const onJoin = pintar('+', 'P')
    fireEvent.click(boton())
    expect(onJoin).not.toHaveBeenCalled()
    expect(screen.getAllByRole('alert').map(a => a.textContent)).toEqual(['Ingresa tu nombre (al menos 2 caracteres).'])
    expect(document.activeElement).toBe(campoNombre())
  })

  it('mientras se inscribe, el botón se apaga', () => {
    render(
      <FormInvitado slug="copa" guestName="Pedro Pérez" onGuestName={vi.fn()} guestHandicap=""
        onGuestHandicap={vi.fn()} guestJoining onJoin={vi.fn()} />,
    )
    expect((screen.getByRole('button', { name: 'Inscribiendo...' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
