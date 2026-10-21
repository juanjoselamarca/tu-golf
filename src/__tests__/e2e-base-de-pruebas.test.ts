// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { exigirBaseDePruebas } from '../../e2e/helpers/base-de-pruebas'
import { PROD_REF } from '../../scripts/lib/supabase-ref.mjs'

const LOCAL = 'http://localhost:3000'
const PRUEBAS = 'https://abcdefghijklmnopqrst.supabase.co'

describe('exigirBaseDePruebas', () => {
  it('deja pasar la app local con la base de pruebas o un Supabase local', () => {
    expect(() => exigirBaseDePruebas([LOCAL, LOCAL], PRUEBAS)).not.toThrow()
    expect(() => exigirBaseDePruebas(['http://127.0.0.1:3000'], 'http://127.0.0.1:54321')).not.toThrow()
  })

  it.each([
    ['prod', `https://${PROD_REF}.supabase.co`],
    ['prod con salto de línea', `https://${PROD_REF}.supabase.co\n`],
    ['sin variable', undefined],
    ['dominio propio', 'https://db.golfersplus.cl'],
  ])('corta con Supabase %s', (_caso, url) => {
    expect(() => exigirBaseDePruebas([LOCAL], url)).toThrow(/no es la base de pruebas/)
  })

  it.each([
    ['el deploy de prod', ['https://golfersplus.vercel.app']],
    ['un proyecto con baseURL remota', [LOCAL, 'https://golfersplus.vercel.app']],
    ['un proyecto sin baseURL', [LOCAL, undefined]],
    ['sin proyectos', []],
  ])('corta con %s', (_caso, baseURLs) => {
    expect(() => exigirBaseDePruebas(baseURLs, PRUEBAS)).toThrow(/la app tiene que ser la local/)
  })
})
