// Auditoría visual del sistema de tema en producción.
// 7 pantallas × 2 modos (light/dark) × 2 viewports (desktop/mobile)
// = 28 screenshots + reporte de contraste por elemento.
//
// Output: docs/audit-screenshots/<timestamp>/
// Uso: node scripts/audit-visual-theme.mjs

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const BASE = 'https://golfersplus.vercel.app'
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = path.join(process.cwd(), 'docs', 'audit-screenshots', TS)

const PAGES = [
  { slug: 'home',        url: '/' },
  { slug: 'login',       url: '/login' },
  { slug: 'register',    url: '/register' },
  { slug: 'recuperar',   url: '/recuperar' },
  { slug: 'leaderboard', url: '/leaderboard' },
  { slug: 'ranking',     url: '/ranking' },
  { slug: 'dashboard',   url: '/dashboard' },  // redirige a /login si no auth
]

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800,  isMobile: false },
  { name: 'mobile',  width: 390,  height: 844,  isMobile: true  },
]

const MODES = ['light', 'dark']

// WCAG luminance + contrast ratio
function parseRgb(rgbStr) {
  const m = rgbStr.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const parts = m[1].split(',').map(p => parseFloat(p.trim()))
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
}

function relLuminance({ r, g, b }) {
  const linearize = c => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatio(rgb1, rgb2) {
  const L1 = relLuminance(rgb1)
  const L2 = relLuminance(rgb2)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

async function inspectContrast(page) {
  // Para cada elemento de texto visible, extrae color, bg efectivo, ratio
  const issues = await page.evaluate(() => {
    function getEffectiveBg(el) {
      let cur = el
      while (cur) {
        const cs = getComputedStyle(cur)
        const bg = cs.backgroundColor
        // si tiene bg no transparente, usar
        const m = bg.match(/rgba?\(([^)]+)\)/)
        if (m) {
          const parts = m[1].split(',').map(p => parseFloat(p.trim()))
          const a = parts[3] ?? 1
          if (a > 0.5) return bg
        }
        cur = cur.parentElement
      }
      return 'rgb(255,255,255)' // fallback
    }

    const TEXT_TAGS = ['H1','H2','H3','H4','H5','H6','P','SPAN','A','BUTTON','LABEL','LI','TD','TH','SMALL','STRONG','EM','DIV']
    const out = []
    const all = document.querySelectorAll('*')
    for (const el of all) {
      if (!TEXT_TAGS.includes(el.tagName)) continue
      // solo nodos directos con texto
      const txt = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim())
        .join(' ')
        .trim()
      if (!txt || txt.length < 2) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 4 || rect.height < 4) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.3) continue
      const fg = cs.color
      const bg = getEffectiveBg(el)
      const fontSize = parseFloat(cs.fontSize)
      const fontWeight = parseInt(cs.fontWeight)
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)
      out.push({
        tag: el.tagName,
        text: txt.slice(0, 60),
        fg,
        bg,
        fontSize,
        fontWeight,
        isLarge,
      })
    }
    return out
  })

  // calcular ratios y filtrar fails
  const fails = []
  const warnings = []
  const seen = new Set()
  for (const item of issues) {
    const fg = parseRgb(item.fg)
    const bg = parseRgb(item.bg)
    if (!fg || !bg) continue
    const ratio = contrastRatio(fg, bg)
    const threshold = item.isLarge ? 3 : 4.5
    if (ratio < threshold) {
      const key = `${item.fg}|${item.bg}|${item.tag}`
      if (seen.has(key)) continue
      seen.add(key)
      const entry = { ...item, ratio: Number(ratio.toFixed(2)), threshold }
      if (ratio < 3) fails.push(entry)
      else warnings.push(entry)
    }
  }
  return { fails, warnings }
}

async function audit() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const report = []

  for (const vp of VIEWPORTS) {
    for (const mode of MODES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
      })
      const page = await ctx.newPage()

      // setear theme via localStorage (necesita una visita previa al dominio)
      await page.goto(BASE + '/?_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.evaluate(m => localStorage.setItem('golfers-theme', m), mode)

      for (const pg of PAGES) {
        const slug = `${pg.slug}-${vp.name}-${mode}`
        try {
          await page.goto(BASE + pg.url + '?_=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 })
          await page.waitForTimeout(1000) // anti-FOUC + animations

          const screenshotPath = path.join(OUT, `${slug}.png`)
          await page.screenshot({ path: screenshotPath, fullPage: false })

          const url = page.url()
          const finalPath = new URL(url).pathname
          const redirected = finalPath !== pg.url

          const { fails, warnings } = await inspectContrast(page)

          const entry = {
            page: pg.slug,
            viewport: vp.name,
            mode,
            requestedPath: pg.url,
            finalPath,
            redirected,
            screenshot: path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/'),
            failsCount: fails.length,
            warningsCount: warnings.length,
            fails: fails.slice(0, 10),
            warnings: warnings.slice(0, 10),
          }
          report.push(entry)
          console.log(`${slug.padEnd(28)} → ${redirected ? '↪ ' + finalPath : 'OK'}, fails: ${fails.length}, warn: ${warnings.length}`)
        } catch (e) {
          console.error(`${slug} ERROR: ${e.message}`)
          report.push({ page: pg.slug, viewport: vp.name, mode, error: e.message })
        }
      }
      await ctx.close()
    }
  }

  await browser.close()

  await writeFile(
    path.join(OUT, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  )

  // resumen markdown
  const totalFails = report.reduce((s, r) => s + (r.failsCount || 0), 0)
  const totalWarn = report.reduce((s, r) => s + (r.warningsCount || 0), 0)

  const md = [
    '# Auditoría visual + contraste WCAG — ' + TS,
    '',
    `**Producción:** ${BASE}`,
    `**Pantallas:** ${PAGES.length} × ${MODES.length} modos × ${VIEWPORTS.length} viewports = ${report.length}`,
    `**Fails de contraste totales:** ${totalFails}`,
    `**Warnings (texto grande borderline):** ${totalWarn}`,
    '',
    '## Por pantalla',
    '',
    '| Pantalla | Viewport | Modo | Path final | Fails | Warnings |',
    '|---|---|---|---|---|---|',
    ...report.map(r => `| ${r.page} | ${r.viewport} | ${r.mode} | ${r.finalPath || 'ERROR'} | ${r.failsCount ?? '?'} | ${r.warningsCount ?? '?'} |`),
    '',
    '## Detalle de fails (primeros 10 por pantalla)',
    '',
  ]
  for (const r of report) {
    if (!r.fails || !r.fails.length) continue
    md.push(`### ${r.page} — ${r.viewport} — ${r.mode}`)
    md.push('| Tag | Texto | FG | BG | Ratio |')
    md.push('|---|---|---|---|---|')
    for (const f of r.fails) {
      md.push(`| ${f.tag} | ${f.text.replace(/\|/g, '\\|')} | \`${f.fg}\` | \`${f.bg}\` | **${f.ratio}** |`)
    }
    md.push('')
  }

  await writeFile(path.join(OUT, 'report.md'), md.join('\n'), 'utf-8')

  console.log(`\nReporte guardado en: ${OUT}`)
  console.log(`  - report.json`)
  console.log(`  - report.md`)
  console.log(`  - ${report.length} screenshots`)
  console.log(`\nResumen: ${totalFails} fails, ${totalWarn} warnings`)
}

audit().catch(e => { console.error(e); process.exit(1) })
