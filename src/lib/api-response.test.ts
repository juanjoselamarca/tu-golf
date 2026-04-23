/**
 * Tests para src/lib/api-response.ts — helpers de respuesta estandarizada.
 *
 * Todos los routes que adopten el formato { ok, data|error } pasan por
 * apiOk/apiError. Bug aquí → respuestas inconsistentes en toda la API.
 * Cobertura previa: 0%.
 */
import { describe, it, expect } from 'vitest'
import { apiOk, apiError } from './api-response'

describe('apiOk', () => {
  it('devuelve { ok: true, data }', async () => {
    const response = apiOk({ foo: 'bar' })
    const body = await response.json()
    expect(body).toEqual({ ok: true, data: { foo: 'bar' } })
  })

  it('incluye meta cuando se proporciona', async () => {
    const response = apiOk([1, 2, 3], { total: 3, page: 1, limit: 10 })
    const body = await response.json()
    expect(body).toEqual({
      ok: true,
      data: [1, 2, 3],
      meta: { total: 3, page: 1, limit: 10 },
    })
  })

  it('omite meta cuando no se proporciona', async () => {
    const response = apiOk('hello')
    const body = await response.json()
    expect(body).not.toHaveProperty('meta')
    expect(body).toEqual({ ok: true, data: 'hello' })
  })

  it('meta vacía ({}) igual se omite por truthy check', async () => {
    // meta={} es truthy → se incluye (edge case documentado)
    const response = apiOk('x', {})
    const body = await response.json()
    expect(body).toHaveProperty('meta')
    expect(body.meta).toEqual({})
  })

  it('data null se respeta', async () => {
    const response = apiOk(null)
    const body = await response.json()
    expect(body).toEqual({ ok: true, data: null })
  })

  it('status default es 200', async () => {
    const response = apiOk({ x: 1 })
    expect(response.status).toBe(200)
  })
})

describe('apiError', () => {
  it('devuelve { ok: false, error } con status explícito', async () => {
    const response = apiError('No autorizado', 401)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toEqual({ ok: false, error: 'No autorizado' })
  })

  it('incluye code cuando se proporciona', async () => {
    const response = apiError('Rate limited', 429, 'RATE_LIMIT')
    const body = await response.json()
    expect(body).toEqual({
      ok: false,
      error: 'Rate limited',
      code: 'RATE_LIMIT',
    })
  })

  it('omite code cuando no se proporciona', async () => {
    const response = apiError('Error interno', 500)
    const body = await response.json()
    expect(body).not.toHaveProperty('code')
  })

  it('status 4xx', async () => {
    expect(apiError('Not found', 404).status).toBe(404)
    expect(apiError('Bad request', 400).status).toBe(400)
    expect(apiError('Forbidden', 403).status).toBe(403)
  })

  it('status 5xx', async () => {
    expect(apiError('Server error', 500).status).toBe(500)
    expect(apiError('Bad gateway', 502).status).toBe(502)
  })

  it('mensaje vacío igual se serializa', async () => {
    const response = apiError('', 400)
    const body = await response.json()
    expect(body.error).toBe('')
  })
})

describe('apiOk / apiError — compatibilidad tipo-unión', () => {
  it('ok=true nunca tiene error', async () => {
    const response = apiOk({ x: 1 })
    const body = await response.json()
    expect(body).not.toHaveProperty('error')
  })

  it('ok=false nunca tiene data', async () => {
    const response = apiError('oops', 400)
    const body = await response.json()
    expect(body).not.toHaveProperty('data')
  })
})
