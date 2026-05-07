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
  testIgnore: ['**/helpers/**', '**/global-setup.ts'],
  fullyParallel: false, // evitar colisiones con la BD compartida
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker para estado compartido predecible
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // global-setup corre login UI una vez y guarda storageState en e2e/.auth/user.json
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://golfersplus.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Proyecto anónimo — NO carga storageState. Tests smoke públicos.
    {
      name: 'mobile-chromium',
      testMatch: ['smoke.spec.ts', 'smoke-public-pages.spec.ts', 'rondas-existentes.spec.ts'],
      use: {
        ...devices['Pixel 5'],
      },
    },
    // Proyecto autenticado — carga storageState del global-setup.
    {
      name: 'mobile-chromium-auth',
      testMatch: ['authenticated-flow.spec.ts', 'ronda-flow.spec.ts', 'ronda-scoring.spec.ts', 'score-grupo-finalize-missing.spec.ts'],
      use: {
        ...devices['Pixel 5'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
})
