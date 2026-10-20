import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke de páginas públicas contra el deploy real (`npm run test:e2e:smoke`, job e2e-smoke de ci.yml). Es lo único
 * que corre contra prod: anónimo, sin login, sin global-setup y sin tocar la base. Todo lo demás va por
 * playwright.config.ts contra la app local y la base de pruebas.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['smoke.spec.ts', 'smoke-public-pages.spec.ts'],
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://golfersplus.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Pixel 5'],
  },
})
