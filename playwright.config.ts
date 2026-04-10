import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E config para Golfers+
 *
 * - Corre contra producción por defecto (PLAYWRIGHT_BASE_URL)
 * - Viewport mobile (iPhone 13) porque la app es mobile-first
 * - Screenshots en cada fallo para debugging
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // evitar colisiones con la BD compartida
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker para estado compartido predecible
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://golfersplus.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
        // Pixel 5 usa Chromium internamente, viewport 393x851
      },
    },
  ],
})
