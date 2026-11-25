import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { CONFIG_SKINS_POR_DEFECTO, type ConfigSkins } from '@/golf/formats/skins'
import { resultadoDelSkins, type VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import { armarTablaDelSkins } from '@/golf/ronda-libre/tabla-del-skins'
import type { EstadoDelJuego } from '../../hooks/useJuegoDeLaTimba'
import { SkinsEnVivo } from './SkinsEnVivo'

const compartido: unknown[] = []
vi.mock('@/components/share/useShare', () => ({
  useShare: () => ({ share: async (p: unknown) => { compartido.push(p); return { method: 'native', ok: true } }, isSharing: false }),
}))

const IDS = ['a', 'b', 'c']
const JUGADORES = [
  { id: 'a', nombre: 'Ana Pérez', scores: {} }, { id: 'b', nombre: 'Beto Soto', scores: {} }, { id: 'c', nombre: 'Coni Díaz', scores: {} },
]
const HOYOS = [{ numero: 1, par: 4, si: 1 }, { numero: 2, par: 3, si: 2 }, { numero: 3, par: 5, si: 3 }]

function juego(scores: Record<string, Record<number, number>>, c: Partial<ConfigSkins>, rondaCerrada = false): EstadoDelJuego<VistaDelSkinsEnElScorer> {
  const config = { ...CONFIG_SKINS_POR_DEFECTO, modo: 'gross' as const, ...c }
  const resultado = resultadoDelSkins({
    reglas: { config, jugadorIds: IDS },
    contexto: { jugadores: IDS.map(id => ({ nombre: id, courseHandicap: null })), hoyos: HOYOS },
    scores, fuera: { c: { 1: true } },
  })!
  return {
    estado: 'ok', desactualizado: false, pedidaEn: 1, firma: 'f', publica: false,
    vista: {
      formato: 'skins', config: { puntitos: [] }, jugadorIds: IDS, marcas: [], retiros: {}, rondaCerrada,
      tabla: armarTablaDelSkins(resultado, { config, retiros: {}, fuera: { c: { 1: true } } }),
    },
  }
}

const vista = (j: EstadoDelJuego<VistaDelSkinsEnElScorer>, finalizada = false) => render(
  <SkinsEnVivo juego={j} onReintentar={() => {}} jugadores={JUGADORES} hoyoInicio={1} holes={3} finalizada={finalizada} cancha="Los Leones" url="https://x/ronda-libre/S1" />,
)

describe('SkinsEnVivo', () => {
  it('en curso: lo que vale el hoyo en juego, la tira con empate y disputa, y la plata estimada con «~»', () => {
    // Hoyo 1 empatado entre Ana y Beto (Coni X): el 2 vale 2 y está en disputa con el 3 de Ana.
    vista(juego({ a: { 1: 4, 2: 3 }, b: { 1: 4 }, c: {} }, { pozoPorJugador: 1000 }))
    expect(screen.getByText('Hoyo 2 vale 2 skins')).toBeTruthy()
    expect(screen.getByLabelText(/Hoyo 1: empate, pasa al siguiente/)).toBeTruthy()
    expect(screen.getByLabelText(/Hoyo 2: en juego, vale 2 skins\. Mejor gross hasta ahora: 3/)).toBeTruthy()
    expect(screen.getByLabelText('Hoyo 3: por jugar')).toBeTruthy()
    // Nadie ganó aún: no se inventa plata.
    expect(screen.getByText(/nadie ha ganado un skin/)).toBeTruthy()
    expect(screen.queryByText(/~\$/)).toBeNull()
  })

  it('con un skin ganado la plata va estimada; la tarjeta muestra la X', () => {
    vista(juego({ a: { 1: 3 }, b: { 1: 4 }, c: {} }, { pozoPorJugador: 1000 }))
    expect(screen.getByText('~$3.000')).toBeTruthy()
    expect(screen.getByText(/skin a ~\$3\.000/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Tarjeta' }))
    expect(screen.getByLabelText('fuera del hoyo')).toBeTruthy()
  })

  it('cerrada: resultado, liquidación con cobra y neto en palabras, y compartir con la liquidación', async () => {
    const j = juego({ a: { 1: 3, 2: 3, 3: 5 }, b: { 1: 4, 2: 2, 3: 5 }, c: { 2: 3, 3: 4 } }, { pozoPorJugador: 1000 }, true)
    vista(j, true)
    expect(screen.getByRole('heading', { name: 'Empate entre Ana, Beto y Coni' })).toBeTruthy()
    const liq = screen.getByRole('region', { name: 'Liquidación' })
    expect(within(liq).getAllByText('Queda igual')).toHaveLength(3)
    expect(within(liq).getByText(/skin a \$1\.000/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Compartir al grupo' }))
    await Promise.resolve()
    expect(JSON.stringify(compartido.at(-1))).toContain('Liquidación (skin a $1.000)')
  })

  it('cerrada sin pozo: solo skins, sin liquidación', () => {
    vista(juego({ a: { 1: 3, 2: 3, 3: 5 }, b: { 1: 4, 2: 3, 3: 5 }, c: { 2: 4, 3: 5 } }, {}, true), true)
    expect(screen.getByRole('heading', { name: 'Ganó Ana' })).toBeTruthy()
    expect(screen.getByText('Sin pozo: se jugó solo por skins.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Liquidación' })).toBeNull()
  })

  it('cerrada sin resolver con pozo: «No se liquidó el pozo», qué hoyos y quién decide', () => {
    vista(juego({ a: { 1: 3 }, b: { 1: 4 }, c: {} }, { pozoPorJugador: 1000 }, true), true)
    expect(screen.getByText('No se liquidó el pozo. Quedaron sin resolver los hoyos 2 y 3. El organizador decide cómo se reparte.')).toBeTruthy()
    expect(screen.queryByText(/Revisa la tarjeta/)).toBeNull()
  })

  it('resultado final: cada fila explica sus skins', () => {
    vista(juego({ a: { 1: 3, 2: 3, 3: 5 }, b: { 1: 4, 2: 3, 3: 5 }, c: { 2: 4, 3: 5 } }, {}, true), true)
    const ranking = screen.getByRole('list', { name: 'Skins' })
    expect(within(ranking).getByText(/^Hoyo 1 · reparto del 3: [0-9,]+ skins?$/)).toBeTruthy()
  })

  it('sin señal: error con Reintentar', () => {
    const reintentar = vi.fn()
    render(<SkinsEnVivo juego={{ estado: 'error' }} onReintentar={reintentar} jugadores={JUGADORES} hoyoInicio={1} holes={3} finalizada={false} cancha="" url="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentar).toHaveBeenCalled()
  })
})
