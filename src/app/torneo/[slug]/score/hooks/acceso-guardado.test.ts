import { describe, it, expect } from 'vitest'
import { avisoSinAcceso, clasificarRespuestaScore } from './acceso-guardado'

describe('clasificarRespuestaScore — la respuesta de /api/game leída por el scorer del torneo', () => {
  it('2xx guarda; 409 distingue tarjeta cerrada de torneo inactivo', () => {
    expect(clasificarRespuestaScore(200)).toBe('ok')
    expect(clasificarRespuestaScore(409, 'round_closed')).toBe('closed')
    expect(clasificarRespuestaScore(409, 'tournament_inactive')).toBe('inactive')
    expect(clasificarRespuestaScore(409)).toBe('inactive')
  })

  // Hunter 09-nov-2026 (prod): sin sesión, cada golpe daba 3 × 401 y la pantalla prometía
  // "se sincronizará al recuperar la conexión". Un 401/403 no se reintenta ni se encola.
  it('401 (sin sesión) y 403 (invitado inválido o retirado) son "sin_acceso", nunca un reintento', () => {
    expect(clasificarRespuestaScore(401)).toBe('sin_acceso')
    expect(clasificarRespuestaScore(403)).toBe('sin_acceso')
  })

  it('5xx y respuestas raras siguen siendo transitorias: se reintenta y se encola', () => {
    expect(clasificarRespuestaScore(500)).toBe('reintentar')
    expect(clasificarRespuestaScore(502)).toBe('reintentar')
    expect(clasificarRespuestaScore(429)).toBe('reintentar')
  })
})

describe('avisoSinAcceso — lo que lee el jugador cuando el servidor no lo reconoce', () => {
  it('con cuenta: sesión cerrada, dice que NO se guardó y manda a iniciar sesión volviendo a esta tarjeta', () => {
    const aviso = avisoSinAcceso({ esInvitado: false, slug: 'copa-abc' })
    expect(aviso.titulo).toBe('Tu sesión se cerró')
    expect(aviso.detalle).toMatch(/no se guardaron/)
    expect(aviso.href).toBe(`/login?next=${encodeURIComponent('/torneo/copa-abc/score')}`)
  })

  it('invitado: token inválido, dice que NO se guardó y manda al link de inscripción del torneo', () => {
    const aviso = avisoSinAcceso({ esInvitado: true, slug: 'copa-abc' })
    expect(aviso.detalle).toMatch(/no se guardaron/)
    expect(aviso.href).toBe('/torneo/copa-abc/unirse')
  })

  it('ninguno de los dos promete que "se sincronizará"', () => {
    for (const esInvitado of [true, false]) {
      const { titulo, detalle, cta } = avisoSinAcceso({ esInvitado, slug: 's' })
      expect(`${titulo} ${detalle} ${cta}`).not.toMatch(/sincroniz|guardado localmente|reintent/i)
    }
  })
})
