import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { crearConfigDePlantilla } from '@/golf/formats/personalizado'
import type { VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'
import type { EstadoDelJuego } from '../../hooks/useJuegoDeLaTimba'

const panel = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }))
vi.mock('./PanelDelJuego', () => ({
  PanelDelJuego: (props: Record<string, unknown>) => { panel.props.push(props); return <p>panel del juego</p> },
}))
const compartir = vi.hoisted(() => ({ share: vi.fn(), resultado: { ok: true, method: 'webshare' } as { ok: boolean; method: string } }))
vi.mock('@/components/share/useShare', () => ({
  useShare: () => ({ share: async (p: unknown) => { compartir.share(p); return compartir.resultado }, isSharing: false }),
}))

import { TimbaEnVivo } from './TimbaEnVivo'
import { ALTO_NAVBAR_PX } from '@/lib/constants'

const JUGADORES = [
  { id: 'a', nombre: 'Pedro Soto', scores: { '1': 4 } },
  { id: 'b', nombre: 'Juan Pérez', scores: { '1': 5 } },
]
const vista: VistaDelJuego = {
  config: crearConfigDePlantilla('dos_cero_dos'),
  jugadorIds: ['a', 'b'],
  resultado: {
    hoyos: [], tramos: [], totales: { a: 3, b: 2 }, hoyosPendientes: [], sinHandicap: [],
    ranking: [{ jugadorId: 'a', puntos: 3, puesto: 1 }, { jugadorId: 'b', puntos: 2, puesto: 2 }],
  },
  golpesRecibidos: {}, marcas: [], retiros: {},
}
const OK: EstadoDelJuego = { estado: 'ok', vista, desactualizado: false, pedidaEn: 1 }

const montar = (finalizada: boolean, juego: EstadoDelJuego = OK) =>
  render(
    <TimbaEnVivo
      juego={juego} onReintentar={vi.fn()} jugadores={JUGADORES} hoyoInicio={1} holes={9}
      finalizada={finalizada} cancha="Los Leones" url="https://golfersplus.vercel.app/ronda-libre/ABC" onIngresar={vi.fn()}
    />,
  )

describe('TimbaEnVivo', () => {
  beforeEach(() => { panel.props.length = 0; compartir.share.mockClear() })

  it('los nombres de la tabla quedan fijos bajo el navbar al bajar (la página hace scroll con la ventana)', () => {
    montar(false)
    expect(panel.props.at(-1)).toMatchObject({ encabezadoFijoEn: `${ALTO_NAVBAR_PX}px` })
  })

  it('en curso: la pestaña Juego, sin resultado final', () => {
    montar(false)
    expect(screen.queryByText('Ganó Pedro')).toBeNull()
    expect(screen.getByText('panel del juego')).toBeTruthy()
  })

  it('finalizada: primero el resultado final; "Hoyo a hoyo" abre la tabla del juego y se puede volver', () => {
    montar(true)
    expect(screen.getByText('Ganó Pedro')).toBeTruthy()
    expect(screen.getByText('Por un punto sobre Juan.')).toBeTruthy()
    expect(screen.queryByText('panel del juego')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hoyo a hoyo' }))
    expect(screen.getByText('panel del juego')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al resultado' }))
    expect(screen.getByText('Ganó Pedro')).toBeTruthy()
  })

  it('finalizada sin el juego cargado: muestra el panel con su estado (cargando, sin señal…), nunca un ganador', () => {
    montar(true, { estado: 'cargando' })
    expect(screen.queryByText(/Ganó/)).toBeNull()
    expect(panel.props.at(-1)).toMatchObject({ juego: { estado: 'cargando' } })
  })

  it('Compartir al grupo: el texto de puntos con el link a la ronda', async () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir al grupo' }))
    await waitFor(() => expect(compartir.share).toHaveBeenCalled())
    const payload = compartir.share.mock.calls[0][0] as { text: string; url: string }
    expect(payload.url).toBe('https://golfersplus.vercel.app/ronda-libre/ABC')
    expect(payload.text).toContain('Ganó Pedro. Por un punto sobre Juan.')
    expect(payload.text).toContain('Los Leones')
    expect(payload.text.split('\n').at(-1)).toBe('https://golfersplus.vercel.app/ronda-libre/ABC')
  })

  it('si terminó copiado al portapapeles, lo avisa', async () => {
    compartir.resultado = { ok: true, method: 'clipboard' }
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir al grupo' }))
    expect(await screen.findByText('Resultado copiado: pégalo en el grupo.')).toBeTruthy()
    compartir.resultado = { ok: true, method: 'webshare' }
  })
})
