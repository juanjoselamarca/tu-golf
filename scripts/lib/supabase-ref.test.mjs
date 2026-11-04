import { describe, expect, it } from 'vitest'
import { PROD_REF, prodSupabaseVars } from './supabase-ref.mjs'

describe('prodSupabaseVars', () => {
  it('lists every Supabase var that points to prod', () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      SUPABASE_URL: 'http://127.0.0.1:54321',
      EVENTO_SUPABASE_URL: `https://${PROD_REF}.supabase.co/rest/v1`,
    }
    expect(prodSupabaseVars(env)).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'EVENTO_SUPABASE_URL'])
  })

  it('accepts the local Supabase, the test project and empty values', () => {
    expect(prodSupabaseVars({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EVENTO_SUPABASE_URL: '' })).toEqual([])
  })
})
