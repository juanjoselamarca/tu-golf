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
import { pathToFileURL } from 'node:url'
import { entornoDePruebas } from './con-base-de-pruebas.mjs'
import { projectRefDe } from '../lib/supabase-ref.mjs'

const PUERTO = 3000
export const URL_LOCAL = `http://localhost:${PUERTO}`
const PLAZO_ARRANQUE_MS = 90_000

/**
 * Variables que el build y el servidor necesitan además de las de Supabase. Valores de mentira, los mismos del
 * build de ci.yml: web-push valida el formato VAPID al cargar el módulo; el coach no se ejercita en estos E2E.
 * Una variable que ya venga en el entorno (p. ej. desde .env.local) gana.
 */
const RELLENO = {
  NEXT_PUBLIC_SITE_URL: URL_LOCAL,
  ANTHROPIC_API_KEY: 'placeholder',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BA24XsfwtZKyxQuWltINW-0e22ovEqfVNhqRxPSaFHIORQ3S1nn2mR9PCVAwcIVrLS3cpLFINX-UbICRU6VZu2w',
  VAPID_PRIVATE_KEY: 'wsmrzpbRZZsztEIQimkkBc2jy-ZoaXvqyf49TZs6iUs',
  VAPID_CONTACT_EMAIL: 'mailto:placeholder@example.com',
}

/** Entorno de la app local: base de pruebas + relleno + la URL local (que siempre gana: los links apuntan acá). */
export function entornoAppLocal(env) {
  return { ...RELLENO, ...entornoDePruebas(env), NEXT_PUBLIC_SITE_URL: URL_LOCAL, PLAYWRIGHT_BASE_URL: URL_LOCAL }
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
    env = entornoAppLocal(process.env)
  } catch (e) {
    console.error(`✘ e2e-local: ${e.message}`)
    process.exit(1)
  }
  console.log(`→ app local ${URL_LOCAL} contra la base de pruebas ${projectRefDe(env.TEST_SUPABASE_URL)}`)

  if (!flags.includes('--sin-build')) {
    const [node, script] = nodeBin('scripts/build.mjs')
    const b = spawnSync(node, [script], { env, stdio: 'inherit' })
    if (b.status !== 0) { console.error('✘ e2e-local: el build falló'); process.exit(1) }
  }

  const [node, next] = nodeBin('node_modules/next/dist/bin/next')
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
