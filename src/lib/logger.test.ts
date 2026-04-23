import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    logSpy.mockClear()
    warnSpy.mockClear()
    errorSpy.mockClear()
  })

  afterEach(() => {
    logSpy.mockClear()
    warnSpy.mockClear()
    errorSpy.mockClear()
  })

  describe('en desarrollo (NODE_ENV !== production)', () => {
    it('info llama a console.log con prefijo [INFO]', () => {
      logger.info('test message', { foo: 'bar' })
      expect(logSpy).toHaveBeenCalledOnce()
      expect(logSpy.mock.calls[0][0]).toContain('[INFO]')
      expect(logSpy.mock.calls[0][0]).toContain('test message')
    })

    it('warn llama a console.warn con prefijo [WARN]', () => {
      logger.warn('warning message', { duration: 100 })
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0][0]).toContain('[WARN]')
    })

    it('error llama a console.error con prefijo [ERROR]', () => {
      const err = new Error('boom')
      logger.error('error message', err, { userId: 'abc' })
      expect(errorSpy).toHaveBeenCalledOnce()
      expect(errorSpy.mock.calls[0][0]).toContain('[ERROR]')
      expect(errorSpy.mock.calls[0][0]).toContain('error message')
    })

    it('no falla si context es undefined', () => {
      expect(() => logger.info('sin contexto')).not.toThrow()
      expect(() => logger.warn('sin contexto')).not.toThrow()
      expect(() => logger.error('sin contexto')).not.toThrow()
    })

    it('no falla si err es string en lugar de Error', () => {
      expect(() => logger.error('msg', 'string error', { x: 1 })).not.toThrow()
    })
  })
})
