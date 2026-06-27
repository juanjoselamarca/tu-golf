/**
 * Render del chat del coach (PR4 lavado dark navy) — estado vacío + conversación.
 * NO gasta LLM: siembra una sesión con un intercambio fijo. Screenshots 390px.
 * Uso: SMOKE_EMAIL=.. SMOKE_PASSWORD=.. SMOKE_USER=.. node --env-file=.env.local scripts/render-coach-chat-pr4.mjs [BASE_URL]
 */
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_URL = process.argv[2] ?? 'http://localhost:3030'
const EMAIL = process.env.SMOKE_EMAIL, PASSWORD = process.env.SMOKE_PASSWORD, USER_ID = process.env.SMOKE_USER
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const OUT = resolve('render-out')

async function emptySession() {
  const { data } = await admin.from('taiger_sessions').select('id, messages').eq('user_id', USER_ID).order('created_at', { ascending: false })
  return (data ?? []).find(s => !Array.isArray(s.messages) || s.messages.length === 0)?.id
}
async function seedConversation() {
  const { data } = await admin.from('taiger_sessions').insert({
    user_id: USER_ID, session_type: 'continuous', messages: [
      { role: 'assistant', content: 'Test, hace 4 días jugaste 88 en Los Leones. Tu back nine se cae: +10 contra +4 del front. ¿Repasamos qué pasó después del bogey del 12?' },
      { role: 'user', content: '¿Cómo trabajo la espiral post-bogey?' },
      { role: 'assistant', content: 'Lo más útil: cuando un hoyo se complique, **juega al bogey** en vez de forzar el par. Tu patrón muestra que tras un bogey encadenas otro el 62% de las veces. Esta semana, en cada bogey, marca mentalmente "reset" antes del próximo tee: respira, palo seguro, centro del green. Un bogey tranquilo corta la sangría.' },
    ],
  }).select('id').single()
  return data.id
}

const run = async () => {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...(devices['iPhone 14 Pro'] ?? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }) })
  await ctx.addInitScript(() => { try { localStorage.setItem('pwa-banner-dismissed', String(Date.now())) } catch {} })
  const page = await ctx.newPage()
  let convId = null
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
    await page.locator('button[type="submit"], button:has-text("Iniciar")').first().click()
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 20000 })

    const sid = await emptySession()
    await page.goto(`${BASE_URL}/coach/sesion/${sid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="taiger-opener"]', { timeout: 20000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/pr4-empty-390.png`, fullPage: true })
    console.log('✅ estado vacío')

    convId = await seedConversation()
    await page.goto(`${BASE_URL}/coach/sesion/${convId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.taiger-md', { timeout: 20000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/pr4-conversation-390.png`, fullPage: true })
    console.log('✅ conversación')
  } catch (e) {
    console.error('❌ ' + (e?.stack || e?.message))
    process.exitCode = 1
  } finally {
    await browser.close()
    if (convId) await admin.from('taiger_sessions').delete().eq('id', convId)
  }
}
run()
