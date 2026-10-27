/**
 * Canario: el GRANT de anon sobre historical_rounds cubre lo que la app lee sin sesión, y nunca `notes`.
 *
 * anon tiene SELECT por columna (migración 20261025000000). Si alguien agrega una columna a la tarjeta
 * pública o a su preview sin agregarla al GRANT, la tarjeta sin cuenta falla con 42501 en prod; si
 * alguien mete `notes` en el GRANT, las notas privadas vuelven a leerse con la anon key. Este canario lo
 * ve en el CI; el de prod (src/__tests__/prod/historical-rounds-anon-columnas.test.ts) lo ve en la base,
 * pero se saltea sin credenciales E2E, así que acá está el único guardián de cada PR.
 *
 * Los patrones salen de los primitivos canónicos de helpers/migration-sql (los mismos que usa
 * canary-column-select): así ve las tres formas en que el GRANT se reabriría sin que nadie lo note —
 * el identificador entre comillas que escribe el generador de DDL (`public."historical_rounds"`, como el
 * baseline y el próximo squash), `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon` (ese patrón ya
 * existe en el repo) y `GRANT ALL`. Y lee el SQL sin comentarios: un header que documente un GRANT no es
 * un GRANT.
 */
import { describe, it, expect } from 'vitest'
import {
  CLIENT_ROLES,
  migrationFiles,
  readMigration,
  sqlAllInSchemaPublic,
  sqlIdentifier,
  stripSqlComments,
} from './helpers/migration-sql'
import { COLUMNAS_PUBLICAS } from '@/lib/data/tarjeta-guardada'
import { COLUMNAS_OG } from '@/lib/data/tarjeta-og'

const TABLA = 'historical_rounds'
const OBJETO = String.raw`(?:${sqlIdentifier(TABLA)}|${sqlAllInSchemaPublic('tables')})`
const ROL_CLIENTE = new RegExp(String.raw`\b(?:${CLIENT_ROLES.join('|')})\b`, 'i')
/** GRANT/REVOKE ... ON [TABLE] <tabla|ALL TABLES IN SCHEMA public> TO|FROM <roles> */
const CAMBIO = new RegExp(String.raw`\b(grant|revoke)\s+([\s\S]*?)\s+on\s+(?:table\s+)?${OBJETO}\s+(?:to|from)\s+([^;]*)`, 'gi')

const columnas = (lista: string): string[] => lista.split(',').map(c => c.trim().replace(/"/g, '')).filter(Boolean)

/**
 * Los cambios al SELECT de un rol de cliente sobre la tabla, en orden de aparición. `columnas: null` es
 * SELECT (o ALL) de tabla: el que devuelve `notes`. El privilegio se lee de la lista entre GRANT y ON,
 * así que `GRANT SELECT, UPDATE (x)`, `GRANT ALL (col)` y `GRANT UPDATE (x), SELECT (col)` entran.
 */
type Cambio = { tipo: 'grant' | 'revoke'; columnas: string[] | null }
export function cambiosSelect(sql: string): Cambio[] {
  const out: Cambio[] = []
  for (const [, verbo, privilegios, roles] of stripSqlComments(sql).matchAll(CAMBIO)) {
    if (!ROL_CLIENTE.test(roles)) continue
    for (const [, privilegio, cols] of privilegios.matchAll(/(\w+)(?:\s+privileges)?\s*(?:\(([^)]*)\))?/gi)) {
      if (!['select', 'all'].includes(privilegio.toLowerCase())) continue
      out.push({ tipo: verbo.toLowerCase() as Cambio['tipo'], columnas: cols === undefined ? null : columnas(cols) })
    }
  }
  return out
}

const migraciones = migrationFiles().sort()

/** La última migración que define el GRANT por columna, con sus columnas. */
function grantVigente(): { archivo: string; columnas: string[] } | null {
  for (const archivo of [...migraciones].reverse()) {
    const porColumna = cambiosSelect(readMigration(archivo)).filter(c => c.tipo === 'grant' && c.columnas)
    if (porColumna.length) return { archivo, columnas: porColumna.flatMap(c => c.columnas as string[]) }
  }
  return null
}

describe('canary — historical_rounds: columnas que anon puede leer', () => {
  const vigente = grantVigente()
  const grant = vigente?.columnas ?? []

  it('hay un GRANT por columna a un rol de cliente', () => {
    expect(grant.length).toBeGreaterThan(0)
  })

  it('ninguna migración posterior cambia el SELECT de los roles de cliente', () => {
    const posteriores = migraciones.filter(f => vigente && f > vigente.archivo)
    expect(posteriores.filter(f => cambiosSelect(readMigration(f)).length)).toEqual([])
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

  it('ve las formas que reabrirían el SELECT de tabla (guarda del detector)', () => {
    const deTabla = { tipo: 'grant', columnas: null }
    // Con comillas y calificada: como la escribe el generador de DDL (y el baseline).
    expect(cambiosSelect('grant select on table public."historical_rounds" to anon;')).toEqual([deTabla])
    expect(cambiosSelect('GRANT SELECT ON "public"."historical_rounds" TO anon;')).toEqual([deTabla])
    // ALL TABLES IN SCHEMA public: ya existe ese patrón en el repo.
    expect(cambiosSelect('GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;')).toEqual([deTabla])
    expect(cambiosSelect('GRANT ALL ON ALL TABLES IN SCHEMA "public" TO authenticated;')).toEqual([deTabla])
    // ALL y listas de privilegios mezcladas.
    expect(cambiosSelect('GRANT ALL PRIVILEGES ON TABLE historical_rounds TO anon;')).toEqual([deTabla])
    expect(cambiosSelect('GRANT SELECT, UPDATE (notes) ON public.historical_rounds TO anon;')).toEqual([deTabla])
    expect(cambiosSelect('GRANT UPDATE (notes), SELECT (id, notes) ON historical_rounds TO anon;'))
      .toEqual([{ tipo: 'grant', columnas: ['id', 'notes'] }])
    // Un REVOKE también es un cambio al SELECT de anon.
    expect(cambiosSelect('REVOKE SELECT ON TABLE public.historical_rounds FROM anon;')).toEqual([{ tipo: 'revoke', columnas: null }])
    // No entran: comentarios, otra tabla, otro rol, otro privilegio, otro esquema.
    expect(cambiosSelect('-- GRANT SELECT (id, notes) ON TABLE public.historical_rounds TO anon;')).toEqual([])
    expect(cambiosSelect('/* GRANT SELECT ON public.historical_rounds TO anon; */')).toEqual([])
    expect(cambiosSelect('GRANT SELECT ON public.historical_rounds_v2 TO anon;')).toEqual([])
    expect(cambiosSelect('GRANT SELECT ON public.historical_rounds TO service_role;')).toEqual([])
    expect(cambiosSelect('GRANT UPDATE (notes) ON public.historical_rounds TO anon;')).toEqual([])
    expect(cambiosSelect('GRANT SELECT ON ALL TABLES IN SCHEMA public_v2 TO anon;')).toEqual([])
  })
})
