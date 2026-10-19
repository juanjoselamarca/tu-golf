import { describe, it, expect, vi } from 'vitest'
import { notificarCambioIndice, topicAvisoIndice, type DepsAvisoIndice } from './indice'

const sub = (endpoint: string) => ({ endpoint, p256dh: 'p', auth: 'a' })

function deps(over: Partial<DepsAvisoIndice> = {}) {
  return {
    quiereAviso: vi.fn(async () => true),
    suscripciones: vi.fn(async () => [sub('e1'), sub('e2')]),
    enviar: vi.fn(async () => {}),
    borrarMuertas: vi.fn(async () => {}),
    ...over,
  }
}

describe('notificarCambioIndice', () => {
  it('bajó: envía el copy de construirAvisoIndice a cada dispositivo, con topic y TTL de 24 h', async () => {
    const d = deps()
    expect(await notificarCambioIndice(d, 'u1', 8.1, 8.3)).toBe('enviado')
    expect(d.enviar).toHaveBeenCalledTimes(2)
    const [, payload, opts] = vi.mocked(d.enviar).mock.calls[0] as unknown as [unknown, string, { ttlSeconds: number; topic: string }]
    expect(JSON.parse(payload)).toEqual({
      title: 'Bajaste tu índice a 8.1',
      body: 'Venías de 8.3. Actualizado desde FedeGolf.',
      tag: 'indice-fedegolf',
      data: { url: '/perfil' },
    })
    expect(opts).toEqual({ ttlSeconds: 86_400, topic: topicAvisoIndice('u1') })
  })

  it('subió: copy neutro', async () => {
    const d = deps()
    await notificarCambioIndice(d, 'u1', 8.5, 8.3)
    expect(JSON.parse((vi.mocked(d.enviar).mock.calls[0] as unknown as [unknown, string])[1]).title).toBe('Tu índice subió a 8.5')
  })

  it.each([
    ['sin índice anterior (primera sincronización)', 8.1, null],
    ['cambio bajo la precisión que mostramos', 8.31, 8.3],
  ])('%s → no avisa ni consulta nada', async (_, nuevo, anterior) => {
    const d = deps()
    expect(await notificarCambioIndice(d, 'u1', nuevo, anterior)).toBe('sin_cambio')
    expect(d.quiereAviso).not.toHaveBeenCalled()
    expect(d.enviar).not.toHaveBeenCalled()
  })

  it('preferencia desactivada → no envía', async () => {
    const d = deps({ quiereAviso: vi.fn(async () => false) })
    expect(await notificarCambioIndice(d, 'u1', 8.1, 8.3)).toBe('desactivado')
    expect(d.suscripciones).not.toHaveBeenCalled()
  })

  it('sin dispositivos → no envía', async () => {
    const d = deps({ suscripciones: vi.fn(async () => []) })
    expect(await notificarCambioIndice(d, 'u1', 8.1, 8.3)).toBe('sin_dispositivos')
    expect(d.enviar).not.toHaveBeenCalled()
  })

  it('borra las suscripciones muertas; si ninguna recibió, es no_entregado', async () => {
    const d = deps({ enviar: vi.fn(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }) }) })
    expect(await notificarCambioIndice(d, 'u1', 8.1, 8.3)).toBe('no_entregado')
    expect(d.borrarMuertas).toHaveBeenCalledWith(['e1', 'e2'])
  })
})

describe('topicAvisoIndice', () => {
  it('≤32 chars base64url, estable y distinto por usuario', () => {
    const t = topicAvisoIndice('5b9c1f0e-0000-4000-8000-000000000001')
    expect(t).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
    expect(topicAvisoIndice('5b9c1f0e-0000-4000-8000-000000000001')).toBe(t)
    expect(topicAvisoIndice('otro')).not.toBe(t)
  })
})
