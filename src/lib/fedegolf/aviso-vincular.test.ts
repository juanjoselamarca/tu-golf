import { describe, it, expect } from 'vitest'
import {
  AVISO_VINCULAR_FEDEGOLF_VISTO,
  avisoVincularVistoEnDispositivo,
  avisoVincularYaVisto,
  debeMostrarAvisoVincular,
  recordarAvisoVincularVisto,
} from './aviso-vincular'
import { esRutaDeAvisoDeApertura } from '@/lib/rutas'

const base = { yaVisto: false, tieneVinculo: false, enRonda: false }

describe('debeMostrarAvisoVincular', () => {
  it('se muestra solo sin vínculo, sin ronda en curso y sin haberlo visto', () => {
    expect(debeMostrarAvisoVincular(base)).toBe(true)
  })

  it.each([
    ['ya visto', { ...base, yaVisto: true }],
    ['con FedeGolf vinculado (o por reconectar)', { ...base, tieneVinculo: true }],
    ['en una ronda en curso', { ...base, enRonda: true }],
    ['sin saber si está vinculado', { ...base, tieneVinculo: null }],
    ['sin saber si está en ronda', { ...base, enRonda: null }],
  ])('no se muestra %s', (_, s) => {
    expect(debeMostrarAvisoVincular(s)).toBe(false)
  })
})

describe('marca de «ya visto»', () => {
  it('se lee del user_metadata de la sesión', () => {
    expect(avisoVincularYaVisto({ user_metadata: { [AVISO_VINCULAR_FEDEGOLF_VISTO]: '2026-11-27T12:00:00Z' } })).toBe(true)
    expect(avisoVincularYaVisto({ user_metadata: {} })).toBe(false)
    expect(avisoVincularYaVisto(null)).toBe(false)
  })

  it('se recuerda por usuario en el dispositivo', () => {
    const m = new Map<string, string>()
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } as unknown as Storage
    recordarAvisoVincularVisto('u1', s)
    expect(avisoVincularVistoEnDispositivo('u1', s)).toBe(true)
    expect(avisoVincularVistoEnDispositivo('u2', s)).toBe(false)
  })
})

describe('esRutaDeAvisoDeApertura', () => {
  it.each(['/', '/dashboard', '/dashboard/', '/ranking', '/indices'])('sí en %s', (r) => {
    expect(esRutaDeAvisoDeApertura(r)).toBe(true)
  })

  it.each([
    '/ronda-libre/ABC', '/ronda-libre/ABC/score', '/ronda-libre/ABC/score-grupo', '/ronda-libre/nueva',
    '/torneo/copa', '/torneo/copa/score', '/torneo/copa/en-vivo', '/torneo/copa/tv',
    '/organizador/copa/scoring', '/en-vivo', '/perfil', '/login', '/algo-nuevo', null, undefined, '',
  ])('nunca en %s', (r) => {
    expect(esRutaDeAvisoDeApertura(r)).toBe(false)
  })
})
