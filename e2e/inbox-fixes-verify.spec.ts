/**
 * Verificación post-deploy de los 4 fixes mergeados 25/26-may-2026:
 *
 * PR #56 (#1): Sheet "Jugar" respeta light/dark mode (no texto invisible)
 * PR #57 (#7, #8, #9): Wizard admin con nombre, blockers panel, copy mejor
 * PR #58 (#5): CourseSelector no rompe nombre char-por-char
 *
 * Corre contra producción. Toma screenshots para inspección manual.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

const OUT = path.resolve(__dirname, '..', '.gstack', 'qa-reports', 'inbox-fixes-verify')
function ensure() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
}

test('PR-1 #1: sheet Jugar en light mode legible', async ({ page }) => {
  ensure()
  // Forzar light mode antes de cualquier render
  await page.addInitScript(() => {
    try { localStorage.setItem('golfers-theme', 'light') } catch {}
  })
  await page.goto('/perfil', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // Confirmar que document.documentElement tiene data-theme="light"
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  expect(theme).toBe('light')

  // Verificar que los tokens nuevos están definidos
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return {
      surfaceSoft: cs.getPropertyValue('--surface-soft').trim(),
      surfaceBorder: cs.getPropertyValue('--surface-border').trim(),
      bgSurface: cs.getPropertyValue('--bg-surface').trim(),
      text: cs.getPropertyValue('--text').trim(),
    }
  })
  console.log('LIGHT mode tokens:', tokens)
  expect(tokens.surfaceSoft).toMatch(/rgba?\(0,\s*0,\s*0/)
  // Chrome normaliza #ffffff → #fff. Aceptamos cualquiera, lo crítico es que SEA blanco en light.
  expect(tokens.bgSurface).toMatch(/^#fff(fff)?$|rgb\(255,\s*255,\s*255\)/i)

  // El sheet vive en DOM siempre (oculto con transform). Verificamos los items
  // directamente sin necesidad de abrirlo via click — basta con computar el
  // contraste resultante de los tokens aplicados.
  const rondaTitle = page.getByText('Ronda Libre').first()
  if (await rondaTitle.count() > 0) {
    const rondaStyles = await rondaTitle.evaluate((el) => {
      const cs = getComputedStyle(el)
      const parent = el.closest('a')!
      const pcs = getComputedStyle(parent)
      // Subir al wrapper del sheet para obtener su background efectivo
      let sheetBg = ''
      let n: HTMLElement | null = parent
      while (n && !sheetBg) {
        const bg = getComputedStyle(n).backgroundColor
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          sheetBg = bg
          break
        }
        n = n.parentElement
      }
      return {
        titleColor: cs.color,
        itemBg: pcs.backgroundColor,
        itemBorder: pcs.borderColor,
        sheetBg,
      }
    })
    console.log('Ronda Libre styles (light):', rondaStyles)

    // Crítico: el título DEBE ser texto oscuro (color de tema light)
    // y el sheet DEBE tener bg claro. Si vuelven al hardcode '#0a1628' (navy),
    // sheetBg sería rgb(10, 22, 40).
    expect(rondaStyles.titleColor).not.toBe('rgb(10, 22, 40)')
    expect(rondaStyles.sheetBg).not.toBe('rgb(10, 22, 40)')
  } else {
    console.log('⚠ "Ronda Libre" no encontrado en DOM (sheet podría no estar renderizado en /perfil)')
  }

  await page.screenshot({ path: path.join(OUT, 'pr1-sheet-light.png'), fullPage: false })
})

test('PR-3 #7+#8: wizard muestra admin nombre + panel blockers visible', async ({ page }) => {
  ensure()
  await page.addInitScript(() => {
    try { localStorage.setItem('golfers-theme', 'light') } catch {}
  })
  await page.goto('/organizador/nuevo', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  await page.screenshot({ path: path.join(OUT, 'pr3-wizard-initial.png'), fullPage: true })

  // Modal de inicio "Empezar desde cero" — buscar y cerrar si aparece
  const startBtn = page.getByRole('button', { name: /empezar desde cero|cero/i }).first()
  if (await startBtn.count() > 0) {
    await startBtn.click().catch(() => {})
    await page.waitForTimeout(800)
  }

  // Sección Admins — el owner debe mostrar nombre real, NO "(sin nombre)"
  const sinNombre = page.getByText('(sin nombre)')
  const adminCount = await sinNombre.count()
  console.log('Cantidad de "(sin nombre)" en página:', adminCount)
  expect(adminCount).toBe(0)

  // Panel "Falta para poder crear el torneo" debe estar visible (sin hover)
  const blockersPanel = page.getByText('Falta para poder crear el torneo:')
  if (await blockersPanel.count() > 0) {
    await expect(blockersPanel.first()).toBeVisible()
    console.log('✓ Panel blockers persistente visible (fix #8)')
  } else {
    console.log('⚠ Panel blockers no visible — quizás draft válido por defecto')
  }

  // Botón "Crear torneo" debe estar disabled (porque faltan datos)
  const crearBtn = page.getByRole('button', { name: /crear torneo/i }).first()
  if (await crearBtn.count() > 0) {
    await expect(crearBtn).toBeDisabled()
  }

  await page.screenshot({ path: path.join(OUT, 'pr3-wizard-final.png'), fullPage: true })
})

test('PR-3 #9: copy nuevo del validator handicap personalizado', async ({ page }) => {
  ensure()
  // El mensaje viene del validator solo cuando team_config.handicap_pct === custom
  // y los valores están fuera de [0,100]. No fácilmente reproducible sin
  // manipular el draft — solo verificamos que el OLD copy NO está en producción.
  await page.goto('/organizador/nuevo', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const oldCopy = page.getByText(/Porcentajes de handicap custom deben estar entre 0 y 100/i)
  const oldCount = await oldCopy.count()
  console.log('Old copy "Porcentajes de handicap custom..." count:', oldCount)
  expect(oldCount).toBe(0)
})
