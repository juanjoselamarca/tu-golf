#!/usr/bin/env node
/**
 * E2E de Playwright contra la APP LOCAL apuntada a la BASE DE PRUEBAS (frente 3.4 del incidente del torneo
 * Los Leones, 04-oct-2026). Antes estos E2E corrían contra golfersplus.vercel.app y, por lo tanto, contra la BD de
 * PRODUCCIÓN (Supabase Free): cada PR creaba y borraba rondas en prod y dejaba basura visible en /en-vivo.
 *
 * Pasos: build con las variables de la base de pruebas (NEXT_PUBLIC_* quedan horneadas en el bundle) → `next start`
 * en localhost → espera a que responda → Playwright con PLAYWRIGHT_BASE_URL=localhost → apaga el servidor.
 * El exit code es el de Playwright (o 1 si falla el build o la app no levanta).
 *
 * Uso:  node --env-file=.env.local scripts/test-db/e2e-local.mjs [--sin-build] -- <args de playwright test>
 *       p. ej. `-- scorer-smoke.spec.ts --project=mobile-chromium-auth`
 *
 * `--sin-build` reutiliza el `.next` existente (sólo si se compiló con ESTAS variables: un build de prod llevaría
 * la URL de prod horneada en el cliente).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { MAPEO, entornoDePruebas } from './con-base-de-pruebas.mjs'
import { projectRefDe } from '../lib/supabase-ref.mjs'

const PUERTO = 3000
export const URL_LOCAL = `http://localhost:${PUERTO}`
const PLAZO_ARRANQUE_MS = 90_000

/**
 * Variables que el build y el servidor necesitan además de las de Supabase. Valores de mentira, los mismos del
 * build de ci.yml: web-push valida el formato VAPID al cargar el módulo; el coach no se ejercita en estos E2E.
 * Una variable del entorno que no venga de los archivos .env gana.
 */
const RELLENO = {
  NEXT_PUBLIC_SITE_URL: URL_LOCAL,
  ANTHROPIC_API_KEY: 'placeholder',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BA24XsfwtZKyxQuWltINW-0e22ovEqfVNhqRxPSaFHIORQ3S1nn2mR9PCVAwcIVrLS3cpLFINX-UbICRU6VZu2w',
  VAPID_PRIVATE_KEY: 'wsmrzpbRZZsztEIQimkkBc2jy-ZoaXvqyf49TZs6iUs',
  VAPID_CONTACT_EMAIL: 'mailto:placeholder@example.com',
}

/** Archivos .env que `next build` y `next start` leen del proyecto. */
const ARCHIVOS_ENV_DE_NEXT = ['.env.production.local', '.env.local', '.env.production', '.env']

export function clavesDeArchivosEnv(dir) {
  return ARCHIVOS_ENV_DE_NEXT.flatMap(archivo => {
    const ruta = join(dir, archivo)
    return existsSync(ruta) ? Object.keys(parseEnv(readFileSync(ruta, 'utf8'))) : []
  })
}

/**
 * Entorno de la app local: base de pruebas + relleno + la URL local (que siempre gana: los links apuntan acá).
 * Las `clavesDeArchivos` quedan vacías: Next relee .env.local en build y start pero no pisa una variable que ya
 * existe, así que ni la app ni los specs reciben credenciales de prod (Supabase, PostHog, Telegram, Fedegolf, IA).
 */
export function entornoAppLocal(env, clavesDeArchivos = []) {
  const pruebas = entornoDePruebas(env)
  const app = { ...pruebas, ...Object.fromEntries(clavesDeArchivos.map(k => [k, ''])) }
  for (const [k, v] of Object.entries(RELLENO)) app[k] ||= v
  for (const k of Object.keys(MAPEO)) app[k] = pruebas[k]
  return {
    ...app,
    NEXT_PUBLIC_SITE_URL: URL_LOCAL,
    PLAYWRIGHT_BASE_URL: URL_LOCAL,
    // Lo que organizar-campeonato-formato-cambia necesita saber de esta app: el paywall sale de este mismo entorno y
    // setup-e2e-user.mjs crea al usuario e2e free (el default de profiles.subscription_tier).
    E2E_PAYWALL_ENABLED: String(app.NEXT_PUBLIC_PAYWALL_ENABLED === 'true'),
    E2E_TEST_USER_TIER: 'free',
  }
}

const nodeBin = (rel) => [process.execPath, rel]

async function esperarApp() {
  const hasta = Date.now() + PLAZO_ARRANQUE_MS
  while (Date.now() < hasta) {
    try {
      const r = await fetch(URL_LOCAL, { signal: AbortSignal.timeout(10_000) })
      if (r.ok) return true
    } catch { /* todavía no levanta */ }
    await new Promise(res => setTimeout(res, 1_000))
  }
  return false
}

async function main() {
  const i = process.argv.indexOf('--')
  const flags = i >= 0 ? process.argv.slice(2, i) : process.argv.slice(2)
  const args = i >= 0 ? process.argv.slice(i + 1) : []
  let env
  try {
    env = entornoAppLocal(process.env, clavesDeArchivosEnv(process.cwd()))
  } catch (e) {
    console.error(`✘ e2e-local: ${e.message}`)
    process.exit(1)
  }
  console.log(`→ app local ${URL_LOCAL} contra la base de pruebas ${projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL) ?? env.NEXT_PUBLIC_SUPABASE_URL}`)

  const [node, next] = nodeBin('node_modules/next/dist/bin/next')
  if (!flags.includes('--sin-build')) {
    const b = spawnSync(node, [next, 'build'], { env, stdio: 'inherit' })
    if (b.status !== 0) { console.error('✘ e2e-local: el build falló'); process.exit(1) }
  }

  const servidor = spawn(node, [next, 'start', '-p', String(PUERTO)], { env, stdio: 'inherit' })
  let salida = 1
  try {
    if (!(await esperarApp())) {
      console.error(`✘ e2e-local: la app no respondió en ${PLAZO_ARRANQUE_MS / 1000} s`)
    } else {
      const [n, cli] = nodeBin('node_modules/@playwright/test/cli.js')
      const p = spawnSync(n, [cli, 'test', ...args], { env, stdio: 'inherit' })
      salida = p.status ?? 1
    }
  } finally {
    servidor.kill()
  }
  process.exit(salida)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
