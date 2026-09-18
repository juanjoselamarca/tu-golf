import { test, expect } from '@playwright/test'

/**
 * Smoke tests — verificar que páginas críticas cargan sin errores 500
 * y que no hay crashes en runtime después del refactor formato/modo.
 */

test.describe('Smoke tests — páginas críticas cargan', () => {
  test('Home carga sin errores', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`)
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await expect(page).toHaveTitle(/Golfers/i)
    expect(errors).toEqual([])
  })

  test('Página /en-vivo carga', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/en-vivo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    expect(errors).toEqual([])
  })

  test('Página de creación /ronda-libre/nueva redirige a login o carga formulario', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) errors.push(`${res.status()} ${res.url()}`)
    })

    await page.goto('/ronda-libre/nueva', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // Debe estar o en /login o en /ronda-libre/nueva (depende de auth)
    const url = page.url()
    expect(url).toMatch(/\/(login|ronda-libre\/nueva)/)
    expect(errors).toEqual([])
  })
})
