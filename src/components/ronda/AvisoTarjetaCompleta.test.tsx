// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AvisoTarjetaCompleta } from './AvisoTarjetaCompleta'

afterEach(cleanup)

const aviso = (completa: boolean, enUltimoHoyo: boolean) =>
  render(<AvisoTarjetaCompleta completa={completa} enUltimoHoyo={enUltimoHoyo} />).container.firstChild as HTMLElement | null

describe('AvisoTarjetaCompleta', () => {
  it('con la tarjeta completa se ve, en cualquier hoyo', () => {
    expect(aviso(true, false)?.textContent).toBe('Tarjeta completa · Finalizar ronda')
    expect(aviso(true, true)?.textContent).toBe('Tarjeta completa · Finalizar ronda')
  })
  it('en el último hoyo sin completar reserva el alto sin mostrarse: los controles no saltan al anotar', () => {
    // La región queda montada con un espacio: al completar cambia el texto y se anuncia.
    const reserva = aviso(false, true)
    expect(reserva?.getAttribute('role')).toBe('status')
    expect(reserva?.textContent).not.toContain('Tarjeta completa')
    expect(reserva?.textContent?.length).toBe(1)
  })
  it('antes del último hoyo sin completar no ocupa lugar', () => {
    expect(aviso(false, false)).toBeNull()
  })
})
