import { describe, expect, it } from 'vitest'
import { avisoSinAcceso, clasificarRespuestaScore, esSinAcceso } from './acceso-guardado'
import { buscarVoseo } from '../../../../../../scripts/lib/voseo.mjs'

const PROMESA_VACIA = /sincroniz|guardado localmente|reintent|anótalos de nuevo/i

describe('clasificarRespuestaScore — token roto ≠ tarjeta ajena', () => {
  it('403 guest_token_invalid y 403 guest_not_owner se leen distinto', () => {
    expect(clasificarRespuestaScore(403, 'guest_token_invalid')).toBe('invitado_token_invalido')
    expect(clasificarRespuestaScore(403, 'guest_not_owner')).toBe('invitado_no_dueno')
  })
})

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

describe('clasificarRespuestaScore — code de los 403 (PR #754 vuelta 2)', () => {
  it('retirado e invitado no dueño se distinguen del 403 genérico', () => {
    expect(clasificarRespuestaScore(403, 'player_withdrawn')).toBe('retirado')
    expect(clasificarRespuestaScore(403, 'guest_not_owner')).toBe('invitado_no_dueno')
    expect(clasificarRespuestaScore(403, 'otra_cosa')).toBe('sin_permiso')
    expect(esSinAcceso('retirado')).toBe(true)
    // No es final: el scorer reintenta sin headers de invitado.
    expect(esSinAcceso('invitado_no_dueno')).toBe(false)
  })
})

describe('avisoSinAcceso', () => {
  it('sin sesión: vuelve a esta tarjeta con el jugador elegido, y el título vale aunque nunca haya iniciado sesión', () => {
    const a = avisoSinAcceso({ slug: 'copa-abc', motivo: 'sin_sesion', jugadorId: 'p-1' })
    expect(a.href).toBe(`/login?next=${encodeURIComponent('/torneo/copa-abc/score?jugador=p-1')}`)
    expect(a.titulo).toBe('Inicia sesión para guardar')
    expect(a.titulo).not.toMatch(/se cerró|venció/i)
    expect(a.detalle).toMatch(/quedaron en este teléfono/)
  })

  it('sin permiso: no habla de la sesión y manda al torneo', () => {
    const a = avisoSinAcceso({ slug: 'copa-abc', motivo: 'sin_permiso' })
    expect(a.href).toBe('/torneo/copa-abc')
    expect(a.titulo).not.toMatch(/sesión/i)
    expect(a.detalle).toMatch(/Cambiar jugador|organizador/)
  })

  it('retirado: copy propio, sin invitar a reinscribirse', () => {
    const a = avisoSinAcceso({ slug: 'copa-abc', motivo: 'retirado' })
    expect(a.titulo).toMatch(/retirado/i)
    expect(a.href).toBe('/torneo/copa-abc')
    expect(`${a.cta} ${a.detalle}`).not.toMatch(/inscrib/i)
  })

  it('invitado sin acceso: nunca a /unirse (crearía un jugador duplicado), sí al organizador', () => {
    const a = avisoSinAcceso({ slug: 'copa-abc', motivo: 'invitado_sin_acceso' })
    expect(a.href).toBe('/torneo/copa-abc')
    expect(a.detalle).toMatch(/organizador/)
    expect(a.detalle).not.toMatch(/ él\b/)
  })

  it('ningún aviso promete sincronizar ni pide anotar de nuevo (los golpes siguen en el teléfono)', () => {
    for (const motivo of ['sin_sesion', 'sin_permiso', 'retirado', 'invitado_sin_acceso'] as const) {
      const a = avisoSinAcceso({ slug: 'x', motivo })
      expect(`${a.titulo} ${a.detalle} ${a.cta}`).not.toMatch(PROMESA_VACIA)
      expect(a.detalle).toMatch(/en este teléfono, no en el torneo/)
      expect(a.href).not.toMatch(/unirse/)
      expect(buscarVoseo(`${a.titulo} ${a.detalle} ${a.cta}`)).toEqual([])
    }
  })
})
