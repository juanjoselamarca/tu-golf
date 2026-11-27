import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CompartirEnJuego } from './CompartirEnJuego'
import { enlacesDeRondaLibre, enlacesDeTorneo } from './OpcionesParaCompartir'
import { MS_ANTES_DE_ARMAR } from './HojaDelScorer'

/** Vacía microtasks + un macrotask (la cascada de useShare encadena varios awaits). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const SITE = 'https://golfersplus.vercel.app'

let origNavigator: PropertyDescriptor | undefined
let origOpen: typeof window.open

beforeEach(() => {
  origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  origOpen = window.open
})
afterEach(() => {
  if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator)
  window.open = origOpen
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function setNavigator(nav: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
}

/** Toca el ícono, contesta "Sí" y espera que las opciones se armen (400 ms contra el doble toque). */
async function abrirOpciones() {
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Compartir la ronda' }))
  act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
  fireEvent.click(screen.getByRole('button', { name: 'Sí' }))
  act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
  vi.useRealTimers()
}

describe('CompartirEnJuego', () => {
  it('el ícono primero pregunta; "No" vuelve al scorer sin compartir nada', () => {
    const share = vi.fn()
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)

    fireEvent.click(screen.getByRole('button', { name: 'Compartir la ronda' }))
    expect(screen.getByRole('dialog', { name: '¿Quieres compartir tu ronda con amigos?' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(share).not.toHaveBeenCalled()
  })

  it('el ícono mide 44 px de toque (uso en cancha)', () => {
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    const boton = screen.getByRole('button', { name: 'Compartir la ronda' })
    expect(boton.style.minWidth).toBe('44px')
    expect(boton.style.minHeight).toBe('44px')
  })

  it('"Sí" muestra las opciones de "Ronda creada"; invitar a seguir comparte el link en vivo y vuelve al scorer', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    await abrirOpciones()

    expect(screen.getByText('Link para anotar')).toBeTruthy()
    expect(screen.getByText('Link para mirar')).toBeTruthy()

    // Los "Compartir" van en el orden de los títulos: jugar, seguir.
    fireEvent.click(screen.getByRole('button', { name: 'Compartir link para mirar' }))
    await flush()

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Sigue mi ronda en vivo en Golfers+', url: `${SITE}/ronda-libre/ABC` }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('invitar a jugar comparte el link del scorer', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getByRole('button', { name: 'Compartir link para anotar' }))
    await flush()

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Únete a mi ronda en Golfers+', url: `${SITE}/ronda-libre/ABC/score` }),
    )
  })

  it('un celular por equipo: primero el bloque para que cada equipo anote el suyo (link al scorer de grupo)', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: false, unCelularPorEquipo: true })} color="red" />)
    await abrirOpciones()

    expect(screen.getByText('Link para anotar')).toBeTruthy()
    expect(screen.getByText('Mándaselo a quien anota cada uno de los otros equipos. Al abrirlo elige su equipo.')).toBeTruthy()
    expect(screen.queryByText('Cada jugador lo abre y anota su tarjeta en su celular.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Compartir link para anotar' }))
    await flush()
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Anota el score de tu equipo en Golfers+', url: `${SITE}/ronda-libre/ABC/score-grupo` }),
    )
  })

  it('si la persona cancela la hoja del teléfono, las opciones siguen abiertas', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' })
    setNavigator({ share: vi.fn().mockRejectedValue(abort) } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getByRole('button', { name: 'Compartir link para mirar' }))
    await flush()

    expect(screen.getByRole('dialog', { name: 'Compartir la ronda' })).toBeTruthy()
  })

  it('sin compartir nativo cae a WhatsApp (cascada canónica)', async () => {
    setNavigator({} as unknown as Navigator)
    const open = vi.fn().mockReturnValue({} as Window)
    window.open = open as unknown as typeof window.open
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('XYZ', { conJugar: false })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getByRole('button', { name: 'Compartir link para mirar' }))
    await flush()

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toContain('https://wa.me/?text=')
  })

  // Un solo celular anota por todos: el link para sumarse a anotar llevaba a "El admin de grupo lleva tu score".
  it('sin link para jugar solo ofrece invitar a seguir', async () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: false })} color="red" />)
    await abrirOpciones()

    expect(screen.queryByText('Link para anotar')).toBeNull()
    expect(screen.getByText('Link para mirar')).toBeTruthy()
  })

  it('"Volver al scorer" y tocar fuera cierran las opciones', async () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    await abrirOpciones()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al scorer' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await abrirOpciones()
    fireEvent.click(screen.getByTestId('compartir-en-juego-fondo'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('copiar link copia el link en vivo y avisa "Copiado"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share: vi.fn(), clipboard: { writeText } } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: false })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar link para mirar' }))
    await flush()

    expect(writeText).toHaveBeenCalledWith(`${SITE}/ronda-libre/ABC`)
    expect(screen.getByRole('button', { name: 'Link para mirar copiado' })).toBeTruthy()
  })

  // La hoja de opciones aparece donde estaba "Sí": el segundo toque de un doble toque caía en "Compartir".
  it('las opciones no reciben toques hasta pasado el doble toque que las abrió', async () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: false })} color="red" />)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Compartir la ronda' }))
    act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
    fireEvent.click(screen.getByRole('button', { name: 'Sí' }))
    const capa = screen.getByRole('button', { name: 'Compartir link para mirar' }).closest('[style*="pointer-events"]') as HTMLElement
    expect(capa.style.pointerEvents).toBe('none')
    act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
    expect(capa.style.pointerEvents).toBe('auto')
  })

  it('el foco entra a la hoja de opciones y vuelve al ícono al cerrarla', async () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<CompartirEnJuego de="ronda" enlaces={enlacesDeRondaLibre('ABC', { conJugar: false })} color="red" />)
    const icono = screen.getByRole('button', { name: 'Compartir la ronda' })
    icono.focus()
    await abrirOpciones()
    expect(screen.getByRole('dialog', { name: 'Compartir la ronda' }).contains(document.activeElement)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Volver al scorer' }))
    expect(document.activeElement).toBe(icono)
  })

  // /en-vivo pide sesión: los amigos sin cuenta que reciben el link se toparían con el login.
  it('en un torneo pregunta por el torneo y comparte su página pública con el nombre', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego de="torneo" enlaces={enlacesDeTorneo('copa-verano', 'Copa Verano')} color="red" />)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Compartir el torneo' }))
    expect(screen.getByRole('dialog', { name: '¿Quieres compartir el torneo con amigos?' })).toBeTruthy()
    act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
    fireEvent.click(screen.getByRole('button', { name: 'Sí' }))
    act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
    vi.useRealTimers()

    expect(screen.queryByText('Link para anotar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Compartir link para mirar' }))
    await flush()

    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Copa Verano',
      text: 'Mira cómo va Copa Verano en Golfers+',
      url: `${SITE}/torneo/copa-verano`,
    }))
  })
})
