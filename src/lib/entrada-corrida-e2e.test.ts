import { describe, expect, it } from 'vitest'
import { validarEntradaCorrida } from './entrada-corrida-e2e'

describe('validarEntradaCorrida', () => {
  it('sin body usa prod y main (lo que manda el panel /admin/e2e)', () => {
    expect(validarEntradaCorrida({})).toEqual({ ok: true, baseUrl: 'https://golfersplus.vercel.app', branch: 'main' })
    expect(validarEntradaCorrida(null)).toEqual({ ok: true, baseUrl: 'https://golfersplus.vercel.app', branch: 'main' })
  })

  it('acepta prod explícito, con o sin barra final', () => {
    expect(validarEntradaCorrida({ base_url: 'https://golfersplus.vercel.app/' })).toMatchObject({ ok: true, baseUrl: 'https://golfersplus.vercel.app' })
  })

  it('rechaza un host ajeno: las credenciales E2E no salen del dominio', () => {
    expect(validarEntradaCorrida({ base_url: 'https://atacante.example' })).toEqual({ ok: false, error: 'base_url no permitido' })
    expect(validarEntradaCorrida({ base_url: 'https://golfersplus.vercel.app.atacante.example' }).ok).toBe(false)
    expect(validarEntradaCorrida({ base_url: 'http://golfersplus.vercel.app' }).ok).toBe(false)
    expect(validarEntradaCorrida({ base_url: 'https://user@atacante.example' }).ok).toBe(false)
  })

  it('rechaza base_url que no es string o no es URL', () => {
    expect(validarEntradaCorrida({ base_url: 42 }).ok).toBe(false)
    expect(validarEntradaCorrida({ base_url: 'no es url' }).ok).toBe(false)
  })

  it('acepta ramas normales y rechaza las raras', () => {
    expect(validarEntradaCorrida({ branch: 'fix/ceo-algo-claude' })).toMatchObject({ ok: true, branch: 'fix/ceo-algo-claude' })
    for (const branch of ['-x', '../main', 'a..b', 'feat..x', 'feat/', 'con espacio', 'a/', '', 7, 'x'.repeat(101)]) {
      expect(validarEntradaCorrida({ branch }).ok, String(branch)).toBe(false)
    }
  })
})
