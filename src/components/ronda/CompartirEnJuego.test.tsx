import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CompartirEnJuego } from './CompartirEnJuego'
import { enlacesDeRondaLibre } from './OpcionesParaCompartir'
import { MS_ANTES_DE_ARMAR } from './ConfirmarFinalizarHoja'

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

/** Toca el ícono y contesta "Sí" (armado tras los 400 ms contra el doble toque). */
async function abrirOpciones() {
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Compartir la ronda' }))
  act(() => { vi.advanceTimersByTime(MS_ANTES_DE_ARMAR) })
  vi.useRealTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Sí' }))
}

describe('CompartirEnJuego', () => {
  it('el ícono primero pregunta; "No" vuelve al scorer sin compartir nada', () => {
    const share = vi.fn()
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)

    fireEvent.click(screen.getByRole('button', { name: 'Compartir la ronda' }))
    expect(screen.getByRole('dialog', { name: '¿Quieres compartir tu ronda con amigos?' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(share).not.toHaveBeenCalled()
  })

  it('el ícono mide 44 px de toque (uso en cancha)', () => {
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    const boton = screen.getByRole('button', { name: 'Compartir la ronda' })
    expect(boton.style.minWidth).toBe('44px')
    expect(boton.style.minHeight).toBe('44px')
  })

  it('"Sí" muestra las opciones de "Ronda creada"; invitar a seguir comparte el link en vivo y vuelve al scorer', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    await abrirOpciones()

    expect(screen.getByText('Invitar a jugar')).toBeTruthy()
    expect(screen.getByText('Invitar a seguir')).toBeTruthy()

    // Los "Compartir" van en el orden de los títulos: jugar, seguir.
    fireEvent.click(screen.getAllByRole('button', { name: 'Compartir' })[1])
    await flush()

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Sigue mi ronda en vivo en Golfers+', url: `${SITE}/ronda-libre/ABC` }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('invitar a jugar comparte el link del scorer', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getAllByRole('button', { name: 'Compartir' })[0])
    await flush()

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Únete a jugar en Golfers+', url: `${SITE}/ronda-libre/ABC/score` }),
    )
  })

  it('si la persona cancela la hoja del teléfono, las opciones siguen abiertas', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' })
    setNavigator({ share: vi.fn().mockRejectedValue(abort) } as unknown as Navigator)
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getAllByRole('button', { name: 'Compartir' })[1])
    await flush()

    expect(screen.getByRole('dialog', { name: 'Compartir la ronda' })).toBeTruthy()
  })

  it('sin compartir nativo cae a WhatsApp (cascada canónica)', async () => {
    setNavigator({} as unknown as Navigator)
    const open = vi.fn().mockReturnValue({} as Window)
    window.open = open as unknown as typeof window.open
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('XYZ', { conJugar: false })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    await flush()

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toContain('https://wa.me/?text=')
  })

  // Un solo celular anota por todos: el link para sumarse a anotar llevaba a "El admin de grupo lleva tu score".
  it('sin link para jugar solo ofrece invitar a seguir', async () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: false })} color="red" />)
    await abrirOpciones()

    expect(screen.queryByText('Invitar a jugar')).toBeNull()
    expect(screen.getByText('Invitar a seguir')).toBeTruthy()
  })

  it('"Volver al scorer" y tocar fuera cierran las opciones', async () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: true })} color="red" />)
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
    render(<CompartirEnJuego enlaces={enlacesDeRondaLibre('ABC', { conJugar: false })} color="red" />)
    await abrirOpciones()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }))
    await flush()

    expect(writeText).toHaveBeenCalledWith(`${SITE}/ronda-libre/ABC`)
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy()
  })
})
