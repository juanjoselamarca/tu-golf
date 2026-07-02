import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from './download'

// Snapshot de URL.* (los tests los sobreescriben por asignación directa, que
// vi.restoreAllMocks NO restaura) para no contaminar otros tests.
const u = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown }
let origCreate: unknown
let origRevoke: unknown
beforeEach(() => { origCreate = u.createObjectURL; origRevoke = u.revokeObjectURL })
afterEach(() => { u.createObjectURL = origCreate; u.revokeObjectURL = origRevoke; vi.restoreAllMocks() })

describe('downloadBlob', () => {
  it('crea un objectURL del blob y dispara la descarga con el filename', () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL
    ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const blob = new Blob(['x'], { type: 'image/png' })
    const ok = downloadBlob(blob, 'tarjeta.png')

    expect(ok).toBe(true)
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('nunca lanza: devuelve false si createObjectURL no existe', () => {
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = undefined
    const blob = new Blob(['x'], { type: 'image/png' })
    expect(downloadBlob(blob, 'x.png')).toBe(false)
  })
})
