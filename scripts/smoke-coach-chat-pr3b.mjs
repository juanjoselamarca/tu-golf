/**
 * Smoke visual mobile (390px) del ESTADO VACÍO del chat del coach — PR3b.
 * Verifica D3: surfacing del plan activo ("Tu plan activo" + PlanActiveCard) y
 * que los chips de arranque (PR3a) sigan presentes. NO gasta créditos de Anthropic
 * (el opener es determinístico; no se envía ningún mensaje al LLM).
 *
 * Requiere un user de test ya sembrado (scripts/seed-coach-visual-test.mjs):
 *   SMOKE_EMAIL / SMOKE_PASSWORD / SMOKE_USER en el entorno.
 *
 * Uso:
 *   SMOKE_EMAIL=.. SMOKE_PASSWORD=.. SMOKE_USER=.. \
 *   node --env-file=.env.local scripts/smoke-coach-chat-pr3b.mjs [BASE_URL]
 */
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_URL = process.argv[2] ?? 'http://localhost:3024'
const EMAIL = process.env.SMOKE_EMAIL
const PASSWORD = process.env.SMOKE_PASSWORD
const USER_ID = process.env.SMOKE_USER
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OUT = resolve('smoke-out')

if (!EMAIL || !PASSWORD || !USER_ID || !SERVICE_KEY) {
  console.error('Faltan SMOKE_EMAIL / SMOKE_PASSWORD / SMOKE_USER / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPA_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1 }
const ok = (m) => console.log('✅ ' + m)

async function emptySessionId() {
  const { data, error } = await admin
    .from('taiger_sessions')
    .select('id, messages')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
  if (error) throw error
  const empty = (data ?? []).find(s => !Array.isArray(s.messages) || s.messages.length === 0)
  if (!empty) throw new Error('no se encontró una sesión vacía del user de test')
  return empty.id
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Iniciar")').first().click()
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 20000 })
}

const run = async () => {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const iphone = devices['iPhone 14 Pro'] ?? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  const ctx = await browser.newContext({ ...iphone })
  await ctx.addInitScript(() => { try { localStorage.setItem('pwa-banner-dismissed', String(Date.now())) } catch { /* noop */ } })
  const page = await ctx.newPage()

  const isBenign = (t) => /Failed to fetch RSC payload/i.test(t)
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error' && !isBenign(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', e => { if (!isBenign(e.message)) consoleErrors.push('pageerror: ' + e.message) })

  try {
    const sid = await emptySessionId()
    ok(`sesión vacía del user de test: ${sid}`)

    await login(page)
    ok(`login OK (${EMAIL})`)

    await page.goto(`${BASE_URL}/coach/sesion/${sid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="taiger-opener"]', { timeout: 20000 })
    ok('opener del estado vacío renderizado')

    // D3 — card "Tu plan activo"
    const planCard = page.locator('[data-testid="taiger-active-plan"]')
    if (await planCard.count() > 0) {
      ok('card "Tu plan activo" presente (D3)')
      const txt = await planCard.innerText()
      if (/Bogey seguro tras error/i.test(txt)) ok('título del plan correcto (hypothesis del seed)')
      else fail(`título del plan inesperado: "${txt.slice(0, 80)}"`)
      // dots de adherencia (seed = 5 outcomes)
      const dots = await planCard.locator('[role="list"][aria-label="Adherencia por ronda"] [role="listitem"]').count()
      if (dots === 5) ok(`${dots} dots de adherencia (coincide con los 5 outcomes del seed)`)
      else fail(`dots esperados 5, encontrados ${dots}`)
      if (/Aplicas el plan en\s+60%/i.test(txt.replace(/\s+/g, ' '))) ok('línea de correlación 60% correcta')
      else console.log(`ℹ️  línea correlación: "${txt.replace(/\s+/g, ' ').match(/Aplicas[^.]*\./)?.[0] ?? 'n/a'}"`)
    } else {
      fail('NO se encontró la card "Tu plan activo" (D3 no renderizó)')
    }

    // Chips de arranque (PR3a) siguen presentes
    const chips = page.locator('[role="group"][aria-label="Preguntas sugeridas"] button')
    const chipCount = await chips.count()
    if (chipCount >= 3) ok(`${chipCount} chips de arranque presentes (PR3a intacto)`)
    else fail(`chips esperados ≥3, encontrados ${chipCount}`)

    await page.screenshot({ path: `${OUT}/pr3b-estado-vacio-390.png`, fullPage: true })
    ok(`screenshot → ${OUT}/pr3b-estado-vacio-390.png`)

    if (consoleErrors.length === 0) ok('cero errores de consola')
    else fail(`errores de consola:\n  - ${consoleErrors.slice(0, 8).join('\n  - ')}`)
  } catch (e) {
    fail('excepción: ' + (e?.stack || e?.message || String(e)))
  } finally {
    await browser.close()
  }
}

run()
