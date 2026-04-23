import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from './logger'

describe('logger (src/utils)', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    logSpy.mockClear()
    warnSpy.mockClear()
    errorSpy.mockClear()
  })

  it('info llama a console.log con prefijo de contexto', () => {
    logger.info('auth', 'login OK', { userId: 'abc123' })
    expect(logSpy).toHaveBeenCalledOnce()
    expect(logSpy.mock.calls[0][0]).toContain('[auth]')
    expect(logSpy.mock.calls[0][0]).toContain('login OK')
  })

  it('warn llama a console.warn con prefijo WARN', () => {
    logger.warn('fedegolf', 'sync lento', { duration: 1500 })
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('WARN:')
    expect(warnSpy.mock.calls[0][0]).toContain('[fedegolf]')
  })

  it('error llama a console.error con prefijo ERROR', () => {
    logger.error('scoring', 'upsert falló', new Error('boom'), { rondaId: 'x' })
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0][0]).toContain('ERROR:')
    expect(errorSpy.mock.calls[0][0]).toContain('[scoring]')
  })

  it('formatea meta con requestId y userId truncados', () => {
    logger.info('api', 'request', null, {
      requestId: 'abcdefgh-1234-5678',
      userId: 'userid12345',
    })
    expect(logSpy.mock.calls[0][0]).toContain('req=abcdefgh')
    expect(logSpy.mock.calls[0][0]).toContain('user=userid12')
  })

  it('api() clasifica por status code', () => {
    logger.api('GET', '/api/test', 200, 50)
    expect(logSpy).toHaveBeenCalledOnce()
    logSpy.mockClear()

    logger.api('POST', '/api/fail', 500, 100)
    expect(errorSpy).toHaveBeenCalledOnce()
    errorSpy.mockClear()

    logger.api('GET', '/api/404', 404, 20)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('no falla sin meta', () => {
    expect(() => logger.info('ctx', 'msg')).not.toThrow()
    expect(() => logger.warn('ctx', 'msg')).not.toThrow()
    expect(() => logger.error('ctx', 'msg')).not.toThrow()
  })

  it('error acepta error no-Error (string/unknown)', () => {
    expect(() => logger.error('ctx', 'msg', 'string error')).not.toThrow()
    expect(() => logger.error('ctx', 'msg', { obj: true })).not.toThrow()
  })
})
