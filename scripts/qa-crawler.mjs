#!/usr/bin/env node
/**
 * scripts/qa-crawler.mjs — Crawler de botones / interacciones de Golfers+
 *
 * Objetivo: levantar la lista de TODOS los botones/enlaces/acciones de la app
 * que no funcionan (error JS, request 4xx/5xx, navegación a 404 / error boundary),
 * de forma repetible y versionada. Complementa a /qa (flujos con estado).
 *
 * Estrategia en 2 fases:
 *   A. Descubrimiento (BFS): parte de rutas semilla, sigue enlaces internos
 *      (same-origin) hasta `--depth`, y arma el inventario real de rutas
 *      —incluyendo instancias dinámicas (ronda [codigo], torneo [slug], etc.)
 *      que aparecen como links reales en la cuenta logueada.
 *   B. Prueba (probe): por cada ruta descubierta, enumera elementos interactivos
 *      y prueba cada uno re-navegando a la ruta y clickeándolo en aislamiento.
 *      Captura: errores de consola, excepciones, respuestas 4xx/5xx, y si el
 *      click deja al usuario en un 404 / error boundary.
 *
 * Modos:
 *   --mode=full      Clickea TODO (incl. acciones que mutan). Usar contra preview/local.
 *   --mode=readonly  Salta acciones potencialmente destructivas (eliminar, guardar,
 *                    finalizar, pagar, cerrar sesión...). Usar contra producción.
 *
 * Auth: si E2E_TEST_USER_EMAIL/PASSWORD están en el entorno, hace login vía UI
 * (mismos selectores que e2e/helpers/auth.ts) y crawlea como usuario logueado.
 * Si no, crawlea solo lo público.
 *
 * Uso:
 *   node --env-file=.env.local scripts/qa-crawler.mjs \
 *     --base=https://golfersplus.vercel.app --mode=readonly --depth=2
 *
 * Salida: qa-crawler-report/<timestamp>-<host>.json  +  .md (tabla priorizada)
 */

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------- args / config
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=?(.*)$/)
    return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true]
  }),
)

const BASE = (args.base || process.env.CRAWL_BASE_URL || 'https://golfersplus.vercel.app').replace(/\/$/, '')
const MODE = args.mode === 'full' ? 'full' : 'readonly'
const DEPTH = Number(args.depth ?? 2)
const MAX_ELEMENTS_PER_PAGE = Number(args.maxel ?? 40)
const MAX_ROUTES = Number(args.maxroutes ?? 120)
const INCLUDE_ADMIN = !!args.admin
const HEADLESS = args.headed ? false : true
const PROBE_WAIT_MS = Number(args.wait ?? 900)

const ORIGIN = new URL(BASE).origin
const HOST = new URL(BASE).host.replace(/[^a-z0-9.]/gi, '_')

// Rutas semilla autenticadas (las que no se descubren solas con un link directo).
const SEED_AUTHED = [
  '/', '/dashboard', '/perfil', '/perfil/stats', '/perfil/historial',
  '/coach', '/coach/progreso', '/ronda-libre/nueva', '/importar',
  '/organizador/nuevo', '/indices', '/ranking', '/leaderboard', '/en-vivo',
]
const SEED_PUBLIC = [
  '/', '/login', '/register', '/recuperar', '/terminos', '/privacidad',
  '/reembolsos', '/demo', '/demo/taiger', '/indices', '/ranking', '/leaderboard',
]
const SEED_ADMIN = [
  '/admin', '/admin/analytics', '/admin/finanzas', '/admin/golf-ops',
  '/admin/usuarios', '/admin/costos', '/admin/sistema', '/admin/cerebro/pesos',
]

// No seguir / no probar estas rutas (logout, externos, descargas).
const SKIP_PATH = /\/(auth\/|api\/|logout|signout)/i
// Texto/labels de acciones que mutan estado o sacan al usuario — saltadas en readonly.
const DESTRUCTIVE = /(elimin|borrar|delete|quitar|remover|cerrar sesi|logout|salir|finaliz|guardar|pagar|cobrar|confirmar|enviar|publicar|crear|registrar|desactiv|archiv|restablecer|resetear|cancelar inscrip)/i

// ---------------------------------------------------------------- helpers
const now = () => new Date().toISOString()
function log(...a) { console.log(`[crawler ${new Date().toLocaleTimeString()}]`, ...a) }

async function login(context) {
  const email = process.env.E2E_TEST_USER_EMAIL
  const password = process.env.E2E_TEST_USER_PASSWORD
  if (!email || !password) {
    log('Sin credenciales E2E → crawl ANÓNIMO (solo público).')
    return false
  }
  const page = await context.newPage()
  try {
    log(`Login vía UI como ${email}...`)
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').first().fill(email)
    await page.locator('input[placeholder="Tu contraseña"]').first().fill(password)
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 })
    log('Login OK.')
    return true
  } catch (e) {
    log('⚠ Login FALLÓ:', e.message, '→ sigo anónimo.')
    return false
  } finally {
    await page.close()
  }
}

const norm = (u) => {
  try {
    const url = new URL(u, BASE)
    if (url.origin !== ORIGIN) return null
    url.hash = ''
    url.search = '' // tratamos misma ruta con distinto query como una
    let p = url.pathname.replace(/\/$/, '')
    return p === '' ? '/' : p
  } catch { return null }
}

/** Listener de errores reseteable por página. */
function attachErrorSink(page) {
  const sink = { console: [], pageerror: [], bad: [] }
  page.on('console', (m) => { if (m.type() === 'error') sink.console.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => sink.pageerror.push(String(e.message || e).slice(0, 300)))
  page.on('response', (r) => {
    const s = r.status()
    if (s >= 400) {
      const u = r.url()
      // ignorar ruido de terceros (analytics, fonts) y favicons
      if (/golfersplus|supabase|\/api\//.test(u) && !/favicon|\.map$/.test(u)) {
        sink.bad.push(`${s} ${u.replace(ORIGIN, '').slice(0, 120)}`)
      }
    }
  })
  sink.reset = () => { sink.console = []; sink.pageerror = []; sink.bad = [] }
  return sink
}

/** ¿La página actual es un 404 / error boundary? */
async function detectErrorPage(page) {
  const url = page.url()
  if (/\/404|\/not-found|\/auth\/auth-code-error/.test(url)) return `redirige a ${norm(url)}`
  const txt = (await page.locator('body').innerText().catch(() => '')) || ''
  const low = txt.toLowerCase()
  if (/404|página no encontrada|page not found|esta página no existe/.test(low)) return '404 / página no encontrada'
  if (/algo salió mal|something went wrong|error inesperado|ha ocurrido un error|application error/.test(low)) {
    return 'error boundary'
  }
  return null
}

// ---------------------------------------------------------------- FASE A: descubrimiento
async function discover(page, seeds) {
  const queue = seeds.map((p) => ({ path: p, depth: 0 }))
  const seen = new Set()
  const routes = []
  while (queue.length && routes.length < MAX_ROUTES) {
    const { path, depth } = queue.shift()
    if (seen.has(path)) continue
    seen.add(path)
    if (SKIP_PATH.test(path)) continue
    let landedOn = path
    try {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      landedOn = norm(page.url()) || path
      const status = resp ? resp.status() : 0
      routes.push({ path, landedOn, status })
      if (depth < DEPTH) {
        const hrefs = await page.locator('a[href]').evaluateAll((els) =>
          els.map((e) => e.getAttribute('href')).filter(Boolean),
        )
        for (const h of hrefs) {
          const n = norm(h)
          if (n && !seen.has(n) && !SKIP_PATH.test(n)) queue.push({ path: n, depth: depth + 1 })
        }
      }
    } catch (e) {
      routes.push({ path, landedOn, status: -1, error: e.message.slice(0, 120) })
    }
  }
  return routes
}

// ---------------------------------------------------------------- FASE B: probe de elementos
const INTERACTIVE = 'button, a[href], [role="button"], [role="tab"], input[type="submit"], input[type="button"], summary, [onclick]'

async function snapshotElements(page) {
  return page.locator(INTERACTIVE).evaluateAll((els, max) => {
    const out = []
    for (let i = 0; i < els.length && out.length < max; i++) {
      const el = els[i]
      const r = el.getBoundingClientRect()
      const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
      if (!visible) continue
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
        .replace(/\s+/g, ' ').trim().slice(0, 60)
      out.push({
        idx: i,
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href') || null,
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        label: label || '(sin texto)',
      })
    }
    return out
  }, MAX_ELEMENTS_PER_PAGE)
}

async function probeRoute(page, sink, route) {
  const findings = []
  let snap
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    snap = await snapshotElements(page)
  } catch (e) {
    return [{ route, label: '(carga de ruta)', kind: 'route-load', detail: e.message.slice(0, 160), sev: 'P1' }]
  }

  const total = await page.locator(INTERACTIVE).count()
  if (total > snap.length) {
    findings.push({
      route, label: `(${snap.length}/${total} elementos probados)`, kind: 'cap',
      detail: `Cap de ${MAX_ELEMENTS_PER_PAGE} elementos visibles — ${total - snap.length} no probados`, sev: 'info',
    })
  }

  for (const el of snap) {
    if (el.disabled) continue
    if (MODE === 'readonly' && DESTRUCTIVE.test(el.label)) {
      findings.push({ route, label: el.label, kind: 'skip-destructive', detail: 'saltado en readonly', sev: 'skip' })
      continue
    }
    // re-navegar fresco para aislar el click
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {})
    } catch { continue }
    sink.reset()
    let threw = null
    const target = page.locator(INTERACTIVE).nth(el.idx)
    try {
      await target.click({ timeout: 5_000, trial: false })
    } catch (e) {
      threw = e.message.split('\n')[0].slice(0, 140)
    }
    await page.waitForTimeout(PROBE_WAIT_MS)
    const errPage = await detectErrorPage(page)
    const navTo = norm(page.url())

    const problems = []
    if (threw && !/Timeout.*exceeded/.test(threw)) problems.push({ kind: 'click-error', detail: threw, sev: 'P2' })
    if (sink.pageerror.length) problems.push({ kind: 'js-exception', detail: sink.pageerror[0], sev: 'P1' })
    if (sink.bad.length) problems.push({ kind: 'bad-response', detail: sink.bad.slice(0, 3).join(' | '), sev: 'P1' })
    if (errPage) problems.push({ kind: 'error-page', detail: `${errPage} (→ ${navTo})`, sev: 'P1' })
    if (sink.console.length && !problems.length) {
      problems.push({ kind: 'console-error', detail: sink.console[0], sev: 'P3' })
    }
    for (const p of problems) findings.push({ route, label: el.label, navTo, ...p })
  }
  return findings
}

// ---------------------------------------------------------------- main
async function main() {
  log(`BASE=${BASE} MODE=${MODE} DEPTH=${DEPTH} admin=${INCLUDE_ADMIN}`)
  const browser = await chromium.launch({ headless: HEADLESS })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // mobile-first, como el resto de los E2E
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16) GolfersQACrawler',
  })
  const authed = await login(context)
  const page = await context.newPage()
  const sink = attachErrorSink(page)

  let seeds = authed ? [...new Set([...SEED_AUTHED, ...SEED_PUBLIC])] : SEED_PUBLIC
  if (INCLUDE_ADMIN && authed) seeds = [...seeds, ...SEED_ADMIN]

  log('Fase A: descubriendo rutas...')
  const routes = await discover(page, seeds)
  log(`Descubiertas ${routes.length} rutas.`)

  log('Fase B: probando botones por ruta...')
  const allFindings = []
  let i = 0
  for (const r of routes) {
    i++
    if (r.status === -1 || SKIP_PATH.test(r.path)) continue
    log(`  (${i}/${routes.length}) ${r.path}`)
    const f = await probeRoute(page, sink, r.path)
    allFindings.push(...f)
  }

  await browser.close()

  // -------- reporte
  const real = allFindings.filter((f) => ['P1', 'P2', 'P3', 'route-load'].includes(f.sev) || ['P1', 'P2', 'P3'].includes(f.sev))
  const bySev = (s) => allFindings.filter((f) => f.sev === s)
  const stamp = now().replace(/[:.]/g, '-')
  const dir = 'qa-crawler-report'
  mkdirSync(dir, { recursive: true })

  const payload = {
    meta: { base: BASE, mode: MODE, authed, depth: DEPTH, when: now(), routes: routes.length },
    counts: {
      P1: bySev('P1').length, P2: bySev('P2').length, P3: bySev('P3').length,
      skipped: bySev('skip').length, capped: bySev('info').length,
    },
    routes,
    findings: allFindings,
  }
  const jsonPath = join(dir, `${stamp}-${HOST}.json`)
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2))

  const sevOrder = { P1: 0, P2: 1, P3: 2 }
  const ranked = allFindings
    .filter((f) => f.sev in sevOrder)
    .sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev])
  let md = `# QA Crawler — botones rotos\n\n`
  md += `- **Entorno:** ${BASE} (${authed ? 'autenticado' : 'anónimo'})\n`
  md += `- **Modo:** ${MODE}  ·  **Rutas:** ${routes.length}  ·  **Fecha:** ${now()}\n`
  md += `- **Hallazgos:** P1=${payload.counts.P1}  P2=${payload.counts.P2}  P3=${payload.counts.P3}`
  md += `  (saltados destructivos: ${payload.counts.skipped}, rutas con cap: ${payload.counts.capped})\n\n`
  md += `> P1 = roto (excepción JS / 5xx / 404 / error boundary) · P2 = click no responde · P3 = console.error\n\n`
  md += `| Sev | Ruta | Botón / acción | Problema | Detalle |\n|---|---|---|---|---|\n`
  for (const f of ranked) {
    md += `| ${f.sev} | \`${f.route}\` | ${f.label.replace(/\|/g, '\\|')} | ${f.kind} | ${(f.detail || '').replace(/\|/g, '\\|').slice(0, 120)} |\n`
  }
  if (!ranked.length) md += `| — | — | — | — | ✅ sin botones rotos detectados |\n`
  const mdPath = join(dir, `${stamp}-${HOST}.md`)
  writeFileSync(mdPath, md)

  log('========================================')
  log(`Reporte: ${mdPath}`)
  log(`JSON:    ${jsonPath}`)
  log(`P1=${payload.counts.P1}  P2=${payload.counts.P2}  P3=${payload.counts.P3}`)
  log('========================================')
}

main().catch((e) => { console.error(e); process.exit(1) })
