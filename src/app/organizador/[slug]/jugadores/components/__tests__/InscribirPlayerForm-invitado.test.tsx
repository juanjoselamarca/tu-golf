// Invitado del organizador: el hándicap se tipea como texto y se lee con leerCampoHandicap.
// Con type="number", "+2" dejaba el campo en '' y el invitado quedaba inscrito sin hándicap, sin aviso.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'

vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => ({ allowed: true }) }))
vi.mock('@/components/billing/UpsellCard', () => ({ UpsellCard: () => null }))

import { InscribirPlayerForm } from '../InscribirPlayerForm'

const AVISO = 'Escribe un número: 12.4, o +2 si es plus, o déjalo vacío.'
let onInscribirGuest = vi.fn()

function pintar(guestHcp: string) {
  const noop = () => {}
  onInscribirGuest = vi.fn()
  return render(
    <InscribirPlayerForm
      dropdownRef={createRef<HTMLDivElement>()} search="" setSearch={noop} results={[]} showResults={false}
      setShowResults={noop} selectedProfile={null} setSelectedProfile={noop} loading={false} onInscribir={noop}
      mode="guest" setMode={noop} guestName="Juan" setGuestName={noop} guestHcp={guestHcp} setGuestHcp={noop}
      onInscribirGuest={onInscribirGuest}
    />,
  )
}

// El primero es la pestaña; el último, el botón que envía.
const boton = () => screen.getAllByRole('button', { name: 'Agregar invitado' }).at(-1) as HTMLButtonElement

describe('InscribirPlayerForm — hándicap del invitado', () => {
  it('el campo es de texto (acepta el "+" del plus; el teclado decimal del iPhone no tiene signo)', () => {
    pintar('')
    const input = screen.getByLabelText('Handicap (opcional)') as HTMLInputElement
    expect(input.type).toBe('text')
    expect(input.inputMode).not.toBe('decimal')
  })

  it.each(['+2', '-2', '18,5', '12.4', ''])('"%s" es válido: sin aviso y se agrega', v => {
    pintar(v)
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(boton())
    expect(onInscribirGuest).toHaveBeenCalledTimes(1)
  })

  it('"abc" avisa en vivo y no agrega', () => {
    pintar('abc')
    expect(screen.getByRole('alert').textContent).toBe(AVISO)
    fireEvent.click(boton())
    expect(onInscribirGuest).not.toHaveBeenCalled()
  })
})

describe('InscribirPlayerForm — hándicap a medio escribir', () => {
  it.each(['+', '-'])('"%s": sin aviso mientras se tipea; el botón sigue activo y al tocarlo avisa, enfoca y no agrega', v => {
    pintar(v)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(boton().disabled).toBe(false)
    fireEvent.click(boton())
    expect(onInscribirGuest).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(AVISO)
    expect(document.activeElement).toBe(screen.getByLabelText('Handicap (opcional)'))
  })

  it('el aviso queda enlazado al campo (aria-describedby + aria-invalid)', () => {
    pintar('abc')
    const input = screen.getByLabelText('Handicap (opcional)')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })
})
