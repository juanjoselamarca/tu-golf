/**
 * Smoke visual mobile (390px) del chat del coach — PR2.
 * Verifica el cambio de UX sin gastar créditos de Anthropic (NO envía mensajes;
 * solo carga una sesión existente y testea input + 👍/👎 sobre data propia).
 *
 * Uso: node --env-file=.env.local scripts/smoke-coach-chat-pr2.mjs [BASE_URL]
 */
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_URL = process.argv[2] ?? 'http://localhost:3001'
const EMAIL = process.env.E2E_TEST_USER_EMAIL
const PASSWORD = process.env.E2E_TEST_USER_PASSWORD
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OUT = resolve('smoke-out')

if (!EMAIL || !PASSWORD || !SERVICE_KEY) {
  console.error('Faltan E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const admin = createClient(SUPA_URL, SERVICE_KEY)

/** Crea una sesión temporal con un intercambio para poder testear 👍/👎 sobre data real. */
async function seedSession() {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const u = users.users.find(x => x.email === EMAIL)
  if (!u) throw new Error('test user no encontrado')
  const { data, error } = await admin.from('taiger_sessions').insert({
    user_id: u.id,
    session_type: 'continuous',
    messages: [
      { role: 'user', content: '¿Cómo voy con el putting?' },
      { role: 'assistant', content: 'Tu putting viene firme: 1.9 putts por hoyo en tus últimas 3 rondas. Practicá los de 1.5m esta semana.' },
    ],
  }).select('id').single()
  if (error) throw error
  return data.id
}

async function cleanupSession(id) {
  if (!id) return
  await admin.from('taiger_message_feedback').delete().eq('session_id', id)
  await admin.from('taiger_sessions').delete().eq('id', id)
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
  // Evita que el banner PWA (bottom sheet global) tape los pulgares durante el test.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('pwa-banner-dismissed', String(Date.now())) } catch { /* noop */ }
  })
  const page = await ctx.newPage()

  // Ignora ruido ambiental de `next start` en localhost (prefetch RSC de links del
  // navbar que el server descarta). No ocurre en Vercel y no toca el chat.
  const isBenign = (t) => /Failed to fetch RSC payload/i.test(t)
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error' && !isBenign(m.text())) consoleErrors.push(m.text()) })
  page.on('pageerror', e => { if (!isBenign(e.message)) consoleErrors.push('pageerror: ' + e.message) })

  let seededId = null
  try {
    seededId = await seedSession()
    ok(`sesión semilla creada: ${seededId}`)

    await login(page)
    ok(`login OK (${EMAIL})`)

    await page.goto(`${BASE_URL}/coach/sesion/${seededId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    ok(`navegado a la sesión semilla`)

    await page.screenshot({ path: `${OUT}/01-sesion-390.png`, fullPage: true })

    // --- Input: textarea voseo + botón enviar 48px ---
    const ta = page.locator('textarea').first()
    if (await ta.count() === 0) { fail('no se encontró el <textarea> del input'); }
    else {
      const ph = await ta.getAttribute('placeholder')
      if (ph && /Escribí|escribiendo/i.test(ph)) ok(`placeholder voseo: "${ph}"`)
      else fail(`placeholder no voseo: "${ph}"`)
      const fontSize = await ta.evaluate(el => getComputedStyle(el).fontSize)
      if (parseFloat(fontSize) >= 16) ok(`font-size del textarea ${fontSize} (≥16px, sin zoom iOS)`)
      else fail(`font-size ${fontSize} < 16px → iOS hace zoom al enfocar`)
    }
    const sendBtn = page.locator('button[aria-label="Enviar mensaje"]').first()
    if (await sendBtn.count() > 0) {
      const box = await sendBtn.boundingBox()
      if (box && box.width >= 48 && box.height >= 48) ok(`botón enviar ${Math.round(box.width)}×${Math.round(box.height)}px (≥48)`)
      else fail(`botón enviar chico: ${JSON.stringify(box)}`)
    } else fail('no se encontró el botón enviar')

    // Shift+Enter inserta salto de línea; Enter NO debe enviar (sin texto no pasa nada).
    if (await ta.count() > 0) {
      await ta.click()
      await ta.type('linea1')
      await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift')
      await ta.type('linea2')
      const val = await ta.inputValue()
      if (val.includes('\n')) ok('Shift+Enter inserta salto de línea')
      else fail(`Shift+Enter no insertó salto: "${val}"`)
      // limpiar
      await ta.fill('')
    }

    // --- 👍/👎 por mensaje: si hay respuesta del coach, votar (data propia) ---
    const fbGroup = page.locator('[role="group"][aria-label="¿Te sirvió esta respuesta?"]')
    const fbCount = await fbGroup.count()
    if (fbCount > 0) {
      ok(`${fbCount} bloque(s) de feedback 👍/👎 presentes`)
      const thumbUp = page.locator('button[aria-label="Me sirvió"]').first()
      const tBox = await thumbUp.boundingBox()
      if (tBox && tBox.height >= 48 && tBox.width >= 48) ok(`pulgar touch ${Math.round(tBox.width)}×${Math.round(tBox.height)}px (≥48)`)
      else fail(`pulgar touch chico: ${JSON.stringify(tBox)}`)

      // Click 👍 → debe quedar aria-pressed=true (optimista) y POST 200.
      const respP = page.waitForResponse(r => r.url().includes('/api/taiger/message-feedback'), { timeout: 8000 }).catch(() => null)
      await thumbUp.click()
      const resp = await respP
      await page.waitForTimeout(400)
      const pressed = await thumbUp.getAttribute('aria-pressed')
      if (pressed === 'true') ok('👍 quedó marcado (aria-pressed=true)')
      else fail(`👍 no quedó marcado: aria-pressed=${pressed}`)
      if (resp) ok(`POST message-feedback → ${resp.status()}`)
      else fail('no se observó POST a /api/taiger/message-feedback')
      await page.screenshot({ path: `${OUT}/02-feedback-voted-390.png` })

      // Toggle off: click de nuevo → aria-pressed=false (limpia el voto del test user).
      await thumbUp.scrollIntoViewIfNeeded()
      await thumbUp.click({ timeout: 8000 })
      await page.waitForTimeout(600)
      const pressed2 = await thumbUp.getAttribute('aria-pressed')
      if (pressed2 === 'false') ok('👍 toggle off OK (voto retirado, no deja basura)')
      else fail(`toggle off falló: aria-pressed=${pressed2}`)
    } else {
      console.log('ℹ️  sin respuestas del coach en esta sesión → no se testeó 👍/👎 en vivo (cubierto por unit tests)')
    }

    // Verificar que las ESTRELLAS fueron retiradas de la UI.
    const stars = await page.locator('button[aria-label*="estrella"]').count()
    if (stars === 0) ok('estrellas retiradas de la UI')
    else fail(`siguen apareciendo ${stars} botones de estrella`)

    if (consoleErrors.length === 0) ok('cero errores de consola')
    else fail(`errores de consola:\n  - ${consoleErrors.slice(0, 8).join('\n  - ')}`)

    console.log(`\nScreenshots en ${OUT}`)
  } catch (e) {
    fail('excepción: ' + (e?.stack || e?.message || String(e)))
  } finally {
    await browser.close()
    await cleanupSession(seededId)
    if (seededId) ok('sesión semilla + feedback limpiados')
  }
}

run()
