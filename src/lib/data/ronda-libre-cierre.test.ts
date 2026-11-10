import { describe, it, expect, vi } from 'vitest'
import {
  descartarRondaLibre,
  mensajeErrorDescartar,
  RONDA_ERRCODE,
  esNoReintentable,
  esRechazoQueDescarta,
  esRechazoDefinitivoDeTimba,
  esRechazoDelCierre,
} from './ronda-libre-cierre'

function cliente(respuesta: { data?: unknown; error?: unknown }) {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...respuesta }) }
}

describe('descartarRondaLibre', () => {
  it('éxito sin error', async () => {
    const sb = cliente({})
    expect(await descartarRondaLibre(sb as never, 'ABC123')).toEqual({ error: null, noExiste: false })
    expect(sb.rpc).toHaveBeenCalledWith('descartar_ronda_libre', { p_codigo: 'ABC123' })
  })

  it('P0001 (la borró un intento anterior cuya respuesta se perdió): noExiste, para seguir como descartada', async () => {
    const r = await descartarRondaLibre(
      cliente({ error: { code: 'P0001', message: 'RONDA_NOT_FOUND', details: '' } }) as never,
      'ABC123',
    )
    expect(r.noExiste).toBe(true)
  })

  it('sin red, sin permiso o 5xx: NO es noExiste (la ronda puede seguir viva)', async () => {
    for (const code of ['', 'P0003', '08006', 'PGRST301']) {
      const r = await descartarRondaLibre(cliente({ error: { code, message: 'x', details: '' } }) as never, 'ABC123')
      expect(r.noExiste).toBe(false)
      expect(r.error).not.toBeNull()
    }
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

describe('esNoReintentable — golpes', () => {
  it('ronda inexistente, finalizada, delta inválido o parámetro inválido: no se reintenta', () => {
    for (const code of ['P0001', 'P0002', 'P0004', '22023']) expect(esNoReintentable({ code })).toBe(true)
  })
  it('sin red (code vacío, status 0), plazo vencido, 5xx y sesión vencida (P0003): se reintenta', () => {
    for (const code of ['', 'SIN_RESPUESTA', '503', 'P0003', 'PGRST301']) expect(esNoReintentable({ code })).toBe(false)
    expect(esNoReintentable(null)).toBe(false)
    expect(esNoReintentable({})).toBe(false)
  })
})

describe('esRechazoQueDescarta — golpes (y base de la Timba)', () => {
  it('ronda inexistente, delta inválido o parámetro inválido: se descarta', () => {
    for (const code of ['P0001', 'P0004', '22023']) expect(esRechazoQueDescarta({ code })).toBe(true)
  })
  it('ronda finalizada (P0002) NO se descarta: se puede reabrir y los golpes sin subir son lo único que hay', () => {
    expect(esNoReintentable({ code: 'P0002' })).toBe(true)
    expect(esRechazoQueDescarta({ code: 'P0002' })).toBe(false)
  })
  it('lo reintentable tampoco se descarta', () => {
    for (const code of ['', 'SIN_RESPUESTA', '503', 'P0003', 'PGRST301']) expect(esRechazoQueDescarta({ code })).toBe(false)
    expect(esRechazoQueDescarta(null)).toBe(false)
  })
})

describe('esRechazoDefinitivoDeTimba — marcas y retiros (RPC sin grant para anon)', () => {
  it('lo que descarta en golpes más P0003 (ronda demo o sin permiso: nunca es sesión vencida)', () => {
    for (const code of ['P0001', 'P0003', 'P0004', '22023']) expect(esRechazoDefinitivoDeTimba({ code })).toBe(true)
  })
  it('ronda finalizada (P0002): la marca queda pendiente (la ronda se puede reabrir)', () => {
    expect(esRechazoDefinitivoDeTimba({ code: 'P0002' })).toBe(false)
  })
  it('sesión caída (42501, PGRST301/303), sin red, plazo vencido y 5xx: se reintenta', () => {
    for (const code of ['42501', 'PGRST301', 'PGRST303', '', 'SIN_RESPUESTA', '503']) expect(esRechazoDefinitivoDeTimba({ code })).toBe(false)
    expect(esRechazoDefinitivoDeTimba(null)).toBe(false)
  })
})

describe('esRechazoDelCierre', () => {
  it('los errcodes de la RPC son respuesta firme, también P0003', () => {
    for (const code of Object.values(RONDA_ERRCODE)) expect(esRechazoDelCierre({ code })).toBe(true)
  })
  it('sin red, plazo vencido, 5xx y sesión caída no dicen si cerró: se reintenta', () => {
    for (const code of ['', 'SIN_RESPUESTA', '503', '42501', 'PGRST301']) expect(esRechazoDelCierre({ code })).toBe(false)
    expect(esRechazoDelCierre(null)).toBe(false)
  })
})
