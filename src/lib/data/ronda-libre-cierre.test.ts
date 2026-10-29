import { describe, it, expect, vi } from 'vitest'
import {
  descartarRondaLibre,
  mensajeErrorDescartar,
  RONDA_ERRCODE,
  esRechazoDefinitivo,
  esRechazoDefinitivoDeTimba,
} from './ronda-libre-cierre'

function cliente(respuesta: { data?: unknown; error?: unknown }) {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...respuesta }) }
}

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
    expect(mensajeErrorDescartar({ code: 'P0003', details: 'ronda con datos asociados', message: '' }))
      .toBe('Esta ronda tiene datos asociados y no se puede descartar.')
    expect(mensajeErrorDescartar({ code: 'P0001', details: '', message: '' })).toBe('Esta ronda ya no existe.')
    expect(mensajeErrorDescartar({ code: '08006', details: '', message: 'network' }))
      .toBe('No se pudo descartar la ronda. Intenta de nuevo.')
  })
})

describe('esRechazoDefinitivo — golpes (y base de la Timba)', () => {
  it('ronda inexistente, finalizada, delta inválido o parámetro inválido: definitivo', () => {
    for (const code of ['P0001', 'P0002', 'P0004', '22023']) expect(esRechazoDefinitivo({ code })).toBe(true)
  })
  it('sin red (code vacío, status 0), plazo vencido, 5xx y sesión vencida (P0003): se reintenta', () => {
    for (const code of ['', 'SIN_RESPUESTA', '503', 'P0003', 'PGRST301']) expect(esRechazoDefinitivo({ code })).toBe(false)
    expect(esRechazoDefinitivo(null)).toBe(false)
    expect(esRechazoDefinitivo({})).toBe(false)
  })
})

describe('esRechazoDefinitivoDeTimba — marcas y retiros (RPC sin grant para anon)', () => {
  it('lo definitivo de golpes más P0003 (ronda demo o sin permiso: nunca es sesión vencida)', () => {
    for (const code of ['P0001', 'P0002', 'P0003', 'P0004', '22023']) expect(esRechazoDefinitivoDeTimba({ code })).toBe(true)
  })
  it('sesión caída (42501, PGRST301/303), sin red, plazo vencido y 5xx: se reintenta', () => {
    for (const code of ['42501', 'PGRST301', 'PGRST303', '', 'SIN_RESPUESTA', '503']) expect(esRechazoDefinitivoDeTimba({ code })).toBe(false)
    expect(esRechazoDefinitivoDeTimba(null)).toBe(false)
  })
})
