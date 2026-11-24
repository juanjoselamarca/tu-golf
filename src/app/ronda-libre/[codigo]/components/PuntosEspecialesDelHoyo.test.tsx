import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PuntitoConfig } from '@/golf/formats/personalizado'
import type { MarcasDeUnPuntito } from '@/golf/ronda-libre/marcas-de-la-timba'
import { PuntosEspecialesDelHoyo } from './PuntosEspecialesDelHoyo'

const sandy = { id: 's', tipo: 'sandy', valor: 1, activo: true } as PuntitoConfig
const chipingo = { id: 'c', tipo: 'chipingo', valor: 1, activo: true } as PuntitoConfig
const nombres = { a: 'Juan', b: 'Pedro', c: 'Tomás' }
const boton = (jugadorId: string, marcado = false, noCuenta: string | null = null) => ({ jugadorId, marcado, enEspera: false, noCuenta })

function Bloque(p: { hoyo?: number; grupos: MarcasDeUnPuntito[]; onAlternar?: (id: string, puntito: PuntitoConfig) => void }) {
  return <PuntosEspecialesDelHoyo hoyo={p.hoyo ?? 4} birdieAutomatico nombres={nombres} grupos={p.grupos} onAlternar={p.onAlternar ?? vi.fn()} />
}
const fila = () => screen.getAllByRole('button').find(b => b.hasAttribute('aria-expanded'))!

describe('PuntosEspecialesDelHoyo', () => {
  const sinMarcas: MarcasDeUnPuntito[] = [
    { puntito: sandy, nombre: 'Sandy', jugadores: [boton('b')] },
    { puntito: chipingo, nombre: 'Chipingo', jugadores: [boton('a'), boton('b'), boton('c')] },
  ]

  it('cerrado por defecto: una sola fila "+ Punto especial", sin botones por jugador', () => {
    render(<Bloque grupos={sinMarcas} />)
    expect(fila().getAttribute('aria-expanded')).toBe('false')
    expect(fila().textContent).toContain('Punto especial')
    expect(screen.queryByRole('button', { name: 'Chipingo de Juan' })).toBeNull()
  })

  it('al tocar la fila se abre: un botón por jugador ofrecido, marca con un toque', () => {
    const onAlternar = vi.fn()
    render(<Bloque grupos={sinMarcas} onAlternar={onAlternar} />)
    fireEvent.click(fila())
    expect(fila().getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Sandy de Juan' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sandy de Pedro' }))
    expect(onAlternar).toHaveBeenCalledWith('b', sandy)
    expect(screen.getByText('El birdie se suma solo')).toBeTruthy()
  })

  it('con marcas abre solo y, si se cierra, las resume (incluida la que no cuenta)', () => {
    const grupos = [
      { puntito: sandy, nombre: 'Sandy', jugadores: [boton('a', true, 'El sandy cuenta solo con par o mejor'), boton('b')] },
      { puntito: chipingo, nombre: 'Chipingo', jugadores: [boton('a'), boton('b', true), boton('c')] },
    ]
    render(<Bloque grupos={grupos} />)
    expect(fila().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Sandy de Juan' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('No cuenta: el sandy cuenta solo con par o mejor')).toBeTruthy()
    fireEvent.click(fila())
    expect(fila().getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Sandy · Juan (no cuenta), Chipingo · Pedro ✓')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sandy de Juan' })).toBeNull()
  })

  it('al cambiar de hoyo vuelve a cerrado si el hoyo nuevo no tiene marcas', () => {
    const { rerender } = render(<Bloque hoyo={4} grupos={sinMarcas} />)
    fireEvent.click(fila())
    expect(fila().getAttribute('aria-expanded')).toBe('true')
    rerender(<Bloque hoyo={5} grupos={sinMarcas} />)
    expect(fila().getAttribute('aria-expanded')).toBe('false')
  })

  it('sandy sin nadie en par o mejor: explica cuándo aparece', () => {
    render(<Bloque grupos={[{ puntito: sandy, nombre: 'Sandy', jugadores: [] }, sinMarcas[1]]} />)
    fireEvent.click(fila())
    expect(screen.getByText('Sandy: aparece cuando alguien anota par o mejor.')).toBeTruthy()
  })

  it('sin puntos especiales en el juego no muestra nada', () => {
    const { container } = render(<Bloque grupos={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
