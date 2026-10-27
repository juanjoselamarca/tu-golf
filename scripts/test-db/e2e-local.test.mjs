// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildEsDeLaBase, clavesDeArchivosEnv, DIST_DIR, entornoAppLocal, marcarBuild, URL_LOCAL } from './e2e-local.mjs'
import { PROD_REF } from '../lib/supabase-ref.mjs'

const url = ref => `https://${ref}.supabase.co`
const PRUEBAS = 'qdrbjdfhqbotanocipxf'
const TEST = {
  TEST_SUPABASE_URL: url(PRUEBAS),
  TEST_SUPABASE_ANON_KEY: 'anon-pruebas',
  TEST_SUPABASE_SERVICE_ROLE_KEY: 'service-pruebas',
  TEST_E2E_USER_EMAIL: 'e2e-test@golfersplus-test.local',
  TEST_E2E_USER_PASSWORD: 'x',
}

describe('entornoAppLocal — la app de los E2E nunca apunta a prod', () => {
  it('pisa las variables de prod con las de la base de pruebas y saca las que tocan prod', () => {
    const env = entornoAppLocal({
      ...TEST,
      NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-prod',
      SUPABASE_SERVICE_ROLE_KEY: 'service-prod',
      E2E_TEST_USER_EMAIL: 'real@gmail.com',
      SUPABASE_ACCESS_TOKEN: 'sbp_x',
      EVENTO_SUPABASE_URL: url(PROD_REF),
      EVENTO_SUPABASE_KEY: 'service-prod',
    })
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(url(PRUEBAS))
    expect(env.SUPABASE_URL).toBe(url(PRUEBAS))
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-pruebas')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-pruebas')
    expect(env.E2E_TEST_USER_EMAIL).toBe('e2e-test@golfersplus-test.local')
    for (const k of ['SUPABASE_ACCESS_TOKEN', 'EVENTO_SUPABASE_URL', 'EVENTO_SUPABASE_KEY']) expect(env[k], k).toBeUndefined()
  })

  it('la app, Playwright y el crawler apuntan a localhost aunque el entorno traiga la URL de prod', () => {
    const prod = 'https://golfersplus.vercel.app'
    const env = entornoAppLocal({ ...TEST, NEXT_PUBLIC_SITE_URL: prod, PLAYWRIGHT_BASE_URL: prod, CRAWL_BASE_URL: prod })
    expect(env.NEXT_PUBLIC_SITE_URL).toBe(URL_LOCAL)
    expect(env.PLAYWRIGHT_BASE_URL).toBe(URL_LOCAL)
    expect(env.CRAWL_BASE_URL).toBe(URL_LOCAL)
  })

  it('rellena lo que el build exige y respeta lo que ya viene', () => {
    expect(entornoAppLocal(TEST).VAPID_PRIVATE_KEY).toBeTruthy()
    expect(entornoAppLocal({ ...TEST, ANTHROPIC_API_KEY: 'propia' }).ANTHROPIC_API_KEY).toBe('propia')
  })

  it('declara el paywall del build y el plan del usuario e2e (sin eso, el spec del chip Neto se salta)', () => {
    expect(entornoAppLocal(TEST)).toMatchObject({ E2E_PAYWALL_ENABLED: 'false', E2E_TEST_USER_TIER: 'free' })
    expect(entornoAppLocal({ ...TEST, NEXT_PUBLIC_PAYWALL_ENABLED: 'true' }).E2E_PAYWALL_ENABLED).toBe('true')
  })

  it('vacía lo que viene de los archivos .env para que Next no lo reviva, salvo lo que apunta a la base de pruebas', () => {
    const delArchivo = { ...TEST, NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF), E2E_TEST_USER_EMAIL: 'real@gmail.com', SUPABASE_ACCESS_TOKEN: 'sbp_x', TELEGRAM_BOT_TOKEN: 'bot-prod', ANTHROPIC_API_KEY: 'sk-prod' }
    const env = entornoAppLocal({ ...delArchivo, CI: 'true' }, Object.keys(delArchivo))
    expect(env).toMatchObject({ SUPABASE_ACCESS_TOKEN: '', TELEGRAM_BOT_TOKEN: '', TEST_SUPABASE_SERVICE_ROLE_KEY: '', ANTHROPIC_API_KEY: 'placeholder' })
    expect(env).toMatchObject({ NEXT_PUBLIC_SUPABASE_URL: url(PRUEBAS), E2E_TEST_USER_EMAIL: 'e2e-test@golfersplus-test.local', CI: 'true' })
  })

  it('lee los nombres de los .env que carga Next, no los de .env.example', () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-local-'))
    writeFileSync(join(dir, '.env.local'), 'TELEGRAM_BOT_TOKEN=x\n# comentario\nNEXT_PUBLIC_SUPABASE_URL="https://y.supabase.co"\n')
    writeFileSync(join(dir, '.env.example'), 'NO_SE_CARGA=1\n')
    expect(clavesDeArchivosEnv(dir).sort()).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'TELEGRAM_BOT_TOKEN'])
  })

  it('aborta si falta una variable de la base de pruebas (si no, los specs se saltearían en verde)', () => {
    const { TEST_E2E_USER_PASSWORD: _, ...sinClave } = TEST
    expect(() => entornoAppLocal(sinClave)).toThrow(/TEST_E2E_USER_PASSWORD/)
  })

  it('aborta si TEST_SUPABASE_URL es la de prod', () => {
    expect(() => entornoAppLocal({ ...TEST, TEST_SUPABASE_URL: url(PROD_REF), NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF) }))
      .toThrow(/apunta a prod/)
  })
})

describe('el build de e2e-local vive aparte del de prod', () => {
  afterEach(() => vi.unstubAllEnvs())

  const nextConfig = async (env) => {
    vi.stubEnv('NEXT_DIST_DIR', env.NEXT_DIST_DIR)
    vi.resetModules()
    return (await import('../../next.config.js')).default('phase-production-server', { defaultConfig: {} })
  }

  it('compila y sirve fuera de .next, que pisan npm run build y el pre-push', async () => {
    expect(DIST_DIR).not.toBe('.next')
    expect(await nextConfig(entornoAppLocal(TEST))).toMatchObject({ distDir: DIST_DIR, typescript: { tsconfigPath: 'tsconfig.e2e.json' } })
    expect(await nextConfig({})).toMatchObject({ distDir: '.next' })
    expect((await nextConfig({})).typescript).toBeUndefined()
  })

  it('--sin-build rechaza un build sin marca o de otra base', () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-local-'))
    mkdirSync(join(dir, DIST_DIR))
    expect(buildEsDeLaBase(dir, TEST.TEST_SUPABASE_URL)).toBe(false)
    marcarBuild(dir, 'http://127.0.0.1:54321')
    expect(buildEsDeLaBase(dir, TEST.TEST_SUPABASE_URL)).toBe(false)
    marcarBuild(dir, TEST.TEST_SUPABASE_URL)
    expect(buildEsDeLaBase(dir, TEST.TEST_SUPABASE_URL)).toBe(true)
  })
})
