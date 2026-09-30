import { describe, it, expect, vi } from 'vitest'
import {
  descartarRondaLibre,
  finalizarRondaLibre,
  mensajeErrorDescartar,
  RONDA_ERRCODE,
} from './ronda-libre-cierre'

function cliente(respuesta: { data?: unknown; error?: unknown }) {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...respuesta }) }
}

describe('finalizarRondaLibre', () => {
  it('llama al RPC con el código y nunca escribe la tabla directo', async () => {
    const sb = cliente({ data: true })
    const r = await finalizarRondaLibre(sb as never, 'ABC123')
    expect(sb.rpc).toHaveBeenCalledWith('finalizar_ronda_libre', { p_codigo: 'ABC123' })
    expect(r).toEqual({ finalizada: true, error: null })
  })

  it('false = otro dispositivo ya la cerró (no es error)', async () => {
    const r = await finalizarRondaLibre(cliente({ data: false }) as never, 'ABC123')
    expect(r).toEqual({ finalizada: false, error: null })
  })

  it('propaga el error del servidor (p. ej. sin permiso)', async () => {
    const error = { code: RONDA_ERRCODE.FORBIDDEN, message: 'RONDA_FORBIDDEN', details: '' }
    const r = await finalizarRondaLibre(cliente({ error }) as never, 'ABC123')
    expect(r.finalizada).toBe(false)
    expect(r.error).toBe(error)
  })
})

describe('descartarRondaLibre', () => {
  it('éxito sin error', async () => {
    const sb = cliente({})
    expect(await descartarRondaLibre(sb as never, 'ABC123')).toEqual({ error: null })
    expect(sb.rpc).toHaveBeenCalledWith('descartar_ronda_libre', { p_codigo: 'ABC123' })
  })

  it('no-creador recibe un mensaje claro (antes: "Ronda descartada" sin borrar nada)', async () => {
    const r = await descartarRondaLibre(
      cliente({ error: { code: 'P0003', message: 'RONDA_FORBIDDEN', details: '' } }) as never,
      'ABC123',
    )
    expect(r.error).toBe('Solo quien creó la ronda puede descartarla.')
  })
})

describe('mensajeErrorDescartar', () => {
  it('distingue ronda de torneo, inexistente y error genérico', () => {
    expect(mensajeErrorDescartar({ code: 'P0003', details: 'ronda de torneo', message: '' }))
      .toBe('Las rondas de un torneo no se pueden descartar.')
    expect(mensajeErrorDescartar({ code: 'P0001', details: '', message: '' })).toBe('Esta ronda ya no existe.')
    expect(mensajeErrorDescartar({ code: '08006', details: '', message: 'network' }))
      .toBe('No se pudo descartar la ronda. Intenta de nuevo.')
  })
})
