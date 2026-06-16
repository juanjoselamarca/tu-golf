import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyToClipboard } from '../clipboard'

// jsdom no define document.execCommand; lo instalamos como mock por test.
function mockExecCommand(result: boolean) {
  const fn = vi.fn().mockReturnValue(result)
  ;(document as unknown as { execCommand: unknown }).execCommand = fn
  return fn
}

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // limpiar overrides
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    delete (document as unknown as { execCommand?: unknown }).execCommand
  })

  it('usa la Clipboard API moderna cuando está disponible', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const ok = await copyToClipboard('hola')

    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hola')
  })

  it('cae al fallback execCommand cuando la API moderna rechaza, y NO lanza', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Write permission denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const exec = mockExecCommand(true)

    const ok = await copyToClipboard('texto')

    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalled()
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('usa el fallback cuando navigator.clipboard no existe', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const exec = mockExecCommand(true)

    const ok = await copyToClipboard('x')

    expect(ok).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('devuelve false (sin lanzar) cuando ambos métodos fallan', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mockExecCommand(false)

    const ok = await copyToClipboard('x')

    expect(ok).toBe(false)
  })

  it('no deja textareas huérfanos en el DOM tras el fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    mockExecCommand(true)

    await copyToClipboard('x')

    expect(document.querySelectorAll('textarea').length).toBe(0)
  })
})
