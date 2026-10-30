/**
 * Canario: el GRANT de anon sobre historical_rounds cubre lo que la app lee sin sesión, y nunca `notes`.
 *
 * anon tiene SELECT por columna (migración 20261025000000). Si alguien agrega una columna a la tarjeta
 * pública o a su preview sin agregarla al GRANT, la tarjeta sin cuenta falla con 42501 en prod; si
 * alguien mete `notes` en el GRANT, las notas privadas vuelven a leerse con la anon key.
 *
 * Fuente única de "qué puede leer anon": ANON_COLUMNS (helpers/migration-sql). Quién la valida contra el
 * esquema real es canary-anon-columns, que compara ANON_COLUMNS con los GRANT de supabase/schema.sql tabla
 * por tabla: agregar, quitar o reabrir una columna allá rompe ese canario. Acá sólo va lo que ese canario no
 * puede saber — que la lista alcance para los dos únicos caminos sin sesión (tarjeta-guardada.ts y
 * tarjeta-og.ts) y que `notes` no esté. El canario de prod (src/__tests__/prod/historical-rounds-anon-columnas.test.ts)
 * lo mira en la base, pero se saltea sin credenciales E2E.
 */
import { describe, it, expect } from 'vitest'
import { ANON_COLUMNS } from './helpers/migration-sql'
import { COLUMNAS_PUBLICAS } from '@/lib/data/tarjeta-guardada'
import { COLUMNAS_OG } from '@/lib/data/tarjeta-og'

const columnas = (lista: string): string[] => lista.split(',').map(c => c.trim().replace(/"/g, '')).filter(Boolean)

describe('canary — historical_rounds: columnas que anon puede leer', () => {
  const grant = ANON_COLUMNS.historical_rounds

  it('está declarada en la fuente canónica', () => {
    expect(grant?.length).toBeGreaterThan(0)
  })

  it.each([
    ['la tarjeta pública (tarjeta-guardada.ts)', COLUMNAS_PUBLICAS],
    ['el preview de WhatsApp (tarjeta-og.ts)', COLUMNAS_OG],
  ])('cubre todo lo que lee %s', (_camino, lista) => {
    expect(columnas(lista).filter(c => !grant.includes(c))).toEqual([])
  })

  it('no incluye las notas privadas', () => {
    expect(grant).not.toContain('notes')
  })
})
