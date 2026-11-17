import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { TablaDelJuego } from '@/golf/ronda-libre/tabla-del-juego'
import type { PuntitoConfig } from '@/golf/formats/personalizado'
import { MS_ANTES_DE_ARMAR } from '@/components/ronda/ConfirmarFinalizarHoja'
import { JuegoDeLaTimba, avisoNetoComoGross } from './JuegoDeLaTimba'
import { PanelDelJuego, TEXTO_SIN_JUEGO } from './PanelDelJuego'
import { PuntosEspecialesDelHoyo } from './PuntosEspecialesDelHoyo'
import { RetiroDeJugadores } from './RetiroDeJugadores'
import { AVISO_GOLPES_DESDE_EL_RETIRO, DETALLE_RETIRO, HojaDeRetiro } from './HojaDeRetiro'
import { AvisoMarcasRechazadas } from './AvisoMarcasRechazadas'
import { PestanasDeLaTimba } from './PestanasDeLaTimba'
import { TarjetaDeGolpes } from './TimbaEnVivo'
import { ResultadoFinalDeLaTimba } from './ResultadoFinalDeLaTimba'

const tabla: TablaDelJuego = {
  titulo: 'La Colombiana', hoyosPuntuados: 7, totalHoyos: 18,
  columnas: [{ jugadorId: 'a', nombre: 'Juan' }, { jugadorId: 'b', nombre: 'Pedro' }],
  ranking: [
    { jugadorId: 'a', nombre: 'Juan', puesto: 1, puntos: 2, texto: '+2' },
    { jugadorId: 'b', nombre: 'Pedro', puesto: 1, puntos: 2, texto: '+2' },
  ],
  marcadorActual: { parejas: ['Juan y Diego', 'Pedro y Tomás'], puntos: [2, 2] },
  filas: [
    { tipo: 'tramo', indice: 0, marcador: { parejas: ['Juan y Diego', 'Pedro y Tomás'], puntos: [2, 2] } },
    { tipo: 'hoyo', numero: 1, pendiente: false, sinJugar: false, celdas: [{ jugadorId: 'a', texto: '+1', golpesRecibidos: 1 }, { jugadorId: 'b', texto: '−1', golpesRecibidos: 0 }] },
    { tipo: 'hoyo', numero: 2, pendiente: true, sinJugar: false, celdas: [{ jugadorId: 'a', texto: 'falta anotar', golpesRecibidos: 1 }, { jugadorId: 'b', texto: 'falta anotar', golpesRecibidos: 0 }] },
  ],
  esNeto: true, sinHandicap: [],
}

describe('JuegoDeLaTimba', () => {
  it('encabezado, ranking con empate compartido, marcador y tabla con pendiente y golpe recibido', () => {
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('heading', { name: 'La Colombiana' })).toBeTruthy()
    expect(screen.getByText('7 de 18 hoyos')).toBeTruthy()
    const ranking = within(screen.getByRole('list', { name: 'Ranking de puntos' })).getAllByRole('listitem')
    expect(ranking.map(li => li.textContent)).toEqual(['1Juan+2', '1Pedro+2'])
    expect(screen.getAllByLabelText('Juan y Diego 2, Pedro y Tomás 2')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: '+1, recibe 1 golpe' })).toBeTruthy()
    // Hoyo pendiente: una sola leyenda, sin la marca de golpe recibido (no queda "• ·").
    const pendiente = screen.getAllByRole('cell', { name: 'falta anotar' })
    expect(pendiente).toHaveLength(1)
    expect(within(pendiente[0].parentElement as HTMLElement).queryByTestId('golpe-recibido')).toBeNull()
    expect(screen.getByText(/golpe recibido en el hoyo/)).toBeTruthy()
  })

  it('hoyo que nadie jugó: una sola leyenda "No se jugó", no "falta anotar"', () => {
    const filas = tabla.filas.map(f => (f.tipo === 'hoyo' && f.numero === 2 ? { ...f, sinJugar: true, celdas: f.celdas.map(c => ({ ...c, texto: 'No se jugó' })) } : f))
    render(<JuegoDeLaTimba tabla={{ ...tabla, filas }} />)
    expect(screen.getAllByRole('cell', { name: 'No se jugó' })).toHaveLength(1)
    expect(screen.queryByRole('cell', { name: 'falta anotar' })).toBeNull()
  })

  it('neto sin hándicap: avisa quién falta y no muestra la leyenda de golpes', () => {
    render(<JuegoDeLaTimba tabla={{ ...tabla, sinHandicap: ['Pedro', 'Tomás'] }} />)
    expect(screen.getByRole('note').textContent).toBe(avisoNetoComoGross(['Pedro', 'Tomás']))
    expect(avisoNetoComoGross(['Pedro', 'Tomás'])).toContain('de Pedro y Tomás')
    expect(screen.queryByText(/golpe recibido en el hoyo/)).toBeNull()
  })
})

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

describe('PuntosEspecialesDelHoyo', () => {
  const sandy = { id: 's', tipo: 'sandy', valor: 1, activo: true } as PuntitoConfig
  it('marca con un toque, muestra "no cuenta" con la razón y no ofrece al retirado', () => {
    const onAlternar = vi.fn()
    render(
      <PuntosEspecialesDelHoyo
        hoyo={4} birdieAutomatico nombres={{ a: 'Juan', b: 'Pedro', c: 'Tomás' }} retirados={new Set(['c'])} onAlternar={onAlternar}
        grupos={[{ puntito: sandy, nombre: 'Sandy', jugadores: [
          { jugadorId: 'a', marcado: true, enEspera: false, noCuenta: 'Hizo más que par' },
          { jugadorId: 'b', marcado: false, enEspera: false, noCuenta: null },
          { jugadorId: 'c', marcado: false, enEspera: false, noCuenta: null },
        ] }]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Sandy de Juan' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('No cuenta: hizo más que par')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sandy de Tomás' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sandy de Pedro' }))
    expect(onAlternar).toHaveBeenCalledWith('b', sandy)
    expect(screen.getByText('El birdie se suma solo')).toBeTruthy()
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
