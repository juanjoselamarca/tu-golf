/**
 * Aviso sin tarjeta del scorer del torneo: jerarquía de botones según el resultado de "Buscar mi tarjeta"
 * (P2 de la vuelta 3 de Fable en #828).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { AvisoSinTarjeta } from './AvisoSinTarjeta'
import { avisoSinAcceso, avisoSinTarjeta } from '../hooks/acceso-guardado'

afterEach(cleanup)

const aviso = avisoSinTarjeta('copa')
const login = avisoSinAcceso({ slug: 'copa', motivo: 'sin_sesion', jugadorId: 'p1' })

describe('AvisoSinTarjeta', () => {
  it('sin resultado: "Buscar mi tarjeta" es el botón principal y no hay login', () => {
    const buscar = vi.fn()
    render(<AvisoSinTarjeta aviso={aviso} buscando={false} resultado={null} buscar={buscar} login={null} />)
    const boton = screen.getByRole('button', { name: 'Buscar mi tarjeta' })
    expect(boton.style.background).toBe('var(--brand)')
    expect(boton.style.minHeight).toBe('44px')
    expect(screen.queryByTestId('login-para-buscar')).toBeNull()
    fireEvent.click(boton)
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('sin sesión: "Iniciar sesión" pasa a principal (relleno, 44 px, va primero) y buscar queda secundario', () => {
    render(<AvisoSinTarjeta aviso={aviso} buscando={false} resultado="sin_sesion" buscar={vi.fn()} login={login} />)
    const iniciar = screen.getByRole('link', { name: 'Iniciar sesión' })
    expect(iniciar.getAttribute('href')).toBe(login.href)
    expect(decodeURIComponent(login.href)).toContain('/torneo/copa/score?jugador=p1')
    expect(iniciar.style.background).toBe('var(--brand)')
    expect(iniciar.style.minHeight).toBe('44px')
    const buscar = screen.getByRole('button', { name: 'Buscar mi tarjeta' })
    expect(buscar.style.background).not.toBe('var(--brand)')
    expect(buscar.style.textDecoration).toBe('underline')
    expect(buscar.style.minHeight).toBe('44px')
    // Orden de lectura: el principal antes que el secundario.
    expect(iniciar.compareDocumentPosition(buscar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('resultado-buscar-tarjeta').textContent).toBe('Para buscarla necesitas tu cuenta.')
  })

  it('buscando: el botón queda deshabilitado y lo dice', () => {
    render(<AvisoSinTarjeta aviso={aviso} buscando resultado={null} buscar={vi.fn()} login={null} />)
    const boton = screen.getByRole('button', { name: 'Buscando...' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
  })
})
