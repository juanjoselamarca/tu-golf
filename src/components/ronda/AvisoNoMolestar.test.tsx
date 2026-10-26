import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HojaNoMolestar } from './AvisoNoMolestar'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const ESCRITORIO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function abrir(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  const onClose = vi.fn()
  render(<HojaNoMolestar onClose={onClose} />)
  return onClose
}

describe('HojaNoMolestar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('muestra el copy aprobado, como diálogo modal con título', () => {
    abrir(IPHONE)
    const dialogo = screen.getByRole('dialog', { name: 'Activa “No molestar” durante tu ronda' })
    expect(dialogo.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Strong recommendation')).toBeTruthy()
    expect(screen.getByText('Mejora el potencial de tu score.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Activar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeTruthy()
  })

  it('"Ahora no" cierra', () => {
    const onClose = abrir(IPHONE)
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape cierra', () => {
    const onClose = abrir(ANDROID)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('iPhone: "Activar" no cierra, muestra los pasos de iPhone y "Listo" cierra', () => {
    const onClose = abrir(IPHONE)
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Desliza desde la esquina superior derecha.')).toBeTruthy()
    expect(screen.getByText('Toca Concentración → No molestar.')).toBeTruthy()
    expect(screen.queryByText('Desliza desde arriba hacia abajo.')).toBeNull()
    // Con un solo sistema no se rotula cuál es.
    expect(screen.queryByRole('heading', { name: 'iPhone' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Cómo activar No molestar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Android: muestra sólo los pasos de Android', () => {
    abrir(ANDROID)
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    expect(screen.getByText('Desliza desde arriba hacia abajo.')).toBeTruthy()
    expect(screen.getByText('Toca No molestar.')).toBeTruthy()
    expect(screen.queryByText('Desliza desde la esquina superior derecha.')).toBeNull()
  })

  it('sistema desconocido: muestra ambos, rotulados', () => {
    abrir(ESCRITORIO)
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    expect(screen.getByRole('heading', { name: 'iPhone' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Android' })).toBeTruthy()
    expect(screen.getByText('Desliza desde la esquina superior derecha.')).toBeTruthy()
    expect(screen.getByText('Desliza desde arriba hacia abajo.')).toBeTruthy()
  })
})
