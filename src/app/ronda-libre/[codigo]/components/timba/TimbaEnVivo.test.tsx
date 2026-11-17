import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const juego = vi.hoisted(() => ({ opciones: [] as unknown[] }))
vi.mock('../../hooks/useJuegoDeLaTimba', () => ({
  useJuegoDeLaTimba: (_codigo: string, opciones: unknown) => {
    juego.opciones.push(opciones)
    return { juego: { estado: 'cargando' }, vista: null, vistaPedidaEn: null, recargar: vi.fn() }
  },
}))

const panel = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }))
vi.mock('./PanelDelJuego', () => ({
  PanelDelJuego: (props: Record<string, unknown>) => { panel.props.push(props); return null },
}))

import { TimbaEnVivo } from './TimbaEnVivo'
import { ALTO_NAVBAR_PX } from '@/lib/constants'

const montar = (cerrada: boolean) =>
  render(<TimbaEnVivo codigo="ABC" jugadores={[]} hoyoInicio={1} holes={9} firma="" cerrada={cerrada} onIngresar={vi.fn()} />)

describe('TimbaEnVivo', () => {
  it('en curso pide el juego cada 20 s (intervalo por defecto); finalizada no lo vuelve a pedir', () => {
    montar(false)
    expect(juego.opciones.at(-1)).toMatchObject({ activo: true, intervaloS: undefined })
    montar(true)
    expect(juego.opciones.at(-1)).toMatchObject({ activo: true, intervaloS: 0 })
  })

  it('los nombres de la tabla quedan fijos bajo el navbar al bajar (la página hace scroll con la ventana)', () => {
    montar(false)
    expect(panel.props.at(-1)).toMatchObject({ encabezadoFijoEn: `${ALTO_NAVBAR_PX}px` })
  })
})
