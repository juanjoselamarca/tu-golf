import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { crearConfigDePlantilla } from '@/golf/formats/personalizado'
import { armarTablaDelJuego, type TablaDelJuego } from '@/golf/ronda-libre/tabla-del-juego'
import { COLOMBIANA, ID, IDS, NOMBRES, golpesDe, vistaDeTimba } from '@/golf/ronda-libre/__fixtures__/vista-timba'
import { JuegoDeLaTimba, avisoNetoComoGross } from './JuegoDeLaTimba'
import { casillasPorFila } from './ParejasDeLaTimba'
import { tamanoDeLetra } from '../CasillaDeHoyo'
import { SIN_INDICE } from '@/lib/data/ronda-libre-live-api'

// Mitad de ronda: 9 hoyos jugados; Pancho hace birdie en el 1 (gana el tramo 1 su pareja).
const mitad = () => armarTablaDelJuego(
  vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2, 3, 4, 5, 6, 7, 8, 9], { 1: { [ID.pancho]: 3 }, 8: { [ID.nico]: 3 } }) }),
  NOMBRES, null,
)

const textoDe = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim()

describe('JuegoDeLaTimba — mitad de ronda (La Colombiana)', () => {
  it('de arriba hacia abajo: frase, duelo en juego, puntos, parejas y hoyo a hoyo cerrado', () => {
    const tabla = mitad()
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(tabla.frase.texto)
    expect(screen.getByText('La Colombiana · 9 de 18 hoyos · quedan 9')).toBeTruthy()
    // El titular ya no es el nombre del juego.
    expect(screen.queryByRole('heading', { name: 'La Colombiana' })).toBeNull()

    const duelo = screen.getByRole('region', { name: /^Hoyos 7 a 12:/ })
    expect(within(duelo).getByText('En juego · quedan 3')).toBeTruthy()
    expect(within(duelo).getAllByRole('img')).toHaveLength(6)
    expect(within(duelo).getByRole('img', { name: 'Hoyo 8: ganan Cristóbal y Nico' }).textContent).toContain('CN')
    expect(within(duelo).getByRole('img', { name: 'Hoyo 10: por jugar' }).textContent).toBe('10')

    const puntos = within(screen.getByRole('list', { name: 'Puntos de cada uno' })).getAllByRole('listitem')
    expect(puntos).toHaveLength(4)
    expect(textoDe(puntos[0])).toBe(`1${tabla.ranking[0].nombre}${tabla.ranking[0].textoConUnidad}`)
    expect(textoDe(puntos[0])).not.toContain('+')

    const parejas = screen.getByRole('region', { name: 'Parejas' })
    const tramos = within(parejas).getAllByRole('listitem')
    expect(tramos).toHaveLength(3)
    expect(within(tramos[0]).getByText('Terminado')).toBeTruthy()
    expect(within(tramos[2]).getByText('Parte en el 13')).toBeTruthy()
    expect(within(tramos[2]).getByText('vs')).toBeTruthy()

    const plegable = screen.getByText('Hoyo a hoyo').closest('details') as HTMLDetailsElement
    expect(plegable.open).toBe(false)
  })

  it('el plegable abre la tabla por hoyo con golpes recibidos y letras de puntos especiales', () => {
    const tabla = armarTablaDelJuego(vistaDeTimba({
      config: { ...COLOMBIANA, puntitos: [{ id: 'sa', tipo: 'sandy', valor: 1, destino: 'individual', activo: true }] },
      scores: golpesDe([1, 2]), modo: 'neto',
      ch: { [ID.pancho]: 0, [ID.cristobal]: 0, [ID.tomas]: 18, [ID.nico]: 0 },
      marcas: [{ jugadorId: ID.cristobal, hoyo: 2, puntitoId: 'sa' }],
    }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    const resumen = screen.getByText('Hoyo a hoyo')
    fireEvent.click(resumen)
    const tablaPorHoyo = screen.getByRole('table', { name: 'Puntos por hoyo' })
    expect(within(tablaPorHoyo).getAllByTestId('golpe-recibido').length).toBe(2)
    expect(within(tablaPorHoyo).getAllByTestId('punto-especial').map(e => e.textContent)).toEqual(['S'])
    expect(screen.getByText(/golpe recibido/)).toBeTruthy()
    expect(screen.getByText('sandy', { exact: false })).toBeTruthy()
  })

  it('llegando desde el resultado final el hoyo a hoyo parte abierto', () => {
    render(<JuegoDeLaTimba tabla={mitad()} hoyoAHoyoAbierto />)
    expect((screen.getByText('Hoyo a hoyo').closest('details') as HTMLDetailsElement).open).toBe(true)
  })
})

describe('JuegoDeLaTimba — otros estados', () => {
  // El HCP lo arma el servidor (`VistaDelJuego.hcpAMostrar`) igual para el scorer, el jugador con sesión y el anónimo:
  // la vista no recibe nada del visor, así que un jugador con sesión ya no ve solo su HCP y tres guiones.
  const CH = { [ID.pancho]: 8, [ID.cristobal]: 12, [ID.tomas]: 16, [ID.nico]: 20 }
  const HCP = { [ID.pancho]: -2, [ID.cristobal]: 13, [ID.tomas]: 17, [ID.nico]: SIN_INDICE }

  it('0 hoyos: "Aún no parten", primer duelo 0–0, lista "Jugadores" con el HCP de 18 de cada uno (nunca "recibe N golpes")', () => {
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: {}, modo: 'neto', ch: CH, hcp: HCP }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Aún no parten')
    expect(screen.getByText('La Colombiana · 18 hoyos · salen del 1')).toBeTruthy()
    expect(screen.getByText('Primer duelo')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Jugadores' })).toBeTruthy()
    expect(screen.queryByText('Puntos de cada uno')).toBeNull()
    const filas = within(screen.getByRole('list', { name: 'Jugadores' })).getAllByRole('listitem').map(textoDe)
    expect(filas).toEqual(['PanchoHCP +2', 'CristóbalHCP 13', 'TomásHCP 17', `NicoHCP ${SIN_INDICE}Sin índice`])
    expect(screen.queryByText(/recibe/i)).toBeNull()
    expect(screen.queryByText('Hoyo a hoyo')).toBeNull()
  })

  it('en neto ya partido: "Puntos de cada uno" con puntos, nunca el HCP', () => {
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2, 3]), modo: 'neto', ch: CH, hcp: HCP }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Puntos de cada uno' })).toBeTruthy()
    expect(screen.queryByText(/HCP/)).toBeNull()
  })

  it('ronda cerrada sin golpes: "No se jugó" y sin HCP', () => {
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: {}, modo: 'neto', ch: CH, hcp: HCP, cerrada: true }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('No se jugó')
    expect(screen.queryByText(/HCP/)).toBeNull()
  })

  it('una respuesta de antes del deploy (sin hcpAMostrar) no rompe: "HCP —"', () => {
    const vista = vistaDeTimba({ config: COLOMBIANA, scores: {}, modo: 'neto', ch: CH })
    const tabla = armarTablaDelJuego({ ...vista, hcpAMostrar: undefined as never }, NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getAllByText(/^HCP/)).toHaveLength(4)
  })

  it('0 hoyos en gross: 0 pts, sin HCP', () => {
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: {}, hcp: HCP }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.queryByText(/HCP/)).toBeNull()
    expect(screen.getAllByText('0 pts')).toHaveLength(4)
  })

  it('ronda cerrada en el 12: la tarjeta grande es 7 a 12, no el tramo que no se jugó', () => {
    const tabla = armarTablaDelJuego(
      vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), cerrada: true }), NOMBRES, null,
    )
    render(<JuegoDeLaTimba tabla={tabla} hoyoAHoyoAbierto />)
    expect(screen.getByRole('region', { name: /^Hoyos 7 a 12:/ })).toBeTruthy()
    expect(screen.queryByRole('region', { name: /^Hoyos 13 a 18:/ })).toBeNull()
  })

  it('el plegable no muestra el triángulo del navegador (iOS Safari): clase que oculta ::-webkit-details-marker', () => {
    render(<JuegoDeLaTimba tabla={mitad()} />)
    expect(screen.getByText('Hoyo a hoyo').closest('summary')?.className).toBe('plegable-summary')
  })

  it('empate arriba: "X y Y empatados"', () => {
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2]) }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Todos empatados')
  })

  it('retirado: lo dice bajo su nombre, en los tramos que no juega, y sin distancia al primero', () => {
    const s = golpesDe([1, 2, 3, 4, 5, 6, 7, 8, 9])
    delete s[ID.nico][8]
    delete s[ID.nico][9]
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: s, retiros: { [ID.nico]: 8 } }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    const nico = within(screen.getByRole('list', { name: 'Puntos de cada uno' })).getAllByRole('listitem').find(li => li.textContent?.includes('Nico'))!
    expect(within(nico).getByText('Se retiró en el hoyo 8')).toBeTruthy()
    expect(nico.textContent).not.toMatch(/a \d+ pts?/)
    // Duelo destacado (7 a 12) y bloque Parejas (7 a 12 y 13 a 18).
    expect(screen.getAllByText('Nico se retiró en el hoyo 8')).toHaveLength(3)
  })

  it('juego sin parejas (2-0-2, 3 jugadores): sin duelo ni bloque Parejas; no se rompe', () => {
    const ids = IDS.slice(0, 3)
    const tabla = armarTablaDelJuego(
      vistaDeTimba({ config: crearConfigDePlantilla('dos_cero_dos'), ids, scores: golpesDe([1], { 1: { [ID.pancho]: 3, [ID.tomas]: 5 } }, ids) }),
      NOMBRES, null,
    )
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Pancho gana por 2 puntos')
    expect(screen.queryByRole('region', { name: 'Parejas' })).toBeNull()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByText('−2 pts')).toBeTruthy()
  })

  it('parejas fijas: el duelo con las 18 casillas, sin repetirlo en un bloque Parejas', () => {
    const cfg = { ...crearConfigDePlantilla('subterranea'), parejas: [[0, 1], [2, 3]] as [[number, number], [number, number]] }
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: cfg, scores: golpesDe([1, 2]) }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getAllByRole('img')).toHaveLength(18)
    expect(screen.queryByRole('region', { name: 'Parejas' })).toBeNull()
  })

  it('parejas fijas a 18 con "Pancho" y "Pedro" en la misma pareja: "PaPe" a 9 px, sin desbordar la casilla de 30 px', () => {
    const cfg = { ...crearConfigDePlantilla('subterranea'), parejas: [[0, 2], [1, 3]] as [[number, number], [number, number]] }
    const nombres = { ...NOMBRES, [ID.tomas]: 'Pedro Lira' }
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: cfg, scores: golpesDe([1], { 1: { [ID.pancho]: 3, [ID.tomas]: 3 } }) }), nombres, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    const casilla = screen.getByRole('img', { name: /^Hoyo 1: ganan/ })
    const cuadro = casilla.lastElementChild as HTMLElement
    expect(cuadro.textContent).toBe('PaPe')
    expect(cuadro.style.fontSize).toBe('9px')
    expect(cuadro.style.overflow).toBe('hidden')
  })

  it('9 hoyos: tramos de 3 casillas', () => {
    const tabla = armarTablaDelJuego(vistaDeTimba({ config: COLOMBIANA, scores: golpesDe([1, 2, 3, 4]), holes: 9 }), NOMBRES, null)
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByText('La Colombiana · 4 de 9 hoyos · quedan 5')).toBeTruthy()
    const tramos = within(screen.getByRole('region', { name: 'Parejas' })).getAllByRole('listitem')
    expect(tramos.map(t => within(t).getAllByRole('img').length)).toEqual([3, 3, 3])
  })

  it('neto sin hándicap: avisa quién falta', () => {
    const base = mitad()
    const tabla: TablaDelJuego = { ...base, esNeto: true, sinHandicap: ['Pedro', 'Tomás'] }
    render(<JuegoDeLaTimba tabla={tabla} />)
    expect(screen.getByRole('note').textContent).toBe(avisoNetoComoGross(['Pedro', 'Tomás']))
    expect(avisoNetoComoGross(['Pedro', 'Tomás'])).toContain('de Pedro y Tomás')
  })

  it('sin señal: avisa que son los puntos de hace un momento', () => {
    render(<JuegoDeLaTimba tabla={mitad()} desactualizado />)
    expect(screen.getByRole('status').textContent).toContain('Sin señal')
  })
})

describe('tamanoDeLetra (la etiqueta cabe en la casilla)', () => {
  it('4 caracteres en una casilla angosta van a 9 px; 1 o 2, a 11 o 13', () => {
    expect(tamanoDeLetra('PaPe', 30)).toBe('9px')
    expect(tamanoDeLetra('PaPe', 28)).toBe('9px')
    expect(tamanoDeLetra('PaPe', 40)).toBe('11px')
    expect(tamanoDeLetra('PT', 40)).toBe('13px')
    expect(tamanoDeLetra('PT', 28)).toBe('11px')
  })
})

describe('casillasPorFila', () => {
  it('hasta 9 en una fila; más, en filas parejas', () => {
    expect([3, 6, 9, 18, 27].map(casillasPorFila)).toEqual([3, 6, 9, 9, 9])
    expect(casillasPorFila(12)).toBe(6)
  })
})
