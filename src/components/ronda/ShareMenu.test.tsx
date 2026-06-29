import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ShareMenu } from './ShareMenu'

/** Vacía microtasks + un macrotask (la cascada de useShare encadena varios awaits). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

/**
 * Caracteriza el comportamiento de ShareMenu y lo fija mientras migramos su
 * cascada inline (native/wa.me) al canónico `useShare` + builders de copy.
 * El copy canónico (joinText/liveText) coincide EXACTO con el actual.
 */
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
  vi.restoreAllMocks()
})
function setNavigator(nav: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
}

describe('ShareMenu', () => {
  it('"Invitar a jugar" comparte el link de score con copy "Únete a jugar"', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareMenu codigo="ABC" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /invitar a jugar/i }))
    await flush()

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Únete a jugar en Golfers+', url: `${SITE}/ronda-libre/ABC/score` }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('"Seguir en vivo" comparte el link en vivo con copy "Sigue mi ronda en vivo"', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareMenu codigo="ABC" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /seguir en vivo/i }))
    await flush()

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Sigue mi ronda en vivo en Golfers+', url: `${SITE}/ronda-libre/ABC` }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('sin navigator.share cae a wa.me (cascada canónica) y cierra', async () => {
    setNavigator({} as unknown as Navigator)
    const open = vi.fn().mockReturnValue({} as Window)
    window.open = open as unknown as typeof window.open
    const onClose = vi.fn()
    render(<ShareMenu codigo="XYZ" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /seguir en vivo/i }))
    await flush()

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toContain('https://wa.me/?text=')
    expect(onClose).toHaveBeenCalled()
  })

  it('en modo admin oculta "Invitar a jugar"', () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<ShareMenu codigo="ABC" onClose={() => {}} isAdminMode />)
    expect(screen.queryByRole('button', { name: /invitar a jugar/i })).toBeNull()
    expect(screen.getByRole('button', { name: /seguir en vivo/i })).toBeTruthy()
  })

  it('click en el backdrop cierra', () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareMenu codigo="ABC" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('sharemenu-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
})
