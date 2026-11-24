import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MS_ANTES_DE_ARMAR } from '@/components/ronda/HojaDelScorer'
import { PanelDelJuego, TEXTO_SIN_JUEGO } from './PanelDelJuego'
import { RetiroDeJugadores } from './RetiroDeJugadores'
import { AVISO_GOLPES_DESDE_EL_RETIRO, DETALLE_RETIRO, HojaDeRetiro } from './HojaDeRetiro'
import { AvisoMarcasRechazadas } from './AvisoMarcasRechazadas'
import { PestanasDeLaTimba } from './PestanasDeLaTimba'
import { TarjetaDeGolpes } from './TimbaEnVivo'
import { ResultadoFinalDeLaTimba } from './ResultadoFinalDeLaTimba'

describe('PanelDelJuego', () => {
  const comun = { nombres: {}, hoyoActual: null, onReintentar: vi.fn() }
  it('sin juego: el motivo', () => {
    render(<PanelDelJuego {...comun} juego={{ estado: 'sin_juego', motivo: 'jugadores_cambiaron' }} />)
    expect(screen.getByText(TEXTO_SIN_JUEGO.jugadores_cambiaron)).toBeTruthy()
  })
  it('error: reintentar', () => {
    const onReintentar = vi.fn()
    render(<PanelDelJuego {...comun} onReintentar={onReintentar} juego={{ estado: 'error' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onReintentar).toHaveBeenCalled()
  })
})

describe('RetiroDeJugadores', () => {
  it('pide el retiro (la hoja la abre quien lo usa) y el retirado se puede deshacer', () => {
    const onPedirRetiro = vi.fn()
    const onDeshacer = vi.fn()
    render(
      <RetiroDeJugadores ocupado={false} onPedirRetiro={onPedirRetiro} onDeshacer={onDeshacer} jugadores={[
        { id: 'a', nombre: 'Juan', retiradoDesde: null, desdeSiSeVa: 8 },
        { id: 'b', nombre: 'Pedro', retiradoDesde: 5, desdeSiSeVa: 8 },
      ]} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retirar a Juan' }))
    expect(onPedirRetiro).toHaveBeenCalledWith('a')
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(onDeshacer).toHaveBeenCalledWith('b')
  })
})

describe('HojaDeRetiro', () => {
  it('confirma desde el hoyo calculado, o desde otro si se acordaron tarde', () => {
    vi.useFakeTimers()
    try {
      const onConfirmar = vi.fn()
      render(<HojaDeRetiro jugador={{ nombre: 'Juan', desdeSiSeVa: 8, hoyosParaElegir: [1, 2, 3, 4, 5, 6, 7, 8] }} onConfirmar={onConfirmar} onCancelar={vi.fn()} />)
      const hoja = screen.getByRole('dialog')
      expect(hoja.textContent).toContain('¿Juan se retira desde el hoyo 8?')
      expect(within(hoja).getByRole('radio', { name: 'Hoyo 8' }).getAttribute('aria-checked')).toBe('true')
      fireEvent.click(within(hoja).getByRole('radio', { name: 'Hoyo 6' }))
      expect(hoja.textContent).toContain('¿Juan se retira desde el hoyo 6?')
      act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
      fireEvent.click(screen.getByRole('button', { name: 'Retirar' }))
      expect(onConfirmar).toHaveBeenCalledWith(6)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('HojaDeRetiro: elegir un hoyo ya anotado', () => {
  it('avisa que lo anotado desde ese hoyo deja de contar, solo si hay golpes desde ahí', () => {
    render(<HojaDeRetiro jugador={{ nombre: 'Juan', desdeSiSeVa: 8, hoyosParaElegir: [1, 2, 3, 4, 5, 6, 7, 8], conGolpesDesde: [1, 2, 3, 4, 5, 6, 7] }} onConfirmar={vi.fn()} onCancelar={vi.fn()} />)
    const hoja = screen.getByRole('dialog')
    expect(hoja.textContent).not.toContain(AVISO_GOLPES_DESDE_EL_RETIRO)
    fireEvent.click(within(hoja).getByRole('radio', { name: 'Hoyo 6' }))
    expect(hoja.textContent).toContain(`${DETALLE_RETIRO} ${AVISO_GOLPES_DESDE_EL_RETIRO}`)
    expect(AVISO_GOLPES_DESDE_EL_RETIRO).toBe('Lo que anotó desde ese hoyo deja de contar.')
  })
})

describe('AvisoMarcasRechazadas y pestañas', () => {
  it('el aviso nombra cada marca y se cierra con Entendido', () => {
    const onEntendido = vi.fn()
    render(<AvisoMarcasRechazadas lineas={['Sandy de Diego en el hoyo 4']} onEntendido={onEntendido} />)
    expect(screen.getByRole('alert').textContent).toContain('Sandy de Diego en el hoyo 4')
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(onEntendido).toHaveBeenCalled()
  })

  it('pestañas: la activa queda seleccionada y la flecha cambia', () => {
    const onCambiar = vi.fn()
    render(<PestanasDeLaTimba activa="tarjeta" onCambiar={onCambiar} />)
    expect(screen.getByRole('tab', { name: 'Tarjeta' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onCambiar).toHaveBeenCalledWith('juego')
  })

  it('tarjeta de golpes en vivo: hasta el último hoyo con golpes, el que falta con "·"', () => {
    render(<TarjetaDeGolpes hoyos={[1, 2, 3]} jugadores={[
      { id: 'a', nombre: 'Juan Pérez', scores: { 1: 4, 2: 5 } },
      { id: 'b', nombre: 'Pedro Soto', scores: { 1: 3 } },
    ]} />)
    const filas = screen.getAllByRole('row')
    expect(filas).toHaveLength(3)
    expect(within(filas[2]).getByRole('cell', { name: 'sin golpes' }).textContent).toBe('·')
  })
})

describe('ResultadoFinalDeLaTimba', () => {
  it('cada tramo es un grupo con nombre; el que no se jugó lo dice, sin marcador; sin bajada no queda un párrafo vacío', () => {
    const tramo = (jugado: boolean, ganadora: 0 | 1 | null) => ({
      parejas: ['Juan y Pedro', 'Diego y Tomás'] as [string, string], puntos: [jugado ? 9 : 0, jugado ? 3 : 0] as [number, number],
      jugado, marcador: jugado ? '9 – 3' : 'No se jugó', ganadora,
    })
    const { container } = render(
      <ResultadoFinalDeLaTimba
        resultado={{
          encabezado: 'La Colombiana · 12 de 18 hoyos · Gross', titular: 'Ganó Juan', bajada: '',
          ranking: [], tramos: [tramo(true, 0), tramo(false, null)], notaTramos: null, puntosEspeciales: null,
        }}
        onHoyoAHoyo={() => {}} onCompartir={() => {}}
      />,
    )
    expect(screen.getByRole('group', { name: 'Juan y Pedro 9, Diego y Tomás 3, ganó Juan y Pedro' })).toBeTruthy()
    const sinJugar = screen.getByRole('group', { name: 'Juan y Pedro contra Diego y Tomás, no se jugó' })
    expect(sinJugar.textContent).toContain('No se jugó')
    expect(sinJugar.textContent).not.toMatch(/\d/)
    expect(container.querySelector('header p')).toBeNull()
  })
})
