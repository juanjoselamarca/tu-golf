import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ShareResultsButton from './ShareResultsButton'

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const props = {
  tournamentName: 'Copa Verano',
  courseName: 'Los Leones',
  dateDisplay: '12 ene 2026',
  parTotal: 72,
  topPlayers: [
    { pos: 1, name: 'Pedro', score: '-2' },
    { pos: 2, name: 'Ana', score: '+1' },
  ],
}

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

describe('ShareResultsButton', () => {
  it('comparte el leaderboard con título = nombre del torneo y los jugadores', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<ShareResultsButton {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /compartir resultados/i }))
    await flush()

    expect(share).toHaveBeenCalledTimes(1)
    const arg = share.mock.calls[0][0] as { title: string; text: string; url: string }
    expect(arg.title).toBe('Copa Verano')
    expect(arg.text).toContain('Pedro')
    expect(arg.text).toContain('Los Leones')
    expect(arg.url).toBeTruthy() // ahora comparte CON el link del leaderboard
  })

  it('sin navigator.share cae a wa.me con el texto del leaderboard', async () => {
    setNavigator({} as unknown as Navigator)
    const open = vi.fn().mockReturnValue({} as Window)
    window.open = open as unknown as typeof window.open
    render(<ShareResultsButton {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /compartir resultados/i }))
    await flush()

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toContain('https://wa.me/?text=')
    expect(decodeURIComponent(open.mock.calls[0][0] as string)).toContain('Copa Verano')
  })

  it('wa.me bloqueado → copia al portapapeles y muestra "Copiado"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } } as unknown as Navigator)
    window.open = vi.fn().mockReturnValue(null) as unknown as typeof window.open
    render(<ShareResultsButton {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /compartir resultados/i }))
    await flush()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button').textContent).toMatch(/copiado/i)
  })

  it('wa.me bloqueado Y portapapeles falla → NO miente "Copiado" (CERO FALLOS)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    setNavigator({ clipboard: { writeText } } as unknown as Navigator)
    window.open = vi.fn().mockReturnValue(null) as unknown as typeof window.open
    document.execCommand = vi.fn().mockReturnValue(false) // fallback textarea también falla
    render(<ShareResultsButton {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /compartir resultados/i }))
    await flush()

    expect(screen.getByRole('button').textContent).not.toMatch(/copiado/i)
  })
})
