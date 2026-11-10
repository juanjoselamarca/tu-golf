import { describe, expect, it } from 'vitest'
import { localSql } from './local-sql.mjs'
import { PROD_REF } from './supabase-ref.mjs'

describe('localSql', () => {
  it('refuses a remote database', async () => {
    await expect(localSql(`postgresql://postgres:x@db.${PROD_REF}.supabase.co:5432/postgres`, 'select 1')).rejects.toThrow('only a local database')
  })

  it('refuses a loopback URL whose query params point the host elsewhere', async () => {
    await expect(localSql(`postgresql://postgres:x@127.0.0.1:54322/postgres?host=db.${PROD_REF}.supabase.co`, 'select 1')).rejects.toThrow('only a local database')
  })
})
