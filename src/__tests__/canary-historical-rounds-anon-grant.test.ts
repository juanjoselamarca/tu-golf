/**
 * Canario: el GRANT de anon sobre historical_rounds cubre lo que la app lee sin sesión, y nunca `notes`.
 *
 * anon tiene SELECT por columna (migración 20261025000000). Si alguien agrega una columna a la tarjeta
 * pública o a su preview sin agregarla al GRANT, la tarjeta sin cuenta falla con 42501 en prod; si
 * alguien mete `notes` en el GRANT, las notas privadas vuelven a leerse con la anon key. Este canario lo
 * ve en el CI; el de prod (src/__tests__/prod/historical-rounds-anon-columnas.test.ts) lo ve en la base.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COLUMNAS_PUBLICAS } from '@/lib/data/tarjeta-guardada'
import { COLUMNAS_OG } from '@/lib/data/tarjeta-og'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
const GRANT_ANON = /GRANT SELECT \(([^)]*)\) ON TABLE public\.historical_rounds TO anon/i

function columnas(lista: string): string[] {
  return lista.split(',').map(c => c.trim().replace(/"/g, '')).filter(Boolean)
}

/** Cualquier otro cambio al SELECT de anon sobre la tabla (devolverle la tabla entera, revocarle columnas). */
const OTRO_CAMBIO_ANON = /(GRANT|REVOKE)\s+SELECT\b[^;]*\bON\s+(TABLE\s+)?public\.historical_rounds\b[^;]*\b(TO|FROM)\s+[^;]*\banon\b/i

const migraciones = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()

/** El GRANT por columna a anon de la migración más reciente que lo define. */
function grantVigente(): { archivo: string; columnas: string[] } | null {
  for (const archivo of [...migraciones].reverse()) {
    const m = readFileSync(join(MIGRATIONS_DIR, archivo), 'utf8').match(GRANT_ANON)
    if (m) return { archivo, columnas: columnas(m[1]) }
  }
  return null
}

describe('canary — historical_rounds: columnas que anon puede leer', () => {
  const vigente = grantVigente()
  const grant = vigente?.columnas ?? []

  it('hay un GRANT por columna a anon', () => {
    expect(grant.length).toBeGreaterThan(0)
  })

  it('ninguna migración posterior cambia el SELECT de anon por fuera de ese GRANT', () => {
    const posteriores = migraciones.filter(f => vigente && f > vigente.archivo)
    const conCambios = posteriores.filter(f => OTRO_CAMBIO_ANON.test(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
    expect(conCambios).toEqual([])
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
