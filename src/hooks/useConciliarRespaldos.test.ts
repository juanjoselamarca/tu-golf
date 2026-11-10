/**
 * El banner "Sincronizando N hoyos…" quedaba para siempre cuando la ronda se borró (o se cerró)
 * sin que el jugador estuviera en su scorer: nadie limpiaba el respaldo (PR #763, revisión 1).
 * El conciliador pregunta al servidor por cada ronda con respaldo pendiente y limpia SOLO con
 * respuesta firme: no existe (PGRST116) o finalizada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

type Resp = { data: unknown; error: unknown }
const { respuestas, consultas } = vi.hoisted(() => ({
  respuestas: new Map<string, Resp | 'lanza'>(),
  consultas: [] as string[],
}))
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, codigo: string) => ({
          single: async () => {
            consultas.push(codigo)
            const r = respuestas.get(codigo)
            if (r === 'lanza') throw new TypeError('Failed to fetch')
            return r ?? { data: { estado: 'en_curso' }, error: null }
          },
        }),
      }),
    }),
  }),
}))

import { conciliarRespaldos, useConciliarRespaldos } from './useConciliarRespaldos'

const respaldo = (codigo: string, jugador: string, sincronizado = false) => localStorage.setItem(
  `golfers_score_${codigo}_${jugador}`,
  JSON.stringify({ scores: { 1: 4 }, timestamp: Date.now(), sincronizado, codigoRonda: codigo, jugadorId: jugador }),
)
const hay = (k: string) => localStorage.getItem(k) != null

let online = true
beforeEach(() => {
  localStorage.clear(); respuestas.clear(); consultas.length = 0; online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => vi.restoreAllMocks())

describe('conciliarRespaldos', () => {
  it('ronda borrada (PGRST116): limpia TODA su copia local, de los dos scorers', async () => {
    respaldo('ABC123', 'p1'); respaldo('ABC123', 'p2')
    localStorage.setItem('ronda_ABC123_p1', '{"1":4}')
    localStorage.setItem('ronda_grupo_ABC123', '{}')
    localStorage.setItem('ronda_grupo_pendientes_ABC123', '{}')
    respuestas.set('ABC123', { data: null, error: { code: 'PGRST116', message: '0 rows' } })
    expect(await conciliarRespaldos()).toEqual(['ABC123'])
    for (const k of ['golfers_score_ABC123_p1', 'golfers_score_ABC123_p2', 'ronda_ABC123_p1', 'ronda_grupo_ABC123', 'ronda_grupo_pendientes_ABC123']) {
      expect(hay(k)).toBe(false)
    }
  })

  it('ronda finalizada: el servidor ya no acepta esos golpes, también limpia', async () => {
    respaldo('FIN999', 'p1')
    respuestas.set('FIN999', { data: { estado: 'finalizada' }, error: null })
    expect(await conciliarRespaldos()).toEqual(['FIN999'])
    expect(hay('golfers_score_FIN999_p1')).toBe(false)
  })

  it('una sola consulta por código aunque tenga varios jugadores', async () => {
    respaldo('ABC123', 'p1'); respaldo('ABC123', 'p2'); respaldo('XYZ789', 'p1')
    await conciliarRespaldos()
    expect(consultas.sort()).toEqual(['ABC123', 'XYZ789'])
  })

  it('inverso: ronda en curso, error de red, error distinto de PGRST116 o sesión vencida: no toca nada', async () => {
    respaldo('VIVA01', 'p1'); respaldo('REDCAE', 'p1'); respaldo('ERR500', 'p1'); respaldo('JWTVEN', 'p1'); respaldo('PERMIS', 'p1')
    respuestas.set('REDCAE', 'lanza')
    respuestas.set('ERR500', { data: null, error: { code: '', message: 'Failed to fetch' } })
    respuestas.set('JWTVEN', { data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
    respuestas.set('PERMIS', { data: null, error: { code: '42501', message: 'permission denied' } })
    expect(await conciliarRespaldos()).toEqual([])
    for (const c of ['VIVA01', 'REDCAE', 'ERR500', 'JWTVEN', 'PERMIS']) expect(hay(`golfers_score_${c}_p1`)).toBe(true)
  })

  it('inverso: sin conexión no consulta ni limpia', async () => {
    online = false
    respaldo('ABC123', 'p1')
    respuestas.set('ABC123', { data: null, error: { code: 'PGRST116', message: '0 rows' } })
    expect(await conciliarRespaldos()).toEqual([])
    expect(consultas).toEqual([])
    expect(hay('golfers_score_ABC123_p1')).toBe(true)
  })

  it('no consulta respaldos ya sincronizados ni los de torneo (slug en minúsculas)', async () => {
    respaldo('ABC123', 'p1', true)
    respaldo('copa-leones-2026-k3j', 'round-1')
    expect(await conciliarRespaldos()).toEqual([])
    expect(consultas).toEqual([])
    expect(hay('golfers_score_copa-leones-2026-k3j_round-1')).toBe(true)
  })
})

describe('useConciliarRespaldos', () => {
  it('concilia al montar y al volver la conexión; no en cada render', async () => {
    respaldo('ABC123', 'p1')
    const onLimpio = vi.fn()
    const { rerender } = renderHook(() => useConciliarRespaldos(onLimpio))
    await waitFor(() => expect(consultas).toEqual(['ABC123']))
    rerender(); rerender()
    expect(consultas).toEqual(['ABC123'])
    respuestas.set('ABC123', { data: null, error: { code: 'PGRST116', message: '0 rows' } })
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(onLimpio).toHaveBeenCalledTimes(1))
    expect(consultas).toEqual(['ABC123', 'ABC123'])
    expect(hay('golfers_score_ABC123_p1')).toBe(false)
  })
})
