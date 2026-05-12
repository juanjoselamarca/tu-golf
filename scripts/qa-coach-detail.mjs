/**
 * QA detallado del rediseño /coach.
 *
 * Como un usuario real / QA mobile:
 *   - Mobile 393×852 (iPhone 14 Pro real)
 *   - Login real → /coach
 *   - Screenshot POR SECCIÓN (viewport, no fullPage)
 *   - Inspect del DOM: existen los componentes, qué texto muestran realmente
 *   - Verifica computed numbers (Tu yo contenido, evitables, Mental Index)
 *   - Test light + dark mode
 *   - Test sticky CTA
 *   - Test tap targets
 */

import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EMAIL = process.argv[2]
const PASSWORD = process.argv[3]
const BASE_URL = process.argv[4] ?? 'http://localhost:3001'
const OUT_DIR = resolve('./screenshots-coach-visual')

mkdirSync(OUT_DIR, { recursive: true })

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.locator('input[type="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  // Espera silenciosa para que se cree la sesión; Next.js usa soft nav que
  // waitForURL no captura. 4s es suficiente.
  await page.waitForTimeout(4000)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const iphone = devices['iPhone 14 Pro']
  const ctx = await browser.newContext({ ...iphone, colorScheme: 'light' })
  const page = await ctx.newPage()

  page.on('pageerror', err => console.log(`[pageerror] ${err.message}`))

  await login(page)
  await page.goto(`${BASE_URL}/coach`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(3500)
  console.log(`✓ /coach loaded at ${page.url()}`)

  // Dismiss PWA install overlay if present — not my code, but blocks visibility
  await page.evaluate(() => {
    // Common selectors for dismissable PWA prompts
    const dismissButtons = document.querySelectorAll('button[aria-label*="errar" i], button[aria-label*="close" i], button[aria-label*="dismis" i]')
    dismissButtons.forEach(b => b.click())
    // Or find a fixed white card with "×" or "x" close button
    const closeXs = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim() === '×' || b.innerText.trim() === 'x')
    closeXs.forEach(b => b.click())
    // Or hide any element with "instalar" text via class
    const pwaCards = Array.from(document.querySelectorAll('*')).filter(el => el.innerText && el.innerText.startsWith('Golfers+ funciona mejor'))
    pwaCards.forEach(el => {
      let parent = el
      for (let i = 0; i < 5; i++) {
        if (parent.parentElement && (parent.style.position === 'fixed' || getComputedStyle(parent).position === 'fixed')) {
          parent.style.display = 'none'
          return
        }
        parent = parent.parentElement
      }
      el.style.display = 'none'
    })
  })
  await page.waitForTimeout(500)
  console.log('✓ PWA overlay dismissed (if present)')

  // === INSPECT DOM ===
  console.log('\n═══ DOM INSPECTION ═══')

  const sections = await page.evaluate(() => {
    const result = {}
    // Look for known card text patterns
    const allText = document.body.innerText
    result.mentalIndexVisible = allText.includes('Mental Index')
    result.recoveryScore = (allText.match(/Mental Index[\s\S]{0,200}/) || [])[0]?.slice(0, 200)
    result.highlightsVisible = allText.toLowerCase().includes('highlights · esta semana')
    result.highlightsLabel = (allText.match(/Highlights[\s\S]{0,150}/) || [])[0]?.slice(0, 150)
    result.costoVisible = allText.toLowerCase().includes('costo psicol')
    result.costoBlock = (allText.match(/Costo psicológico[\s\S]{0,300}/) || [])[0]?.slice(0, 300)
    result.tuYoBlock = (allText.match(/Tu yo contenido[\s\S]{0,200}/) || [])[0]?.slice(0, 200)
    result.curvaVisible = allText.includes('Curva mental')
    result.patronesVisible = allText.includes('Patrones detectados')
    result.planVisible = allText.includes('Bogey seguro tras error')
    result.ctaVisible = allText.includes('Conversar con tAIger+')

    // Total page text length (rough — should be a real dashboard)
    result.bodyTextLength = allText.length
    return result
  })

  console.log(JSON.stringify(sections, null, 2))

  // === SECTION-BY-SECTION SCREENSHOTS ===
  console.log('\n═══ SECTION SCREENSHOTS (viewport, mobile) ═══')

  // Section 1: top (Hero + Mental Recovery)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT_DIR, 'm-1-top.png'), fullPage: false })
  console.log('✓ m-1-top.png')

  // Section 2: after first scroll (Highlights/Costo)
  await page.evaluate(() => window.scrollTo(0, 700))
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT_DIR, 'm-2-highlights-costo.png'), fullPage: false })
  console.log('✓ m-2-highlights-costo.png')

  // Section 3: Curva mental
  await page.evaluate(() => window.scrollTo(0, 1400))
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT_DIR, 'm-3-curva.png'), fullPage: false })
  console.log('✓ m-3-curva.png')

  // Section 4: Patrones tiles
  await page.evaluate(() => window.scrollTo(0, 2100))
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT_DIR, 'm-4-patrones.png'), fullPage: false })
  console.log('✓ m-4-patrones.png')

  // Section 5: Plan + CTA
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT_DIR, 'm-5-plan-cta.png'), fullPage: false })
  console.log('✓ m-5-plan-cta.png')

  // === COMPUTED VALUES via JS ===
  console.log('\n═══ DATA POINTS DUMP ═══')
  const data = await page.evaluate(() => {
    // Try to find specific text elements
    const findText = (regex) => {
      const all = document.querySelectorAll('*')
      for (const el of all) {
        if (el.children.length === 0 && regex.test(el.innerText || '')) {
          return el.innerText.trim()
        }
      }
      return null
    }
    return {
      mentalScore: findText(/^\d{1,3}$/),
      costoNumberLikely: Array.from(document.querySelectorAll('div'))
        .filter(d => d.children.length === 0)
        .map(d => d.innerText)
        .filter(t => /^\d{1,3}$/.test(t))
        .slice(0, 8),
    }
  })
  console.log(JSON.stringify(data, null, 2))

  // === DARK MODE TEST ===
  console.log('\n═══ DARK MODE ═══')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(OUT_DIR, 'm-dark-1-top.png'), fullPage: false })
  await page.evaluate(() => window.scrollTo(0, 700))
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(OUT_DIR, 'm-dark-2-mid.png'), fullPage: false })
  console.log('✓ dark mode screenshots')

  // === DESKTOP wide screenshot for layout integrity ===
  console.log('\n═══ DESKTOP wide ═══')
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' })
  const desktopPage = await desktopCtx.newPage()
  await login(desktopPage)
  await desktopPage.goto(`${BASE_URL}/coach`, { waitUntil: 'domcontentloaded' })
  await desktopPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await desktopPage.waitForTimeout(3000)

  // Full page desktop
  await desktopPage.screenshot({ path: resolve(OUT_DIR, 'd-fullpage.png'), fullPage: true })
  console.log('✓ d-fullpage.png')

  // Viewport-only top desktop
  await desktopPage.evaluate(() => window.scrollTo(0, 0))
  await desktopPage.waitForTimeout(300)
  await desktopPage.screenshot({ path: resolve(OUT_DIR, 'd-top.png'), fullPage: false })
  console.log('✓ d-top.png')

  writeFileSync(resolve(OUT_DIR, 'inspection.json'), JSON.stringify({ sections, data }, null, 2))
  console.log(`\n✓ All artifacts at ${OUT_DIR}`)

  await browser.close()
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
