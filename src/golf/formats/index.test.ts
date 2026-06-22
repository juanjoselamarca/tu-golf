import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}))

import { captureError } from '@/lib/error-tracking'
import {
  FORMATS,
  KNOWN_FORMAT_KEYS,
  TEAM_FORMAT_KEYS,
  SHARED_BALL_FORMAT_KEYS,
  isTeamFormat,
  isSharedBallFormat,
  getFormat,
  getFormatStrict,
} from './index'

const captureErrorMock = vi.mocked(captureError)

describe('FORMATS registry — canario de los 6 formatos soportados', () => {
  it('expone exactamente las 6 claves canónicas en el orden esperado', () => {
    expect(KNOWN_FORMAT_KEYS).toEqual([
      'stroke_play',
      'stableford',
      'match_play',
      'best_ball',
      'scramble',
      'foursome',
    ])
  })

  it.each(['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome'])(
    'cada formato registrado expone name + description + category válidos (%s)',
    (key) => {
      const fmt = FORMATS[key]
      expect(fmt).toBeDefined()
      expect(fmt.name.length).toBeGreaterThan(0)
      expect(fmt.description.length).toBeGreaterThan(0)
      expect(['individual', 'team', 'head_to_head']).toContain(fmt.category)
    },
  )

  it('categoriza correctamente equipos vs head_to_head vs individual', () => {
    expect(FORMATS.stroke_play.category).toBe('individual')
    expect(FORMATS.stableford.category).toBe('individual')
    expect(FORMATS.match_play.category).toBe('head_to_head')
    expect(FORMATS.best_ball.category).toBe('team')
    expect(FORMATS.scramble.category).toBe('team')
    expect(FORMATS.foursome.category).toBe('team')
  })
})

describe('Helpers de formato por equipo — fuente única de verdad', () => {
  it('TEAM_FORMAT_KEYS = exactamente los 3 formatos por equipo, derivados del registry', () => {
    expect([...TEAM_FORMAT_KEYS]).toEqual(['best_ball', 'scramble', 'foursome'])
  })

  it('TEAM_FORMAT_KEYS se deriva de category === "team" (no es una lista hardcodeada paralela)', () => {
    // Si alguien agrega un formato con category "team" al registry, debe entrar
    // automáticamente acá. Esto pinea que la fuente es el registry, no un array suelto.
    const esperado = KNOWN_FORMAT_KEYS.filter(k => FORMATS[k].category === 'team')
    expect([...TEAM_FORMAT_KEYS]).toEqual(esperado)
  })

  it('isTeamFormat() reconoce los formatos por equipo y rechaza el resto', () => {
    expect(isTeamFormat('best_ball')).toBe(true)
    expect(isTeamFormat('scramble')).toBe(true)
    expect(isTeamFormat('foursome')).toBe(true)
    expect(isTeamFormat('stroke_play')).toBe(false)
    expect(isTeamFormat('stableford')).toBe(false)
    expect(isTeamFormat('match_play')).toBe(false)
  })

  it('isTeamFormat() es seguro ante null / undefined / desconocido', () => {
    expect(isTeamFormat(null)).toBe(false)
    expect(isTeamFormat(undefined)).toBe(false)
    expect(isTeamFormat('')).toBe(false)
    expect(isTeamFormat('formato_inventado')).toBe(false)
  })

  it('SHARED_BALL excluye best_ball (cada jugador su bola) e incluye scramble/foursome', () => {
    expect([...SHARED_BALL_FORMAT_KEYS]).toEqual(['scramble', 'foursome'])
    expect(isSharedBallFormat('scramble')).toBe(true)
    expect(isSharedBallFormat('foursome')).toBe(true)
    expect(isSharedBallFormat('best_ball')).toBe(false)
    expect(isSharedBallFormat('stroke_play')).toBe(false)
    expect(isSharedBallFormat(null)).toBe(false)
  })
})

describe('getFormat() — fallback observado', () => {
  beforeEach(() => {
    captureErrorMock.mockClear()
  })

  it('devuelve el formato correcto para una key conocida sin loggear', () => {
    const fmt = getFormat('best_ball')
    expect(fmt.name).toBe('Best Ball')
    expect(captureErrorMock).not.toHaveBeenCalled()
  })

  it('cae a stroke_play y loggea captureError ante key desconocida', () => {
    const fmt = getFormat('match_play_x_bandera')
    expect(fmt.name).toBe('Stroke Play')
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
    const [err, options] = captureErrorMock.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('match_play_x_bandera')
    expect(options.context).toBe('golf.formats.getFormat')
    expect(options.level).toBe('warning')
    expect(options.meta).toMatchObject({ key: 'match_play_x_bandera' })
  })

  it('cae a stroke_play y loggea ante string vacío', () => {
    const fmt = getFormat('')
    expect(fmt.name).toBe('Stroke Play')
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
  })
})

describe('getFormatStrict() — boundary estricto', () => {
  it('devuelve el formato correcto para una key conocida', () => {
    const fmt = getFormatStrict('foursome')
    expect(fmt.name).toBe('Foursome')
  })

  it.each(['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome'])(
    'no tira para la key canónica %s',
    (key) => {
      expect(() => getFormatStrict(key)).not.toThrow()
    },
  )

  it('tira con mensaje informativo ante key desconocida', () => {
    expect(() => getFormatStrict('bola_pinta')).toThrow(/Formato desconocido.*bola_pinta/)
  })

  it('tira ante string vacío', () => {
    expect(() => getFormatStrict('')).toThrow(/Formato desconocido/)
  })

  it('el mensaje lista los formatos válidos para ayudar al developer', () => {
    try {
      getFormatStrict('xyz')
      throw new Error('no debería llegar aquí')
    } catch (err) {
      const msg = (err as Error).message
      for (const key of ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']) {
        expect(msg).toContain(key)
      }
    }
  })
})
