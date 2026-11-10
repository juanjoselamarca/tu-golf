// Invitado del organizador: el hándicap se tipea como texto y se lee con leerCampoHandicap.
// Con type="number", "+2" dejaba el campo en '' y el invitado quedaba inscrito sin hándicap, sin aviso.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'

vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => ({ allowed: true }) }))
vi.mock('@/components/billing/UpsellCard', () => ({ UpsellCard: () => null }))

import { InscribirPlayerForm } from '../InscribirPlayerForm'

function pintar(guestHcp: string) {
  const noop = () => {}
  return render(
    <InscribirPlayerForm
      dropdownRef={createRef<HTMLDivElement>()} search="" setSearch={noop} results={[]} showResults={false}
      setShowResults={noop} selectedProfile={null} setSelectedProfile={noop} loading={false} onInscribir={noop}
      mode="guest" setMode={noop} guestName="Juan" setGuestName={noop} guestHcp={guestHcp} setGuestHcp={noop}
      onInscribirGuest={noop}
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

  it.each(['+2', '-2', '18,5', '12.4', ''])('"%s" es válido: sin aviso y se puede agregar', v => {
    pintar(v)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(boton().disabled).toBe(false)
  })

  it('"abc" avisa y no deja agregar', () => {
    pintar('abc')
    expect(screen.getByRole('alert').textContent).toBe('Escribe un número: 12.4, o +2 si es plus.')
    expect(boton().disabled).toBe(true)
  })
})

describe('InscribirPlayerForm — hándicap a medio escribir', () => {
  it.each(['+', '-'])('"%s" no deja agregar, pero tampoco avisa', v => {
    pintar(v)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(boton().disabled).toBe(true)
  })

  it('el aviso queda enlazado al campo (aria-describedby + aria-invalid)', () => {
    pintar('abc')
    const input = screen.getByLabelText('Handicap (opcional)')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })
})
