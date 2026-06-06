// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureErrorMock = vi.fn()
vi.mock('@/lib/error-tracking', () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}))

import { log } from './inbox-logger'

describe('inbox-logger', () => {
  beforeEach(() => {
    captureErrorMock.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('un error se reporta a captureError con context "inbox" (persistencia server-side)', () => {
    log('error', 'inbox insert failed', { error: 'boom' })
    expect(captureErrorMock).toHaveBeenCalledOnce()
    const [, opts] = captureErrorMock.mock.calls[0]
    expect(opts).toMatchObject({ context: 'inbox' })
  })

  it('info y warn NO reportan a captureError (solo console)', () => {
    log('info', 'hola')
    log('warn', 'cuidado')
    expect(captureErrorMock).not.toHaveBeenCalled()
  })

  it('redacta secretos antes de reportar', () => {
    log('error', 'fallo con token bot123456:ABCdefGHIjklMNOpqrs', {})
    const [errArg] = captureErrorMock.mock.calls[0]
    expect(String(errArg)).not.toContain('ABCdefGHIjklMNOpqrs')
    expect(String(errArg)).toContain('[REDACTED]')
  })
})
