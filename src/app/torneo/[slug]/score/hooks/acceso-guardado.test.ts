import { describe, expect, it } from 'vitest'
import { avisoSinAcceso, clasificarRespuestaScore, esSinAcceso } from './acceso-guardado'

const PROMESA_VACIA = /sincroniz|guardado localmente|reintent|anótalos de nuevo/i

describe('clasificarRespuestaScore (scorer del torneo)', () => {
  it('2xx es ok', () => {
    expect(clasificarRespuestaScore(200)).toBe('ok')
    expect(clasificarRespuestaScore(201)).toBe('ok')
  })

  it('409 distingue ronda cerrada de torneo inactivo', () => {
    expect(clasificarRespuestaScore(409, 'round_closed')).toBe('closed')
    expect(clasificarRespuestaScore(409, 'tournament_inactive')).toBe('inactive')
    expect(clasificarRespuestaScore(409)).toBe('inactive')
  })

  it('401 es sin sesión y 403 sin permiso: ninguno se reintenta', () => {
    expect(clasificarRespuestaScore(401)).toBe('sin_sesion')
    expect(clasificarRespuestaScore(403)).toBe('sin_permiso')
    expect(esSinAcceso(clasificarRespuestaScore(401))).toBe(true)
    expect(esSinAcceso(clasificarRespuestaScore(403))).toBe(true)
  })

  it('red, 5xx y 429 siguen siendo transitorios (cola local)', () => {
    for (const s of [500, 502, 503, 429, 0]) expect(clasificarRespuestaScore(s)).toBe('reintentar')
    expect(esSinAcceso('reintentar')).toBe(false)
    expect(esSinAcceso('ok')).toBe(false)
  })
})

describe('avisoSinAcceso', () => {
  it('con cuenta y sin sesión: vuelve a esta misma tarjeta tras el login', () => {
    const a = avisoSinAcceso({ esInvitado: false, slug: 'copa-abc', motivo: 'sin_sesion' })
    expect(a.href).toBe(`/login?next=${encodeURIComponent('/torneo/copa-abc/score')}`)
    expect(a.titulo).toMatch(/sesión/i)
    expect(a.detalle).toMatch(/quedaron en este teléfono/)
  })

  it('con cuenta y sin permiso: no habla de la sesión y manda al torneo', () => {
    const a = avisoSinAcceso({ esInvitado: false, slug: 'copa-abc', motivo: 'sin_permiso' })
    expect(a.href).toBe('/torneo/copa-abc')
    expect(a.titulo).not.toMatch(/sesión/i)
    expect(a.detalle).toMatch(/Cambiar jugador|organizador/)
  })

  it('invitado: vuelve a la inscripción, con cualquier motivo', () => {
    for (const motivo of ['sin_sesion', 'sin_permiso'] as const) {
      const a = avisoSinAcceso({ esInvitado: true, slug: 'copa-abc', motivo })
      expect(a.href).toBe('/torneo/copa-abc/unirse')
      expect(a.detalle).toMatch(/organizador/)
    }
  })

  it('ningún aviso promete sincronizar ni pide anotar de nuevo (los golpes siguen en el teléfono)', () => {
    const avisos = [
      avisoSinAcceso({ esInvitado: false, slug: 'x', motivo: 'sin_sesion' }),
      avisoSinAcceso({ esInvitado: false, slug: 'x', motivo: 'sin_permiso' }),
      avisoSinAcceso({ esInvitado: true, slug: 'x', motivo: 'sin_sesion' }),
    ]
    for (const a of avisos) {
      expect(`${a.titulo} ${a.detalle} ${a.cta}`).not.toMatch(PROMESA_VACIA)
      expect(a.detalle).toMatch(/en este teléfono, no en el torneo/)
      expect(a.detalle).not.toMatch(/\b(anotá|ingresá|vos)\b/i)
    }
  })
})
