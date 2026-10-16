// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { usuariosEfimerosABarrer } from '../../e2e/helpers/sweep-e2e-leftovers'
import { EMAIL_EFIMERO, emailEfimero } from '../../e2e/helpers/ronda-fixture'

const CUTOFF = '2026-10-16T05:00:00.000Z'
const VIEJO = '2026-10-09T11:10:58.31473Z'

function u(email: string | null, created_at = VIEJO) {
  return { id: `id:${email}`, email, created_at }
}

describe('barrido de usuarios efímeros de test', () => {
  it('reconoce el correo que arma emailEfimero (el de createEphemeralUser), con cualquier prefijo', () => {
    for (const prefijo of ['canary-import', 'rls-p0', 'e2e-org-anotar', 'gwi-rival']) {
      for (let i = 0; i < 200; i++) {
        const email = emailEfimero(prefijo)
        expect(EMAIL_EFIMERO.test(email), email).toBe(true)
      }
    }
  })

  it('un prefijo que el barrido no reconocería se rechaza al crear', () => {
    for (const malo of ['rls_p0', 'Canary', 'a b', '', '-x', 'x-']) {
      expect(() => emailEfimero(malo), malo).toThrow(/Prefijo de usuario efímero inválido/)
    }
  })

  it('barre los efímeros viejos (los que quedaron en prod)', () => {
    const ids = usuariosEfimerosABarrer([
      u('canary-import-1791544258036-khdy@golfersplus-test.local'),
      u('rls-p0-1791544258036-a1b2c3@golfersplus-test.local'),
      u('canary-default-tee-1788000000000-zz9@golfersplus-test.local'),
    ], CUTOFF)
    expect(ids).toHaveLength(3)
  })

  it('nunca toca cuentas fijas de test, correos reales ni otros dominios', () => {
    const ids = usuariosEfimerosABarrer([
      u('e2e-test@golfersplus-test.local'),
      u('smoke-18h@golfersplus-test.local'),
      u('test-paywall@golfersplus-test.local'),
      u('rls-test-ab12cd34@example.invalid'),
      u('juan-1791544258036-abcdef@gmail.com'),
      u('canary-import-1791544258036-khdy@golfersplus-test.local.cl'),
      u('canary-import-1791544258036-khdy@golfersplus-test.localx'),
      u('x@canary-import-1791544258036-khdy@golfersplus-test.local'),
      u(null),
    ], CUTOFF)
    expect(ids).toEqual([])
  })

  it('no toca un efímero creado después del corte (corrida en curso)', () => {
    const ids = usuariosEfimerosABarrer([
      u('canary-import-1791544258036-khdy@golfersplus-test.local', '2026-10-16T05:30:00.000Z'),
      u('canary-import-1791544258036-khdy@golfersplus-test.local', '2026-10-16T04:59:00+00:00'),
    ], CUTOFF)
    expect(ids).toHaveLength(1)
  })
})
