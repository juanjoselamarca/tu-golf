import { describe, expect, it } from 'vitest'
import { devEnv } from './local-db.mjs'
import { SUPABASE_CREDENTIAL_VARS, prodSupabaseVars } from './lib/supabase-ref.mjs'

const status = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'service' }

describe('devEnv', () => {
  it('sets every Supabase credential var, so none falls through to .env.local', () => {
    const env = devEnv(status, 'pw')
    for (const name of SUPABASE_CREDENTIAL_VARS) expect(env).toHaveProperty(name)
    expect(prodSupabaseVars(env)).toEqual([])
  })

  it('points the app at the local Supabase and blanks the rest', () => {
    const env = devEnv(status, 'pw')
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(status.API_URL)
    expect(env.SUPABASE_URL).toBe(status.API_URL)
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service')
    expect(env.SUPABASE_ACCESS_TOKEN).toBe('')
    expect(env.TEST_E2E_USER_PASSWORD).toBe('pw')
  })
})
