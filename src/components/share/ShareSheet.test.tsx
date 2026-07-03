import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ShareSheet } from './ShareSheet'
import type { SharePayload } from '@/golf/share/types'

/** Vacía microtasks + un macrotask (las acciones del sheet son async). */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const payload: SharePayload = {
  title: 'Mi ronda — Golfers+',
  text: 'Jugué 82 (+10) en Los Leones',
  url: 'https://golfersplus.vercel.app/tarjeta/abc',
}

function withImage(): SharePayload {
  return { ...payload, image: { blob: new Blob(['x'], { type: 'image/png' }), filename: 'tarjeta.png' } }
}

let origNavigator: PropertyDescriptor | undefined
let origOpen: typeof window.open

beforeEach(() => {
  origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  origOpen = window.open
  // jsdom no implementa createObjectURL — lo stubbeamos para el preview.
  ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock')
  ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn()
})

afterEach(() => {
  if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator)
  window.open = origOpen
  vi.restoreAllMocks()
})

function setNavigator(nav: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
}

describe('ShareSheet', () => {
  it('no renderiza nada cuando open=false', () => {
    const { container } = render(<ShareSheet open={false} onClose={() => {}} payload={payload} />)
    expect(container.firstChild).toBeNull()
  })

  it('open=true muestra título y los botones de la variante A', () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={payload} />)
    expect(screen.getByRole('heading', { name: 'Compartir' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^compartir/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /copiar link/i })).toBeTruthy()
  })

  it('botón primario: "Compartir" cuando NO hay imagen (share de link)', () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={payload} />)
    const primary = screen.getByRole('button', { name: /^compartir/i })
    expect(primary.textContent).toBe('Compartir')
    expect(screen.queryByRole('button', { name: /compartir imagen/i })).toBeNull()
  })

  it('botón primario: "Compartir imagen" cuando SÍ hay imagen', () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={withImage()} />)
    expect(screen.getByRole('button', { name: /compartir imagen/i })).toBeTruthy()
  })

  it('"Más opciones" solo aparece si existe navigator.share', () => {
    setNavigator({} as unknown as Navigator) // sin share
    const { rerender } = render(<ShareSheet open onClose={() => {}} payload={payload} />)
    expect(screen.queryByRole('button', { name: /más opciones/i })).toBeNull()

    setNavigator({ share: vi.fn() } as unknown as Navigator)
    rerender(<ShareSheet open onClose={() => {}} payload={{ ...payload }} />)
    expect(screen.getByRole('button', { name: /más opciones/i })).toBeTruthy()
  })

  it('con imagen: renderiza el preview <img> con el objectURL', () => {
    setNavigator({} as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={withImage()} />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('blob:mock')
  })

  it('sin imagen: no renderiza <img>', () => {
    setNavigator({} as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={payload} />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('"Compartir imagen" dispara navigator.share', () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={payload} />)
    fireEvent.click(screen.getByRole('button', { name: /^compartir/i }))
    expect(share).toHaveBeenCalledTimes(1)
  })

  it('"WhatsApp" abre wa.me', () => {
    setNavigator({} as unknown as Navigator)
    const open = vi.fn().mockReturnValue({} as Window)
    window.open = open as unknown as typeof window.open
    render(<ShareSheet open onClose={() => {}} payload={payload} />)
    fireEvent.click(screen.getByRole('button', { name: /whatsapp/i }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toContain('https://wa.me/?text=')
  })

  it('"Copiar link" copia la url y notifica onCopied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } } as unknown as Navigator)
    const onCopied = vi.fn()
    render(<ShareSheet open onClose={() => {}} payload={payload} onCopied={onCopied} />)
    fireEvent.click(screen.getByRole('button', { name: /copiar link/i }))
    // microtask: copyToClipboard es async
    await Promise.resolve()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(payload.url)
    expect(onCopied).toHaveBeenCalledTimes(1)
  })

  it('"Compartir imagen" exitoso (native) cierra el sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareSheet open onClose={onClose} payload={payload} />)
    fireEvent.click(screen.getByRole('button', { name: /^compartir/i }))
    await flush()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('"Compartir imagen" que degrada a portapapeles dispara onCopied (no falla en silencio)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } } as unknown as Navigator) // sin share
    window.open = vi.fn().mockReturnValue(null) as unknown as typeof window.open // wa.me bloqueado
    const onCopied = vi.fn()
    render(<ShareSheet open onClose={() => {}} payload={payload} onCopied={onCopied} />)
    fireEvent.click(screen.getByRole('button', { name: /^compartir/i }))
    await flush()
    expect(writeText).toHaveBeenCalled()
    expect(onCopied).toHaveBeenCalledTimes(1)
  })

  it('"WhatsApp" que abre cierra el sheet', () => {
    setNavigator({} as unknown as Navigator)
    window.open = vi.fn().mockReturnValue({} as Window) as unknown as typeof window.open
    const onClose = vi.fn()
    render(<ShareSheet open onClose={onClose} payload={payload} />)
    fireEvent.click(screen.getByRole('button', { name: /whatsapp/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('"WhatsApp" bloqueado cae a copiar link + onCopied (sin botón muerto)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } } as unknown as Navigator)
    window.open = vi.fn().mockReturnValue(null) as unknown as typeof window.open
    const onCopied = vi.fn()
    render(<ShareSheet open onClose={() => {}} payload={payload} onCopied={onCopied} />)
    fireEvent.click(screen.getByRole('button', { name: /whatsapp/i }))
    await flush()
    expect(writeText).toHaveBeenCalledWith(payload.url)
    expect(onCopied).toHaveBeenCalledTimes(1)
  })

  it('"Más opciones" (native) exitoso cierra el sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share } as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareSheet open onClose={onClose} payload={payload} />)
    fireEvent.click(screen.getByRole('button', { name: /más opciones/i }))
    await flush()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape cierra (onClose)', () => {
    setNavigator({} as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareSheet open onClose={onClose} payload={payload} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('click en el backdrop cierra (onClose)', () => {
    setNavigator({} as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareSheet open onClose={onClose} payload={payload} />)
    fireEvent.click(screen.getByTestId('share-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('botón Cerrar (X) accesible cierra (onClose)', () => {
    setNavigator({} as unknown as Navigator)
    const onClose = vi.fn()
    render(<ShareSheet open onClose={onClose} payload={payload} />)
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('atrapa el foco: Tab desde el último control vuelve al primero (aria-modal real)', () => {
    setNavigator({ share: vi.fn() } as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={payload} />)
    const buttons = screen.getAllByRole('button')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('es un dialog modal accesible', () => {
    setNavigator({} as unknown as Navigator)
    render(<ShareSheet open onClose={() => {}} payload={payload} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
