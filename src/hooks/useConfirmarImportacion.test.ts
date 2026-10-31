// @vitest-environment jsdom
/**
 * Regresión (dead-end hunter 09-oct-2026): el paso de revisión del import
 * celebraba "N tarjetas guardadas" contando las tarjetas ACEPTADAS, no las que
 * /api/import/confirm guardó. Re-importar la misma foto → 200 con
 * total_imported: 0, total_duplicates: 1 → "Tarjeta guardada" sin guardar nada.
 * Y si el confirm fallaba, el usuario no veía ningún mensaje.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PLAZO_CONFIRMAR_IMPORTACION_MS } from '@/lib/red/plazos'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { captureError } from '@/lib/error-tracking'

import {
  useConfirmarImportacion,
  leerResultadoConfirmacion,
  mensajeSinImportar,
  detalleNoGuardadas,
} from './useConfirmarImportacion'

function respuesta(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) })
}

describe('leerResultadoConfirmacion', () => {
  it('lee los conteos reales del servidor', () => {
    expect(leerResultadoConfirmacion({
      total_imported: 2, total_duplicates: 1, total_errors: 0, cpiResult: null, insights: ['a', 3],
    })).toEqual({
      importadas: 2, actualizadas: 0, duplicadas: 1, fallidas: 0, noGuardadas: [], cpiResult: null, insights: ['a'],
    })
  })

  it('junta los tempId de duplicadas y fallidas (para no preguntar el tee por ellas)', () => {
    const r = leerResultadoConfirmacion({
      total_imported: 1, total_updated: 2,
      duplicates: [{ tempId: 'd1', course: 'x', date: 'y' }], errors: [{ tempId: 'e1', error: 'z' }, { nada: 1 }],
    })
    expect(r.actualizadas).toBe(2)
    expect(r.noGuardadas).toEqual(['d1', 'e1'])
  })

  it('respuesta sin conteos = 0 guardadas (nunca supone éxito)', () => {
    expect(leerResultadoConfirmacion(null).importadas).toBe(0)
    expect(leerResultadoConfirmacion({ success: true }).importadas).toBe(0)
  })
})

describe('mensajes', () => {
  it('solo duplicadas → dice que ya estaban en el historial', () => {
    expect(mensajeSinImportar({ duplicadas: 1, fallidas: 0 })).toMatch(/ya estaba en tu historial/)
    expect(mensajeSinImportar({ duplicadas: 3, fallidas: 0 })).toMatch(/ya estaban en tu historial/)
  })

  it('con fallidas → pide revisar y reintentar', () => {
    expect(mensajeSinImportar({ duplicadas: 1, fallidas: 1 })).toMatch(/No pudimos guardar/)
  })

  it('detalle de la celebración: null si todo se guardó', () => {
    expect(detalleNoGuardadas({ duplicadas: 0, fallidas: 0 })).toBeNull()
    expect(detalleNoGuardadas({ duplicadas: 2, fallidas: 1 }))
      .toBe('2 ya estaban en tu historial · 1 no se pudo guardar.')
    // Re-importar el mismo ZIP de Garmin: se re-escriben, no son nuevas.
    expect(detalleNoGuardadas({ duplicadas: 0, fallidas: 0, actualizadas: 18 }))
      .toBe('18 ya estaban y se actualizaron.')
  })
})

describe('useConfirmarImportacion', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('200 con 0 guardadas (todas duplicadas) → NO devuelve resultado y deja el mensaje', async () => {
    fetchMock.mockReturnValue(respuesta(200, { success: true, total_imported: 0, total_duplicates: 1, total_errors: 0 }))
    const { result } = renderHook(() => useConfirmarImportacion())
    let r: unknown = 'sin-llamar'
    await act(async () => { r = await result.current.confirmar('job-1', []) })
    expect(r).toBeNull()
    expect(result.current.error).toMatch(/ya estaba en tu historial/)
    expect(result.current.todasDuplicadas).toBe(true)
    expect(result.current.confirmando).toBe(false)
  })

  it('200 con solo actualizadas (Garmin re-importado) → sí avanza', async () => {
    fetchMock.mockReturnValue(respuesta(200, { total_imported: 0, total_updated: 3, total_duplicates: 0, total_errors: 0 }))
    const { result } = renderHook(() => useConfirmarImportacion())
    let r: { actualizadas: number } | null = null
    await act(async () => { r = await result.current.confirmar('job-1', []) })
    expect(r).toMatchObject({ actualizadas: 3 })
    expect(result.current.error).toBeNull()
  })

  it('400 de validación (code invalid_rounds) → dice qué hacer, no "Datos inválidos"', async () => {
    fetchMock.mockReturnValue(respuesta(400, { error: 'Datos de importación inválidos', code: 'invalid_rounds' }))
    const { result } = renderHook(() => useConfirmarImportacion())
    await act(async () => { await result.current.confirmar('job-1', []) })
    expect(result.current.error).toMatch(/fuera de rango.*descártala/)
    expect(result.current.todasDuplicadas).toBe(false)
  })

  it('200 con guardadas → devuelve el conteo del servidor, no el de aceptadas', async () => {
    fetchMock.mockReturnValue(respuesta(200, { total_imported: 1, total_duplicates: 2, total_errors: 0, cpiResult: null }))
    const { result } = renderHook(() => useConfirmarImportacion())
    let r: { importadas: number; duplicadas: number } | null = null
    await act(async () => { r = await result.current.confirmar('job-1', []) })
    expect(r).toMatchObject({ importadas: 1, duplicadas: 2 })
    expect(result.current.error).toBeNull()
  })

  it('409 con confirm en curso → dice que se están guardando, y el tracking trae el code para separarlo de un error', async () => {
    vi.mocked(captureError).mockClear()
    fetchMock.mockReturnValue(respuesta(409, { code: 'confirm_en_curso' }))
    const { result } = renderHook(() => useConfirmarImportacion())
    await act(async () => { await result.current.confirmar('job-1', []) })
    expect(result.current.error).toBe('Tus tarjetas se están guardando. Espera un momento y vuelve a intentar.')
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      meta: expect.objectContaining({ status: 409, code: 'confirm_en_curso' }),
    }))
  })

  it('error HTTP → muestra el mensaje del servidor', async () => {
    fetchMock.mockReturnValue(respuesta(404, { error: 'Job no encontrado o no te pertenece' }))
    const { result } = renderHook(() => useConfirmarImportacion())
    await act(async () => { await result.current.confirmar('job-1', []) })
    expect(result.current.error).toBe('Job no encontrado o no te pertenece')
  })

  it('sin red / respuesta no-JSON → mensaje genérico, nunca silencio', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useConfirmarImportacion())
    await act(async () => { await result.current.confirmar('job-1', []) })
    expect(result.current.error).toMatch(/Revisa tu conexión/)

    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, status: 502, text: () => Promise.resolve('<html>') }))
    await act(async () => { await result.current.confirmar('job-1', []) })
    expect(result.current.error).toMatch(/Revisa tu conexión/)
  })

  it('200 con cuerpo que no es JSON → mensaje genérico y queda registrado', async () => {
    vi.mocked(captureError).mockClear()
    fetchMock.mockReturnValue(Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html>') }))
    const { result } = renderHook(() => useConfirmarImportacion())
    await act(async () => { await result.current.confirmar('job-1', []) })
    expect(result.current.error).toMatch(/Revisa tu conexión/)
    expect(captureError).toHaveBeenCalledTimes(1)
  })

  it('conexión colgada → al vencer el plazo muestra el mensaje genérico y suelta el botón', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockReturnValue(new Promise(() => {}))
      const { result } = renderHook(() => useConfirmarImportacion())
      let pendiente!: Promise<unknown>
      act(() => { pendiente = result.current.confirmar('job-1', []) })
      expect(result.current.confirmando).toBe(true)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLAZO_CONFIRMAR_IMPORTACION_MS)
        await pendiente
      })
      expect(result.current.error).toMatch(/Revisa tu conexión/)
      expect(result.current.confirmando).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('PLAZO_CONFIRMAR_IMPORTACION_MS', () => {
  it('espera más que el maxDuration de /api/import/confirm: nunca da por perdido un guardado en curso', () => {
    const ruta = readFileSync('src/app/api/import/confirm/route.ts', 'utf8')
    const maxDuration = Number(/export const maxDuration = (\d+)/.exec(ruta)?.[1])
    expect(maxDuration).toBeGreaterThan(0)
    expect(PLAZO_CONFIRMAR_IMPORTACION_MS).toBeGreaterThan(maxDuration * 1000)
  })
})
