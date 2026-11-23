// @vitest-environment jsdom
// Scramble rápido en el asistente: «Con jugadores» | «Solo equipos» en el paso Jugadores y el resumen de Confirmar.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { MAX_EQUIPOS_DE_CLUB } from '@/golf/ronda-libre/equipos-de-club'
import { DETALLE_DEMASIADOS_EQUIPOS_DE_CLUB, validarNuevaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { useEquiposDeClub } from '../hooks/useEquiposDeClub'
import { ID_DEL_CREADOR, type RivalDelCreador } from '../hooks/useFormularioDeRonda'
import { PasoConfirmar } from './PasoConfirmar'
import { PasoJugadores } from './PasoJugadores'

vi.mock('../hooks/usePlayerSearch', () => ({
  usePlayerSearch: () => ({ results: [], searching: false, open: false, dismiss: vi.fn(), containerRef: { current: null } }),
}))

afterEach(cleanup)

const RIVAL: RivalDelCreador = { id: 'r1', tipo: 'invitado', nombre: 'Pedro', telefono: '', handicap: 10, tees: null, profileId: null }

/** El paso con el hook real y el validador compartido, como lo arma la página. */
function Paso({ formato = 'scramble', modoInicial = 'gross', netoBloqueado = false, holes = 18, onSiguiente = vi.fn() }: {
  formato?: FormatoJuego; modoInicial?: ModoJuego; netoBloqueado?: boolean; holes?: number; onSiguiente?: () => void
}) {
  const [modo, setModo] = useState<ModoJuego>(modoInicial)
  const club = useEquiposDeClub({ formato, modo, netoBloqueado, onNeto: () => setModo('neto') })
  const problema = club.paraEnviar
    ? validarNuevaRonda({
        cancha: 'Los Leones', formato, modo, jugadores: [{ nombre: 'Ana', indice: 12 }], equipos: [],
        equiposDeClub: { equipos: club.paraEnviar, holes, quienAnota: 'uno' },
      })
    : null
  return (
    <PasoJugadores
      creador={{ nombre: 'Ana', indice: 12 }} onIndiceCreador={vi.fn()}
      teeGlobal="" onTeeGlobal={vi.fn()} tees={[]}
      formato={formato} modo={modo} esFormatoDeEquipo
      preguntaQuienAnota={false} anotaPorTodos onQuienAnota={vi.fn()} llevaElScoreDelGrupo
      rivales={[RIVAL]} onCampoRival={vi.fn()} onQuitarRival={vi.fn()} onAgregarRival={vi.fn()}
      equipos={[{ nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR, 'r1'] }]}
      onAgregarEquipo={vi.fn()} onQuitarEquipo={vi.fn()} onRenombrarEquipo={vi.fn()} onMoverAlEquipo={vi.fn()}
      golpesDe={() => null} hcpVisibleDe={() => null} hoyos={holes}
      rondasRecientes={[]} problema={problema}
      club={club}
      onAtras={vi.fn()} onSiguiente={onSiguiente}
    />
  )
}

const soloEquipos = () => screen.getByRole('button', { name: 'Solo equipos' })
const conJugadores = () => screen.getByRole('button', { name: 'Con jugadores' })
const revisar = () => screen.getByRole('button', { name: /Revisar/ }) as HTMLButtonElement
const aviso = () => document.getElementById('paso-jugadores-aviso') as HTMLElement
const handicaps = () => screen.queryAllByLabelText(/^Hándicap del equipo/) as HTMLInputElement[]

describe('PasoJugadores — «Con jugadores» | «Solo equipos»', () => {
  it('arranca en «Con jugadores»: el flujo de siempre, con las tarjetas de jugador', () => {
    render(<Paso />)
    expect(conJugadores().getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByDisplayValue('Pedro')).toBeTruthy()
    expect(handicaps()).toHaveLength(0)
  })

  it('sin la prop `club` (otros formatos) no aparece el selector', () => {
    render(
      <PasoJugadores
        creador={{ nombre: 'Ana', indice: 12 }} onIndiceCreador={vi.fn()} teeGlobal="" onTeeGlobal={vi.fn()} tees={[]}
        formato="best_ball" modo="neto" esFormatoDeEquipo preguntaQuienAnota={false} anotaPorTodos onQuienAnota={vi.fn()}
        llevaElScoreDelGrupo rivales={[]} onCampoRival={vi.fn()} onQuitarRival={vi.fn()} onAgregarRival={vi.fn()}
        equipos={[{ nombre: 'Equipo 1', miembros: [ID_DEL_CREADOR] }]} onAgregarEquipo={vi.fn()} onQuitarEquipo={vi.fn()}
        onRenombrarEquipo={vi.fn()} onMoverAlEquipo={vi.fn()} golpesDe={() => null} hcpVisibleDe={() => null} hoyos={18}
        rondasRecientes={[]} problema={null} onAtras={vi.fn()} onSiguiente={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Solo equipos' })).toBeNull()
  })

  it('«Solo equipos» pasa a Neto, esconde a los jugadores y pide el hándicap de cada equipo', () => {
    render(<Paso />)
    fireEvent.click(soloEquipos())
    expect(soloEquipos().getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByDisplayValue('Pedro')).toBeNull()
    expect(handicaps()).toHaveLength(1)
    expect(handicaps()[0].getAttribute('inputmode')).toBe('numeric')
    expect((screen.getByLabelText('Equipo 1') as HTMLInputElement).placeholder).toBe('Equipo 1')
  })

  it('el aviso es el del validador compartido y «Revisar» no avanza hasta que esté el hándicap', () => {
    const onSiguiente = vi.fn()
    render(<Paso onSiguiente={onSiguiente} />)
    fireEvent.click(soloEquipos())
    expect(revisar().disabled).toBe(true)
    expect(aviso().textContent).toBe('Escribe el hándicap de Equipo 1.')
    fireEvent.change(handicaps()[0], { target: { value: '8' } })
    expect(revisar().disabled).toBe(false)
    fireEvent.click(revisar())
    expect(onSiguiente).toHaveBeenCalledTimes(1)
  })

  it('un hándicap fuera de rango marca el campo y el aviso da el rango de esos hoyos', () => {
    render(<Paso holes={9} />)
    fireEvent.click(soloEquipos())
    fireEvent.change(handicaps()[0], { target: { value: '19' } })
    expect(handicaps()[0].getAttribute('aria-invalid')).toBe('true')
    expect(aviso().textContent).toBe('El hándicap de equipo va de 0 a 18, sin decimales.')
    fireEvent.change(handicaps()[0], { target: { value: '18' } })
    expect(handicaps()[0].getAttribute('aria-invalid')).toBeNull()
  })

  it('con el Neto bloqueado por plan queda en Gross: sin campo de hándicap y lo dice', () => {
    render(<Paso netoBloqueado />)
    fireEvent.click(soloEquipos())
    expect(handicaps()).toHaveLength(0)
    expect(screen.getByText(/Juegan gross, sin hándicap\./)).toBeTruthy()
    expect(revisar().disabled).toBe(false)
  })

  it('agrega equipos hasta el tope; ahí el botón cede su lugar al aviso del tope', () => {
    render(<Paso />)
    fireEvent.click(soloEquipos())
    for (let i = 1; i < MAX_EQUIPOS_DE_CLUB; i++) fireEvent.click(screen.getByRole('button', { name: '+ Agregar equipo' }))
    expect(handicaps()).toHaveLength(MAX_EQUIPOS_DE_CLUB)
    expect(screen.queryByRole('button', { name: '+ Agregar equipo' })).toBeNull()
    expect(screen.getByText(DETALLE_DEMASIADOS_EQUIPOS_DE_CLUB)).toBeTruthy()
  })

  it('dos equipos con el mismo nombre: el aviso del validador', () => {
    render(<Paso />)
    fireEvent.click(soloEquipos())
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar equipo' }))
    handicaps().forEach(h => fireEvent.change(h, { target: { value: '8' } }))
    fireEvent.change(screen.getByLabelText('Equipo 1'), { target: { value: 'Los Tigres' } })
    fireEvent.change(screen.getByLabelText('Equipo 2'), { target: { value: 'los tigres' } })
    expect(aviso().textContent).toBe('Dos equipos se llaman igual. Cambia uno.')
  })

  it('volver a «Con jugadores» devuelve las tarjetas de jugador tal como estaban', () => {
    render(<Paso />)
    fireEvent.click(soloEquipos())
    fireEvent.click(conJugadores())
    expect(screen.getByDisplayValue('Pedro')).toBeTruthy()
    expect(handicaps()).toHaveLength(0)
  })
})

describe('PasoConfirmar — equipos de club', () => {
  const pintar = (modo: ModoJuego, equiposDeClub: Array<{ nombre: string; handicap: number | null }>) => render(
    <PasoConfirmar
      cancha="Los Leones" forma={{ holes: 18, hoyoInicio: 1, esMultiRecorrido: false }} mitad="front"
      recorridosElegidos={[]} formato="scramble" modo={modo} teeGlobal="Azul" fecha="2026-11-23"
      jugadores={[]} equipos={[]} equiposDeClub={equiposDeClub} llevaElScoreDelGrupo hcpVisibleDe={() => null}
      hayVariosTees={false} problema={null} creando={false} onEditar={vi.fn()} onCrear={vi.fn()}
    />,
  )

  it('neto: «Scramble · Neto · 3 equipos» y una línea por equipo con su HCP del club', () => {
    pintar('neto', [{ nombre: 'Los Tigres', handicap: 8 }, { nombre: 'Los Pumas', handicap: 0 }, { nombre: 'Equipo 3', handicap: 12 }])
    expect(screen.getByText('Scramble · Neto · 3 equipos')).toBeTruthy()
    expect(screen.getByText('Los Tigres · HCP 8 (club)')).toBeTruthy()
    expect(screen.getByText('Los Pumas · HCP 0 (club)')).toBeTruthy()
    expect(screen.getByText('Equipos (3)')).toBeTruthy()
    expect(screen.queryByText(/^Jugadores \(/)).toBeNull()
  })

  it('gross: sin HCP y en singular con un equipo', () => {
    pintar('gross', [{ nombre: 'Los Tigres', handicap: null }])
    expect(screen.getByText('Scramble · Gross · 1 equipo')).toBeTruthy()
    expect(screen.getByText('Los Tigres')).toBeTruthy()
    expect(screen.queryByText(/HCP/)).toBeNull()
  })
})
