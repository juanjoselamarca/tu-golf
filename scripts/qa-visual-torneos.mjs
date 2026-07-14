// scripts/qa-visual-torneos.mjs
//
// QA VISUAL (móvil 393px) de las pantallas de torneos que se tocaron esta
// sesión + el flujo general. Loguea con el user de prueba, siembra 2 jugadores
// + 1 grupo en el torneo draft del user (para ver el panel de grupos con datos),
// saca screenshots, captura errores de consola por página, y LIMPIA la siembra.
//
// Uso: node --env-file=.env.local scripts/qa-visual-torneos.mjs

import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = 'https://golfersplus.vercel.app'
const EMAIL = process.env.E2E_TEST_USER_EMAIL
const PASSWORD = process.env.E2E_TEST_USER_PASSWORD
const ORG_SLUG = 'e2e-seed-torneo-efa735c0'          // torneo draft del E2E user
const PUB_SLUG = 'lb-open-2026-padre-e-hijo-mpleeet7' // torneo público con grupos
const OUT = resolve('./screenshots-qa-visual')
mkdirSync(OUT, { recursive: true })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const report = []

async function seed() {
  const { data: t } = await sb.from('tournaments').select('id').eq('slug', ORG_SLUG).single()
  if (!t) { console.log('⚠ no encontré el torneo del E2E user, sigo sin siembra'); return { tid: null } }
  const ids = { tid: t.id, players: [], group: null }
  for (const n of ['QA Jugador Uno', 'QA Jugador Dos']) {
    const { data } = await sb.rpc('enroll_player', { p_tournament_id: t.id, p_kind: 'guest', p_user_id: null, p_guest_name: n, p_handicap: 12, p_category_id: null })
    if (data?.player_id) ids.players.push(data.player_id)
  }
  const { data: g } = await sb.from('tournament_groups').insert({ tournament_id: t.id, name: 'QA Grupo 1', sort_order: 0 }).select('id').single()
  if (g) {
    ids.group = g.id
    if (ids.players[0]) await sb.from('tournament_group_players').insert({ group_id: g.id, player_id: ids.players[0] })
  }
  console.log(`✓ sembrado: ${ids.players.length} jugadores + 1 grupo`)
  return ids
}

async function cleanup(ids) {
  if (!ids?.tid) return
  if (ids.group) await sb.from('tournament_group_players').delete().eq('group_id', ids.group)
  if (ids.group) await sb.from('tournament_groups').delete().eq('id', ids.group)
  for (const pid of ids.players) {
    await sb.from('rounds').delete().eq('player_id', pid)
    await sb.from('players').delete().eq('id', pid)
  }
  console.log('🧹 siembra QA borrada')
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {})
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar")').first().click()
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 20000 })
  console.log(`✓ login OK → ${page.url()}`)
}

async function shoot(page, label, path) {
  const errors = []
  const onConsole = (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) }
  const onPageErr = (e) => errors.push('PAGEERROR: ' + (e.message || String(e)).slice(0, 200))
  page.on('console', onConsole); page.on('pageerror', onPageErr)
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const file = resolve(OUT, `${label}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  page.off('console', onConsole); page.off('pageerror', onPageErr)
  const html = await page.content().catch(() => '')
  const broke = /Application error|Internal Server Error|Something went wrong/i.test(html)
  report.push({ label, path, url: page.url(), errores: errors.length, brokeShell: broke, muestras: errors.slice(0, 3) })
  console.log(`  📸 ${label.padEnd(22)} errores_consola=${errors.length} ${broke ? '❌SHELL ROTO' : ''}`)
}

async function main() {
  let ids = null
  const browser = await chromium.launch({ headless: true })
  try {
    ids = await seed()
    const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] })
    const page = await ctx.newPage()
    await login(page)
    await shoot(page, '01-home', '/')
    await shoot(page, '02-mi-golf', '/mi-golf')
    await shoot(page, '03-perfil', '/perfil')
    await shoot(page, '04-org-jugadores-GRUPOS', `/organizador/${ORG_SLUG}/jugadores`)
    await shoot(page, '05-torneo-publico', `/torneo/${PUB_SLUG}`)
    await shoot(page, '06-torneo-en-vivo', `/torneo/${PUB_SLUG}/en-vivo`)
    await ctx.close()
  } finally {
    await cleanup(ids)
    await browser.close()
  }
  console.log('\n=== RESUMEN QA VISUAL ===')
  for (const r of report) {
    console.log(`${r.brokeShell ? '❌' : (r.errores > 0 ? '⚠️ ' : '✅')} ${r.label} — ${r.errores} err consola${r.muestras.length ? ' :: ' + r.muestras.join(' | ') : ''}`)
  }
  console.log(`\nScreenshots en: ${OUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
