/**
 * SQL against the Postgres of a local `supabase start`, straight through `pg`. Same contract as `sqlEn`: several
 * statements run in ONE implicit transaction and it returns the rows of the last one. Only loopback hosts: a remote
 * project goes through `sqlEn` and its guards.
 */
import pg from 'pg'
import { esLoopback } from './supabase-ref.mjs'

export async function localSql(dbUrl, query) {
  // Query params are refused: pg lets `?host=` override the host that esLoopback checked.
  if (!esLoopback(dbUrl) || new URL(dbUrl).search) throw new Error('localSql: only a local database (localhost or 127.0.0.1, no query params) is allowed')
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const result = await client.query(query)
    return (Array.isArray(result) ? result.at(-1) : result).rows
  } finally {
    await client.end()
  }
}
