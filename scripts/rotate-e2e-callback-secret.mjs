#!/usr/bin/env node
/**
 * Rotación atómica del secret E2E_CALLBACK_SECRET en Vercel + GitHub.
 *
 * El secret conecta GitHub Actions (workflow E2E Trigger) con el endpoint
 * /api/admin/e2e/runs/[id]/callback en producción. AMBOS lados deben tener
 * el mismo valor o el callback final tira 401 (Auth inválido).
 *
 * Por qué este script existe en lugar de `vercel env add`:
 * `vercel env add NAME ENV` con stdin pipe en Windows guarda valor vacío
 * silenciosamente (la API devuelve 200 pero el value queda ""). La única
 * forma confiable de setear es vía API REST de Vercel con DELETE + POST.
 *
 * Uso:
 *   node scripts/rotate-e2e-callback-secret.mjs
 *
 * Requisitos:
 * - Vercel CLI logueado (lee token de C:/Users/juanj/AppData/Roaming/com.vercel.cli/Data/auth.json)
 * - gh CLI logueado (gh auth status)
 *
 * Operaciones que hace:
 *  1. Genera secret aleatorio (32 bytes hex)
 *  2. Borra E2E_CALLBACK_SECRET existente en Vercel (production + preview)
 *  3. Crea E2E_CALLBACK_SECRET nuevo en Vercel con type='encrypted'
 *  4. Setea E2E_CALLBACK_SECRET en GitHub via `gh secret set`
 *  5. Dispara redeploy de Vercel del último deploy production
 *  6. Espera que el redeploy esté Ready
 *  7. Hace probe al endpoint con el secret real → debería responder 200 (con runId dummy)
 *
 * Si algún paso falla, aborta sin dejar inconsistencias mayores.
 */
import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import { execSync, spawnSync } from 'child_process'
import os from 'os'

const VERCEL_AUTH_PATH = process.platform === 'win32'
  ? `${os.homedir()}/AppData/Roaming/com.vercel.cli/Data/auth.json`
  : `${os.homedir()}/.config/com.vercel.cli/Data/auth.json`

const PROJECT_ID = 'prj_jb9iJB9pDVOicuv4pV9D3IqTheMK'
const TEAM_ID = 'team_GgasSxd8sEmfPOnVeE5uQFAt'
const PROBE_URL = 'https://golfersplus.vercel.app/api/admin/e2e/runs/00000000-0000-0000-0000-000000000000/callback'

function log(msg) {
  console.log(`[rotate-secret] ${msg}`)
}

function fatal(msg, err) {
  console.error(`[rotate-secret] FATAL: ${msg}`)
  if (err) console.error(err)
  process.exit(1)
}

function api(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request({
      hostname: 'api.vercel.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function ghBinary() {
  if (process.platform === 'win32') {
    const win = 'C:/Program Files/GitHub CLI/gh.exe'
    if (fs.existsSync(win)) return win
  }
  return 'gh'
}

async function main() {
  log('1. Leyendo token de Vercel...')
  let auth
  try {
    auth = JSON.parse(fs.readFileSync(VERCEL_AUTH_PATH, 'utf8'))
  } catch (e) {
    fatal(`No pude leer ${VERCEL_AUTH_PATH}. ¿Está logueado vercel CLI?`, e)
  }
  const token = auth.token
  if (!token) fatal('auth.json no tiene token')

  log('2. Verificando gh CLI...')
  const gh = ghBinary()
  const ghCheck = spawnSync(gh, ['auth', 'status'], { encoding: 'utf8' })
  if (ghCheck.status !== 0) {
    fatal('gh CLI no autenticado. Corré: gh auth login')
  }

  log('3. Generando secret aleatorio (32 bytes hex)...')
  const newSecret = crypto.randomBytes(32).toString('hex')
  log(`   First 8 chars: ${newSecret.slice(0, 8)}...`)

  log('4. Buscando E2E_CALLBACK_SECRET existentes en Vercel...')
  const list = await api(token, 'GET', `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`)
  if (list.status !== 200) fatal(`GET env list devolvió ${list.status}`)
  const existing = list.body.envs.filter((e) => e.key === 'E2E_CALLBACK_SECRET')
  log(`   Encontradas: ${existing.length}`)

  log('5. Borrando entradas existentes...')
  for (const e of existing) {
    const del = await api(token, 'DELETE', `/v9/projects/${PROJECT_ID}/env/${e.id}?teamId=${TEAM_ID}`)
    if (del.status !== 200) fatal(`DELETE ${e.id} devolvió ${del.status}`)
    log(`   ✓ Borrada ${e.id} (target=${e.target})`)
  }

  log('6. Creando E2E_CALLBACK_SECRET nueva en Vercel (production + preview)...')
  const create = await api(token, 'POST', `/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
    key: 'E2E_CALLBACK_SECRET',
    value: newSecret,
    type: 'encrypted',
    target: ['production', 'preview'],
  })
  if (create.status !== 201) fatal(`POST env devolvió ${create.status}`, create.body)
  log('   ✓ Creada (type=encrypted)')

  log('7. Seteando E2E_CALLBACK_SECRET en GitHub via gh CLI...')
  const ghSet = spawnSync(gh, ['secret', 'set', 'E2E_CALLBACK_SECRET'], {
    input: newSecret,
    encoding: 'utf8',
  })
  if (ghSet.status !== 0) fatal(`gh secret set falló: ${ghSet.stderr}`)
  log('   ✓ Seteado en GitHub')

  log('8. Disparando redeploy de Vercel (último deploy production)...')
  let prodUrl
  try {
    const out = execSync('vercel list --prod --yes', { encoding: 'utf8' })
    const match = out.split('\n').find((l) => l.includes('Ready'))
    prodUrl = match?.match(/https:\/\/[^\s]+/)?.[0]
  } catch (e) {
    fatal('No pude obtener último deploy production', e)
  }
  if (!prodUrl) fatal('No encontré deploy "Ready" en producción')
  log(`   Redeploying ${prodUrl}...`)
  try {
    execSync(`vercel redeploy ${prodUrl}`, { stdio: 'inherit' })
  } catch (e) {
    fatal('vercel redeploy falló', e)
  }

  log('9. Esperando que el redeploy esté Ready (puede tomar 3-5 min)...')
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    const out = execSync('vercel list --prod --yes', { encoding: 'utf8' })
    const firstLine = out.split('\n').find((l) => /● (Ready|Building|Queued|Error)/.test(l))
    if (firstLine?.includes('Ready')) {
      log('   ✓ Deploy Ready')
      break
    }
    if (firstLine?.includes('Error')) fatal('Deploy entró en estado Error')
    const status = firstLine?.match(/●\s+(\w+)/)?.[1] ?? 'unknown'
    log(`   status=${status}, esperando 15s...`)
    await new Promise((r) => setTimeout(r, 15000))
  }

  log('10. Probe al endpoint con secret nuevo (espera 200/4xx, NO 503)...')
  const probe = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'golfersplus.vercel.app',
      path: '/api/admin/e2e/runs/00000000-0000-0000-0000-000000000000/callback',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-e2e-callback-secret': newSecret,
        'Content-Length': 20,
      },
    }, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    req.on('error', reject)
    req.write('{"status":"error"}')
    req.end()
  })
  if (probe.status === 503) {
    fatal(`Probe devolvió 503 — la env var no llegó al runtime. Body: ${probe.body}`)
  }
  log(`   ✓ Probe HTTP ${probe.status} (cualquier cosa que no sea 503 confirma que el secret está en runtime)`)

  console.log('')
  console.log('✅ Rotación completa. El nuevo secret está en:')
  console.log('   - Vercel (production + preview)')
  console.log('   - GitHub Actions Secrets')
  console.log('   - Runtime de producción (verificado con probe)')
  console.log('')
  console.log(`Próximo paso: disparar un E2E run desde /admin/e2e para validar end-to-end.`)
}

main().catch((e) => fatal('Excepción no atrapada', e))
