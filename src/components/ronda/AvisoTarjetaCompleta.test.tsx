// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AvisoTarjetaCompleta } from './AvisoTarjetaCompleta'

afterEach(cleanup)

const aviso = (completa: boolean, enUltimoHoyo: boolean) =>
  render(<AvisoTarjetaCompleta completa={completa} enUltimoHoyo={enUltimoHoyo} />).container.firstChild as HTMLElement | null

describe('AvisoTarjetaCompleta', () => {
  it('con la tarjeta completa se ve, en cualquier hoyo', () => {
    expect(aviso(true, false)?.style.visibility).toBe('visible')
    expect(aviso(true, true)?.style.visibility).toBe('visible')
  })
  it('en el último hoyo sin completar reserva el alto sin mostrarse: los controles no saltan al anotar', () => {
    expect(aviso(false, true)?.style.visibility).toBe('hidden')
  })
  it('antes del último hoyo sin completar no ocupa lugar', () => {
    expect(aviso(false, false)).toBeNull()
  })
})
