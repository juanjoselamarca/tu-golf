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
  const club = useEquiposDeClub({ formato, modo, holes, netoBloqueado, onModo: setModo })
  const problema = club.paraEnviar
    ? validarNuevaRonda({
        cancha: 'Los Leones', formato, modo, jugadores: [{ nombre: 'Ana', indice: 12 }], equipos: [],
        equiposDeClub: { equipos: club.paraEnviar, holes, quienAnota: club.quienAnotaParaEnviar },
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

const soloEquipos = () => screen.getByRole('button', { name: 'Equipos con hándicap del club' })
const conJugadores = () => screen.getByRole('button', { name: 'Jugadores con su índice' })
const revisar = () => screen.getByRole('button', { name: /Siguiente/ }) as HTMLButtonElement
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
    expect(screen.queryByRole('button', { name: 'Equipos con hándicap del club' })).toBeNull()
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
    // Solo falta completar: neutro (--text-2), no rojo de error con el paso recién abierto.
    expect(aviso().style.color).toBe('var(--text-2)')
    expect(aviso().style.fontSize).toBe('12px')
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
    expect(aviso().textContent).toBe('El hándicap de Equipo 1 va de 0 a 18, sin decimales.')
    // Un dato mal se lee igual que el aviso del índice: color de error a 12px (AA en los dos temas).
    expect(aviso().style.color).toBe('var(--error-fg)')
    expect(aviso().style.fontSize).toBe('12px')
    expect(handicaps()[0].placeholder).toBe('0–18')
    expect(screen.getByText('(0–18)')).toBeTruthy() // el rango también en el label
    fireEvent.change(handicaps()[0], { target: { value: '18' } })
    expect(handicaps()[0].getAttribute('aria-invalid')).toBeNull()
  })

  it('con el Neto bloqueado por plan queda en Gross: sin campo de hándicap y lo dice', () => {
    render(<Paso netoBloqueado />)
    fireEvent.click(soloEquipos())
    expect(handicaps()).toHaveLength(0)
    expect(screen.getByText(/En Gross no se usa hándicap\./)).toBeTruthy() // lo dice la opción elegida, una vez
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

  it('«¿Quién anota?»: no se pregunta con 1 equipo; con 2 es obligatorio y sin nada elegido', () => {
    render(<Paso />)
    fireEvent.click(soloEquipos())
    expect(screen.queryByRole('button', { name: 'Cada equipo en su celular' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar equipo' }))
    handicaps().forEach(h => fireEvent.change(h, { target: { value: '8' } }))
    const yo = screen.getByRole('button', { name: 'Yo anoto todos' })
    const cada = screen.getByRole('button', { name: 'Cada equipo en su celular' })
    expect(yo.getAttribute('aria-pressed')).toBe('false')
    expect(cada.getAttribute('aria-pressed')).toBe('false')
    expect(aviso().textContent).toBe('Elige quién anota.')
    expect(revisar().disabled).toBe(true)
    fireEvent.click(cada)
    expect(cada.getAttribute('aria-pressed')).toBe('true')
    expect(aviso().textContent).toBe('')
    // El creador anota el primer equipo (api/ronda-libre/create): la frase lo nombra.
    expect(screen.getByText('Tú anotas «Equipo 1» y les mandas el link a los demás. Al final, tú cierras la ronda.')).toBeTruthy()
    // Vuelve a 1 equipo: la pregunta se va.
    fireEvent.click(screen.getAllByRole('button', { name: /^Quitar/ })[1])
    expect(screen.queryByRole('button', { name: 'Cada equipo en su celular' })).toBeNull()
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
  const pintar = (
    modo: ModoJuego,
    equiposDeClub: Array<{ nombre: string; handicap: number | null; driveJugadores?: string[] }>,
    unCelularPorEquipo = false,
    drivesMinimo?: number,
  ) => render(
    <PasoConfirmar
      cancha="Los Leones" forma={{ holes: 18, hoyoInicio: 1, esMultiRecorrido: false }} mitad="front"
      recorridosElegidos={[]} formato="scramble" modo={modo} teeGlobal="Azul" fecha="2026-11-28"
      jugadores={[]} equipos={[]} equiposDeClub={equiposDeClub} unCelularPorEquipo={unCelularPorEquipo} drivesMinimo={drivesMinimo}
      llevaElScoreDelGrupo hcpVisibleDe={() => null}
      hayVariosTees={false} problema={null} creando={false} onEditar={vi.fn()} onCrear={vi.fn()}
    />,
  )

  it('neto: «Scramble · Neto», «Equipos (3)» y cada equipo con su HCP del club', () => {
    pintar('neto', [{ nombre: 'Los Tigres', handicap: 8 }, { nombre: 'Los Pumas', handicap: 0 }, { nombre: 'Equipo 3', handicap: 12 }])
    expect(screen.getByText('Scramble · Neto')).toBeTruthy()
    expect(screen.getByText('Equipos (3)')).toBeTruthy()
    expect(screen.getByText('HCP 8')).toBeTruthy()
    expect(screen.getByText('HCP 0')).toBeTruthy()
    expect(screen.getAllByText('del club')).toHaveLength(3)
    // Un celular anota todos los equipos; sin fila de Tees (nadie juega con su índice).
    expect(screen.getByText('Tú, todos los equipos')).toBeTruthy()
    expect(screen.queryByText('Tees')).toBeNull()
    expect(screen.queryByText(/^Jugadores \(/)).toBeNull()
    expect(screen.queryByText('Drives')).toBeNull()
  })

  it('un nombre de 50 caracteres cede con puntos suspensivos; el HCP se ve entero', () => {
    const largo = 'Los Tigres del Club de Golf Los Leones de Santiago'
    pintar('neto', [{ nombre: largo, handicap: 8 }])
    const nombre = screen.getByText(largo)
    expect(nombre.style.textOverflow).toBe('ellipsis')
    expect((screen.getByText('HCP 8').parentElement as HTMLElement).style.flexShrink).toBe('0')
  })

  it('anota: «Cada equipo en su celular» o «Tú, todos los equipos»', () => {
    pintar('neto', [{ nombre: 'Los Tigres', handicap: 8 }, { nombre: 'Los Pumas', handicap: 0 }], true)
    expect(screen.getByText('Cada equipo en su celular')).toBeTruthy()
    cleanup()
    pintar('neto', [{ nombre: 'Los Tigres', handicap: 8 }, { nombre: 'Los Pumas', handicap: 0 }])
    expect(screen.getByText('Tú, todos los equipos')).toBeTruthy()
  })

  it('con drives: el mínimo elegido y los jugadores de cada equipo; 0 se lee «sin mínimo»', () => {
    const J = ['Juanjo', 'Pedro', 'Tomás', 'Felipe']
    pintar('neto', [{ nombre: 'Los Lamarca', handicap: 6, driveJugadores: J }], false, 3)
    expect(screen.getByText('Mínimo 3 por jugador')).toBeTruthy()
    expect(screen.getByText('Juanjo · Pedro · Tomás · Felipe')).toBeTruthy()
    cleanup()
    pintar('neto', [{ nombre: 'Los Lamarca', handicap: 6, driveJugadores: J }], false, 0)
    expect(screen.getByText('Se anotan, sin mínimo')).toBeTruthy()
  })

  it('con drives y sin mínimo calculable (27 hoyos): la fila igual dice que se anotan', () => {
    pintar('neto', [{ nombre: 'Los Lamarca', handicap: 6, driveJugadores: ['Juanjo', 'Pedro'] }])
    expect(screen.getByText('Drives')).toBeTruthy()
    expect(screen.getByText('Se anotan')).toBeTruthy()
  })

  it('gross: sin HCP', () => {
    pintar('gross', [{ nombre: 'Los Tigres', handicap: null }])
    expect(screen.getByText('Scramble · Gross')).toBeTruthy()
    expect(screen.getByText('Equipos (1)')).toBeTruthy()
    expect(screen.queryByText(/HCP/)).toBeNull()
  })

  it('la fecha con el día de la semana', () => {
    pintar('neto', [{ nombre: 'Los Tigres', handicap: 8 }])
    expect(screen.getByText(/^Sábado 28 de noviembre/)).toBeTruthy()
  })
})

describe('PasoJugadores — mínimo de drives por jugador', () => {
  const abrirDrives = (holes = 18) => {
    render(<Paso holes={holes} />)
    fireEvent.click(soloEquipos())
    fireEvent.click(screen.getByRole('group', { name: '¿Anotar drives?' }).querySelectorAll('button')[1])
  }
  const minimo = () => screen.getByTestId('drives-minimo').textContent
  const bajar = () => screen.getByRole('button', { name: 'Bajar el mínimo de drives' }) as HTMLButtonElement
  const subir = () => screen.getByRole('button', { name: 'Subir el mínimo de drives' }) as HTMLButtonElement

  it('con drives en No no se muestra; con Sí arranca en el de siempre y el tope frena el +', () => {
    render(<Paso />)
    fireEvent.click(soloEquipos())
    expect(screen.queryByTestId('drives-minimo')).toBeNull()
    cleanup()
    abrirDrives()
    expect(minimo()).toBe('4')
    expect(subir().disabled).toBe(true)
    expect(screen.getByText('Mínimo por jugador')).toBeTruthy()
    expect(screen.queryByText(/Sin mínimo/)).toBeNull() // con mínimo no hay texto que repita el número
  })

  it('el − baja hasta 0 (sin mínimo) y ahí se frena', () => {
    abrirDrives(9)
    expect(minimo()).toBe('2')
    fireEvent.click(bajar())
    expect(minimo()).toBe('1')
    fireEvent.click(bajar())
    expect(minimo()).toBe('0')
    expect(bajar().disabled).toBe(true)
    expect(screen.getByText('Sin mínimo: solo se cuentan los drives de cada uno.')).toBeTruthy()
    fireEvent.click(subir())
    expect(minimo()).toBe('1')
  })
})
