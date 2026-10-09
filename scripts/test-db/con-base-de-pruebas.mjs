#!/usr/bin/env node
/**
 * Corre un comando con las variables de Supabase apuntando a la BASE DE PRUEBAS en vez de prod.
 * Los tests leen NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / E2E_TEST_USER_* : acá se pisan con los
 * TEST_* (y se borran las de prod que no tienen par, para que nada pueda caer a prod por descuido).
 *
 * Uso:  node --env-file=.env.local scripts/test-db/con-base-de-pruebas.mjs -- npm run test:integration:ci
 */
import { spawnSync } from 'node:child_process'
import { projectRefDe } from '../lib/supabase-ref.mjs'

/** Variable que leen los tests ← variable de la base de pruebas. */
const MAPEO = {
  NEXT_PUBLIC_SUPABASE_URL: 'TEST_SUPABASE_URL',
  SUPABASE_URL: 'TEST_SUPABASE_URL',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'TEST_SUPABASE_ANON_KEY',
  SUPABASE_SERVICE_ROLE_KEY: 'TEST_SUPABASE_SERVICE_ROLE_KEY',
  E2E_TEST_USER_EMAIL: 'TEST_E2E_USER_EMAIL',
  E2E_TEST_USER_PASSWORD: 'TEST_E2E_USER_PASSWORD',
  E2E_USER_EMAIL: 'TEST_E2E_USER_EMAIL',
  E2E_USER_PASSWORD: 'TEST_E2E_USER_PASSWORD',
}

/** → env nuevo, o lanza si falta algo o si la URL de pruebas es la de prod. */
function entornoDePruebas(env) {
  const faltan = [...new Set(Object.values(MAPEO))].filter(k => !env[k])
  if (faltan.length) throw new Error(`faltan ${faltan.join(', ')}`)
  const prod = projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL)
  if (prod && prod === projectRefDe(env.TEST_SUPABASE_URL)) throw new Error('TEST_SUPABASE_URL apunta a prod')
  const nuevo = { ...env }
  for (const [destino, origen] of Object.entries(MAPEO)) nuevo[destino] = env[origen]
  // Credenciales con las que un test podría tocar prod por otro camino: fuera.
  delete nuevo.SUPABASE_ACCESS_TOKEN
  delete nuevo.EVENTO_SUPABASE_URL
  delete nuevo.EVENTO_SUPABASE_KEY
  return nuevo
}

const i = process.argv.indexOf('--')
const cmd = i >= 0 ? process.argv.slice(i + 1) : []
if (!cmd.length) {
  console.error('Uso: node --env-file=.env.local scripts/test-db/con-base-de-pruebas.mjs -- <comando> [args]')
  process.exit(1)
}
let env
try {
  env = entornoDePruebas(process.env)
} catch (e) {
  console.error(`✘ con-base-de-pruebas: ${e.message}`)
  process.exit(1)
}
console.log(`→ base de pruebas ${projectRefDe(env.TEST_SUPABASE_URL)}: ${cmd.join(' ')}`)
const r = spawnSync(cmd[0], cmd.slice(1), { env, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
