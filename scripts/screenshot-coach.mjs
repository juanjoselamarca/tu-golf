/**
 * Toma screenshots del rediseño /coach con un user de test autenticado.
 * Desktop (1280×900) + Mobile (393×852 iPhone 14 Pro).
 */

import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const EMAIL = process.argv[2]
const PASSWORD = process.argv[3]
const BASE_URL = process.argv[4] ?? 'http://localhost:3001'
const OUT_DIR = resolve('./screenshots-coach-visual')

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node screenshot-coach.mjs <email> <password> [base_url]')
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  console.log(`→ Login page loaded at ${page.url()}`)

  // Try multiple selectors for email/password fields
  const emailInput = await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
  const passwordInput = await page.locator('input[type="password"], input[name="password"]').first()

  await emailInput.fill(EMAIL)
  await passwordInput.fill(PASSWORD)
  console.log('→ Credentials filled')

  // Submit — find button
  await page.locator('button[type="submit"], button:has-text("Iniciar"), button:has-text("Entrar"), button:has-text("Sign in")').first().click()
  console.log('→ Submit clicked')

  // Wait for redirect to /coach or any non-login page
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }).catch(async () => {
    const text = await page.textContent('body').catch(() => '')
    console.error('Login did not redirect. Page text excerpt:', text.slice(0, 300))
    throw new Error('Login failed')
  })
  console.log(`✓ Logged in, current URL: ${page.url()}`)
}

async function captureCoach(page, label) {
  await page.goto(`${BASE_URL}/coach`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  // Wait extra for client-side data load
  await page.waitForTimeout(2500)

  const out = resolve(OUT_DIR, `coach-${label}.png`)
  await page.screenshot({ path: out, fullPage: true })
  console.log(`✓ Screenshot: ${out}`)

  // Also capture page-detected errors from console
  const html = await page.content()
  if (html.includes('Application error') || html.includes('500')) {
    console.warn('  ⚠ Page may have errored — check screenshot')
  }
  return out
}

async function main() {
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Out dir:  ${OUT_DIR}\n`)

  const browser = await chromium.launch({ headless: true })

  try {
    // Desktop session
    console.log('═══ DESKTOP (1280×900) ═══')
    const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const desktopPage = await desktopCtx.newPage()
    desktopPage.on('console', msg => msg.type() === 'error' && console.log(`  [console.error] ${msg.text()}`))
    desktopPage.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
    await login(desktopPage)
    await captureCoach(desktopPage, 'desktop')
    await desktopCtx.close()

    // Mobile session
    console.log('\n═══ MOBILE (iPhone 14 Pro 393×852) ═══')
    const iphone = devices['iPhone 14 Pro'] ?? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    const mobileCtx = await browser.newContext(iphone)
    const mobilePage = await mobileCtx.newPage()
    mobilePage.on('console', msg => msg.type() === 'error' && console.log(`  [console.error] ${msg.text()}`))
    mobilePage.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
    await login(mobilePage)
    await captureCoach(mobilePage, 'mobile')
    await mobileCtx.close()

    console.log(`\n✓ Screenshots ready in: ${OUT_DIR}`)
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
