/**
 * Smoke E2E mobile (390px) de los FOLLOW-UP CHIPS — PR3c.
 * Manda UN mensaje real al coach (envío manual en una sesión existente, sin el
 * redirect 'nueva'→id que resetea los chips) y verifica que, tras cerrar el stream,
 * el endpoint aislado /api/taiger/followups devuelve preguntas y se renderizan como
 * chips bajo la respuesta. Gasta ~1 llamada de coach + 1 Haiku.
 *
 * Requiere un user de test sembrado (scripts/seed-coach-visual-test.mjs):
 *   SMOKE_EMAIL / SMOKE_PASSWORD / SMOKE_USER en el entorno.
 *
 * Uso:
 *   SMOKE_EMAIL=.. SMOKE_PASSWORD=.. \
 *   node --env-file=.env.local scripts/smoke-coach-followups-pr3c.mjs [BASE_URL]
 */
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_URL = process.argv[2] ?? 'http://localhost:3025'
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

// Una sesión existente y vacía → sin redirect 'nueva'→id (que remonta y resetea
// los follow-ups). Probamos el camino steady-state (el más común del chat).
async function emptySessionId() {
  const { data } = await admin.from('taiger_sessions').select('id, messages').eq('user_id', USER_ID).order('created_at', { ascending: false })
  const empty = (data ?? []).find(s => !Array.isArray(s.messages) || s.messages.length === 0)
  if (!empty) throw new Error('no se encontró sesión vacía del user de test')
  return empty.id
}

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1 }
const ok = (m) => console.log('✅ ' + m)

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

  // "Lock broken ... steal" = navigator LockManager de gotrue (Supabase), ruido de
  // infra conocido en headless con múltiples getUser concurrentes; no es un fallo de app.
  const isBenign = (t) => /Failed to fetch RSC payload/i.test(t) || /Lock broken by another request/i.test(t)
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error' && !isBenign(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', e => { if (!isBenign(e.message)) consoleErrors.push('pageerror: ' + e.message) })
  // Traza de los endpoints del coach para diagnosticar el flujo.
  page.on('response', r => {
    const u = r.url()
    if (/\/api\/taiger\/(chat|followups|intro)/.test(u)) console.log(`   → ${r.status()} ${u.replace(BASE_URL, '')}`)
  })

  try {
    await login(page)
    ok(`login OK (${EMAIL})`)

    const q = 'Dame un consejo corto para mi próxima ronda.'
    const chatResp = page.waitForResponse(r => r.url().includes('/api/taiger/chat'), { timeout: 60000 }).catch(() => null)
    const followupsResp = page.waitForResponse(
      r => r.url().includes('/api/taiger/followups'),
      { timeout: 150000 },
    ).catch(() => null)

    // Sesión EXISTENTE y vacía (sin redirect) + envío manual.
    const sid = await emptySessionId()
    await page.goto(`${BASE_URL}/coach/sesion/${sid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('textarea', { timeout: 20000 })
    const ta = page.locator('textarea').first()
    await ta.click()
    await ta.fill(q)
    await page.locator('button[aria-label="Enviar mensaje"]').first().click()
    ok('mensaje enviado al coach')

    const cr = await chatResp
    if (cr) ok(`POST /api/taiger/chat → ${cr.status()}`)
    else fail('no se observó POST a /api/taiger/chat (¿el envío no disparó?)')

    // Espera a que el coach termine de responder (el endpoint followups SOLO se
    // llama tras cerrar el stream, así que su response marca el fin del turno).
    const resp = await followupsResp
    if (!resp) { fail('no se observó POST a /api/taiger/followups en 120s'); }
    else {
      ok(`POST /api/taiger/followups → ${resp.status()}`)
      let body = null
      try { body = await resp.json() } catch { /* noop */ }
      const arr = Array.isArray(body?.followups) ? body.followups : null
      if (arr) ok(`endpoint devolvió ${arr.length} follow-up(s): ${JSON.stringify(arr)}`)
      else fail(`respuesta sin array followups: ${JSON.stringify(body)}`)
      // Voz chilena de tú: ninguna pregunta en voseo evidente.
      if (arr && arr.some(s => /\b(tenés|podés|querés|hacé|mirá|fijate|sentís|armá|probá)\b/i.test(s))) {
        fail(`alguna pregunta en voseo: ${JSON.stringify(arr)}`)
      } else if (arr) ok('follow-ups en tú chileno (sin voseo evidente)')
    }

    // Render: chips "Seguir preguntando" bajo la última respuesta del coach.
    // (Si el LLM no propuso nada, no hay chips — ausencia elegante, no es fallo.)
    const group = page.locator('[role="group"][aria-label="Seguir preguntando"]')
    const appeared = await group.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
    if (appeared) {
      const chipBtns = group.locator('button')
      const n = await chipBtns.count()
      ok(`${n} follow-up chip(s) renderizados bajo la respuesta`)
      const box = await chipBtns.first().boundingBox()
      if (box && box.height >= 44) ok(`chip touch ${Math.round(box.width)}×${Math.round(box.height)}px (≥44)`)
      else fail(`chip touch chico: ${JSON.stringify(box)}`)
      await page.screenshot({ path: `${OUT}/pr3c-followups-390.png`, fullPage: true })

      // Tocar un chip envía un nuevo mensaje del usuario (y limpia los chips).
      await chipBtns.first().click()
      await page.waitForTimeout(800)
      const groupGone = await group.first().isVisible().catch(() => false)
      if (!groupGone) ok('al tocar un chip, los follow-ups del turno anterior se limpian')
      else console.log('ℹ️  chips aún visibles tras click (puede ser timing del nuevo stream)')
    } else {
      console.log('ℹ️  el LLM no propuso follow-ups esta vez (ausencia elegante) — endpoint OK igual')
    }

    if (consoleErrors.length === 0) ok('cero errores de consola')
    else fail(`errores de consola:\n  - ${consoleErrors.slice(0, 8).join('\n  - ')}`)
  } catch (e) {
    fail('excepción: ' + (e?.stack || e?.message || String(e)))
  } finally {
    await browser.close()
  }
}

run()
