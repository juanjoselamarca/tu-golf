import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PuntitoConfig } from '@/golf/formats/personalizado'
import type { BotonDeMarca, MarcasDeUnPuntito } from '@/golf/ronda-libre/marcas-de-la-timba'
import { PuntosEspecialesDelHoyo } from './PuntosEspecialesDelHoyo'

const sandy = { id: 's', tipo: 'sandy', valor: 1, activo: true } as PuntitoConfig
const chipingo = { id: 'c', tipo: 'chipingo', valor: 1, activo: true } as PuntitoConfig
const nombres = { a: 'Juan', b: 'Pedro', c: 'Tomás' }
const boton = (jugadorId: string, o: Partial<BotonDeMarca> = {}): BotonDeMarca =>
  ({ jugadorId, visible: true, marcado: false, enEspera: false, noCuenta: null, ...o })
const grupo = (puntito: PuntitoConfig, nombre: string, jugadores: BotonDeMarca[], extra: Partial<MarcasDeUnPuntito> = {}): MarcasDeUnPuntito =>
  ({ puntito, nombre, nota: null, pista: null, jugadores, ...extra })

function Bloque(p: { hoyo?: number; grupos: MarcasDeUnPuntito[]; onAlternar?: (id: string, puntito: PuntitoConfig) => void }) {
  return <PuntosEspecialesDelHoyo hoyo={p.hoyo ?? 4} birdieAutomatico nombres={nombres} grupos={p.grupos} onAlternar={p.onAlternar ?? vi.fn()} />
}
const fila = () => screen.getAllByRole('button').find(b => b.hasAttribute('aria-expanded'))!
const resumen = (container: HTMLElement) => container.querySelector('[data-resumen]')?.textContent

describe('PuntosEspecialesDelHoyo', () => {
  const sinMarcas = [
    grupo(sandy, 'Sandy', [boton('a', { visible: false }), boton('b'), boton('c')]),
    grupo(chipingo, 'Chipingo', [boton('a'), boton('b'), boton('c')]),
  ]

  it('cerrado por defecto: una sola fila "+ Punto especial", sin botones por jugador', () => {
    render(<Bloque grupos={sinMarcas} />)
    expect(fila().getAttribute('aria-expanded')).toBe('false')
    expect(fila().textContent).toContain('Punto especial')
    expect(screen.queryByRole('button', { name: 'Chipingo de Juan' })).toBeNull()
  })

  it('al tocar la fila se abre: botón por jugador visible, el oculto deja su hueco, marca con un toque', () => {
    const onAlternar = vi.fn()
    render(<Bloque grupos={sinMarcas} onAlternar={onAlternar} />)
    fireEvent.click(fila())
    expect(fila().getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Sandy de Juan' })).toBeNull()
    // Pedro sigue en la 2.ª celda de la grilla aunque Juan no tenga botón.
    const celdas = screen.getByRole('group', { name: 'Sandy' }).querySelectorAll(':scope > div:last-child > div')
    expect(celdas).toHaveLength(3)
    expect(celdas[1].textContent).toContain('Pedro')
    fireEvent.click(screen.getByRole('button', { name: 'Sandy de Pedro' }))
    expect(onAlternar).toHaveBeenCalledWith('b', sandy)
    expect(screen.getByText('El birdie se suma solo')).toBeTruthy()
  })

  it('pinta la nota y la pista que trae cada punto (sin reglas propias)', () => {
    render(<Bloque grupos={[
      grupo(sandy, 'Sandy', [boton('a', { visible: false })], { pista: 'Nadie en par o mejor' }),
      grupo(chipingo, 'Chipingo', [boton('a')], { nota: 'uno por hoyo' }),
    ]} />)
    fireEvent.click(fila())
    expect(screen.getByText('Sandy: nadie en par o mejor')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Chipingo' }).textContent).toContain('· uno por hoyo')
    expect(screen.queryByRole('group', { name: 'Sandy' })).toBeNull()
  })

  it('con marcas abre solo y, si se cierra, las resume: ✓ solo si cuenta y está enviada', () => {
    const grupos = [
      grupo(sandy, 'Sandy', [boton('a', { marcado: true, noCuenta: 'El sandy cuenta solo con par o mejor' }), boton('b')]),
      grupo(chipingo, 'Chipingo', [boton('a', { marcado: true, enEspera: true }), boton('b', { marcado: true }), boton('c')]),
    ]
    const { container } = render(<Bloque grupos={grupos} />)
    expect(fila().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Sandy de Juan' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('No cuenta: el sandy cuenta solo con par o mejor')).toBeTruthy()
    fireEvent.click(fila())
    expect(fila().getAttribute('aria-expanded')).toBe('false')
    expect(resumen(container)).toBe('Sandy · Juan (no cuenta), Chipingo · Juan (sin enviar), Chipingo · Pedro ✓')
    expect(screen.queryByRole('button', { name: 'Sandy de Juan' })).toBeNull()
  })

  it('al cambiar de hoyo vuelve a cerrado si el hoyo nuevo no tiene marcas', () => {
    const { rerender } = render(<Bloque hoyo={4} grupos={sinMarcas} />)
    fireEvent.click(fila())
    expect(fila().getAttribute('aria-expanded')).toBe('true')
    rerender(<Bloque hoyo={5} grupos={sinMarcas} />)
    expect(fila().getAttribute('aria-expanded')).toBe('false')
  })

  it('sin puntos especiales en el juego no muestra nada', () => {
    const { container } = render(<Bloque grupos={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
