/**
 * Regresión bug #2 inbox 25-may (id BD d7efccd9-1533): "wizard organizar
 * torneo se ve oscuro y mal" en dark mode.
 *
 * Root cause: el wizard /organizador/nuevo, componentes tournament-draft
 * (AssistantPanel/Input/Messages) y vistas torneo/en-vivo usaban 4 tokens
 * CSS NUNCA definidos en globals.css:
 *   --card-bg, --text-primary, --text-secondary, --brand-gold
 *
 * Como caían siempre al fallback hardcoded (#f9fafb, #111827, #4b5563, #c4992a),
 * en DARK mode el resultado era texto oscuro (#111827) sobre bg también oscuro
 * (porque TournamentDraftEditor tiene un <style> con
 *   .draft-editor-form > div { background: var(--bg-surface) !important }
 * que sí responde al tema) → texto invisible.
 *
 * Fix: aliases en :root de globals.css resolviendo lazy a los tokens de tema.
 *
 * Este spec asegura que NUNCA vuelvan a estar undefined.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

const OUT = path.resolve(__dirname, '..', '.gstack', 'qa-reports', 'wizard-dark-diag')
function ensure() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
}

async function readTokens(page: any) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const get = (k: string) => cs.getPropertyValue(k).trim()
    return {
      cardBg:        get('--card-bg'),
      textPrimary:   get('--text-primary'),
      textSecondary: get('--text-secondary'),
      brandGold:     get('--brand-gold'),
      bg:            get('--bg'),
      bgSurface:     get('--bg-surface'),
      text:          get('--text'),
    }
  })
}

function rgbLum(rgb: string): number {
  const m = rgb.match(/rgba?\(([^)]+)\)/)
  if (!m) return -1
  const [r, g, b] = m[1].split(',').map((s) => parseFloat(s.trim()))
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

test('wizard tokens: --card-bg/--text-primary/--text-secondary/--brand-gold definidos en LIGHT', async ({ page }) => {
  ensure()
  await page.addInitScript(() => {
    try { localStorage.setItem('golfers-theme', 'light') } catch {}
  })
  await page.goto('/organizador/nuevo', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  expect(theme).toBe('light')

  const tokens = await readTokens(page)
  console.log('LIGHT tokens:', tokens)

  // Los 4 tokens del bug NO pueden estar vacíos
  expect(tokens.cardBg, '--card-bg debe estar definido').not.toBe('')
  expect(tokens.textPrimary, '--text-primary debe estar definido').not.toBe('')
  expect(tokens.textSecondary, '--text-secondary debe estar definido').not.toBe('')
  expect(tokens.brandGold, '--brand-gold debe estar definido').not.toBe('')

  // En light, card-bg debe resolver a un valor CLARO (lum>0.8)
  // Convertimos hex a rgb para luminancia
  const cardBgRgb = await page.evaluate(() => {
    const tmp = document.createElement('div')
    tmp.style.color = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim()
    document.body.appendChild(tmp)
    const c = getComputedStyle(tmp).color
    tmp.remove()
    return c
  })
  expect(rgbLum(cardBgRgb), 'card-bg en light debe ser claro').toBeGreaterThan(0.8)
})

test('wizard tokens: definidos en DARK con valores theme-aware correctos', async ({ page }) => {
  ensure()
  await page.addInitScript(() => {
    try { localStorage.setItem('golfers-theme', 'dark') } catch {}
  })
  await page.goto('/organizador/nuevo', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  expect(theme).toBe('dark')

  const tokens = await readTokens(page)
  console.log('DARK tokens:', tokens)

  expect(tokens.cardBg, '--card-bg debe estar definido en dark').not.toBe('')
  expect(tokens.textPrimary, '--text-primary debe estar definido en dark').not.toBe('')
  expect(tokens.textSecondary, '--text-secondary debe estar definido en dark').not.toBe('')
  expect(tokens.brandGold, '--brand-gold debe estar definido en dark').not.toBe('')

  // En dark, card-bg debe resolver a un valor OSCURO (lum<0.2)
  const cardBgRgb = await page.evaluate(() => {
    const tmp = document.createElement('div')
    tmp.style.color = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim()
    document.body.appendChild(tmp)
    const c = getComputedStyle(tmp).color
    tmp.remove()
    return c
  })
  expect(rgbLum(cardBgRgb), 'card-bg en dark debe ser oscuro').toBeLessThan(0.2)

  // CRÍTICO: en dark, text-primary debe ser CLARO (lum>0.7) para legibilidad
  const textPrimaryRgb = await page.evaluate(() => {
    const tmp = document.createElement('div')
    tmp.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()
    document.body.appendChild(tmp)
    const c = getComputedStyle(tmp).color
    tmp.remove()
    return c
  })
  expect(
    rgbLum(textPrimaryRgb),
    'text-primary en dark debe ser CLARO (sino: texto invisible sobre card oscuro)'
  ).toBeGreaterThan(0.7)
})
