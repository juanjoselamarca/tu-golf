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

/**
 * Reproducción de C1 (bug que cazó el code-reviewer): inserta un plan RESUELTO
 * "decoy" con outcomes extra dentro de la ventana de 4 semanas. Si la card contara
 * outcomes de planes no-activos, mostraría 5+3=8. Tras el fix (scope por plan_id),
 * debe seguir mostrando solo los 5 del plan activo. Devuelve el id para limpiar.
 */
async function seedDecoyResolvedPlan() {
  const { data: rounds } = await admin
    .from('historical_rounds').select('id, played_at')
    .eq('user_id', USER_ID).order('played_at', { ascending: false }).limit(3)
  if (!rounds || rounds.length < 3) throw new Error('faltan rondas para el decoy')
  const { data: decoy, error: pErr } = await admin.from('coach_plans').insert({
    user_id: USER_ID, pattern_id: 'three_putt_frequency', pattern_version: 1,
    hypothesis: 'DECOY plan resuelto', rule: 'no debería verse',
    metric: 'three_putt_rate', target_value: 0.10, target_op: 'lte', baseline_value: 0.30,
    duration_days: 21, status: 'resolved', assigned_by: 'tAIger', observation_data: {},
  }).select('id').single()
  if (pErr) throw pErr
  const { error: oErr } = await admin.from('plan_outcomes').insert(rounds.map((r, i) => ({
    plan_id: decoy.id, user_id: USER_ID, historical_round_id: r.id, played_at: r.played_at,
    metric_value: 0.2, delta_vs_baseline: -0.1, target_reached: true, compliance: 'full', metadata: { decoy: true },
  })))
  if (oErr) throw oErr
  return decoy.id
}

/** Verifica la card de plan activo en una pantalla: 5 dots, título correcto, 60%. */
async function assertPlanCard(page, scope, locator) {
  const txt = (await locator.innerText()).replace(/\s+/g, ' ')
  if (/Bogey seguro tras error/i.test(txt)) ok(`[${scope}] título del plan activo correcto`)
  else fail(`[${scope}] título inesperado: "${txt.slice(0, 80)}"`)
  if (/DECOY/i.test(txt)) fail(`[${scope}] ¡se filtró el plan DECOY resuelto!`)
  const dots = await locator.locator('[role="list"][aria-label="Adherencia por ronda"] [role="listitem"]').count()
  if (dots === 5) ok(`[${scope}] 5 dots (solo plan activo — decoy excluido, C1 cerrado)`)
  else fail(`[${scope}] dots esperados 5, encontrados ${dots} (¿se colaron outcomes de otro plan?)`)
  if (/Aplicas el plan en 60% de las últimas 5 rondas/i.test(txt)) ok(`[${scope}] correlación "60% de las últimas 5" correcta`)
  else fail(`[${scope}] correlación inesperada: "${txt.match(/Aplicas[^.]*\./)?.[0] ?? 'n/a'}"`)
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

  let decoyPlanId = null
  try {
    const sid = await emptySessionId()
    ok(`sesión vacía del user de test: ${sid}`)
    decoyPlanId = await seedDecoyResolvedPlan()
    ok(`decoy plan resuelto + 3 outcomes sembrado (reproduce C1): ${decoyPlanId}`)

    await login(page)
    ok(`login OK (${EMAIL})`)

    // --- Pantalla 1: estado vacío del chat ---
    await page.goto(`${BASE_URL}/coach/sesion/${sid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="taiger-opener"]', { timeout: 20000 })
    ok('opener del estado vacío renderizado')

    const planCard = page.locator('[data-testid="taiger-active-plan"] [data-testid="plan-active-card"]')
    if (await planCard.count() > 0) {
      ok('card "Tu plan activo" presente (D3)')
      await assertPlanCard(page, 'chat', planCard)
    } else {
      fail('NO se encontró la card "Tu plan activo" (D3 no renderizó)')
    }

    const chips = page.locator('[role="group"][aria-label="Preguntas sugeridas"] button')
    const chipCount = await chips.count()
    if (chipCount >= 3) ok(`${chipCount} chips de arranque presentes (PR3a intacto)`)
    else fail(`chips esperados ≥3, encontrados ${chipCount}`)
    await page.screenshot({ path: `${OUT}/pr3b-estado-vacio-390.png`, fullPage: true })

    // --- Pantalla 2: /coach (misma card canónica, debe coincidir 1:1) ---
    await page.goto(`${BASE_URL}/coach`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="plan-active-card"]', { timeout: 20000 })
    await assertPlanCard(page, 'coach', page.locator('[data-testid="plan-active-card"]').first())
    await page.screenshot({ path: `${OUT}/pr3b-coach-390.png`, fullPage: true })
    ok('card idéntica en chat y /coach (un concepto, una fuente verificado)')

    if (consoleErrors.length === 0) ok('cero errores de consola')
    else fail(`errores de consola:\n  - ${consoleErrors.slice(0, 8).join('\n  - ')}`)
  } catch (e) {
    fail('excepción: ' + (e?.stack || e?.message || String(e)))
  } finally {
    await browser.close()
    if (decoyPlanId) {
      await admin.from('plan_outcomes').delete().eq('plan_id', decoyPlanId)
      await admin.from('coach_plans').delete().eq('id', decoyPlanId)
      ok('decoy limpiado')
    }
  }
}

run()
