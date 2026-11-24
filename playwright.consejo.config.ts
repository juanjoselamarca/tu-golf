import { defineConfig } from '@playwright/test'

/**
 * Recorridos del `/consejo` en modo pantalla (`e2e/consejo/*.recorrido.ts`, helper `e2e/helpers/consejo-captura.ts`).
 * No son tests de la suite: no corren en CI ni en `npm run verify` (la config principal solo toma los `*.spec.ts`
 * listados por proyecto). Se corren a mano contra la app local y la base de pruebas:
 *
 *   node --env-file=.env.local scripts/test-db/e2e-local.mjs -- --config=playwright.consejo.config.ts [nueva-ronda]
 *
 * El global-setup es el de los E2E: corta si la app o la base son las de prod y deja la sesión del usuario de pruebas.
 * Pantalla de celular real (390×844, la de las revisiones visuales), modo claro.
 */
export default defineConfig({
  testDir: './e2e/consejo',
  testMatch: '*.recorrido.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    locale: 'es-CL',
    storageState: 'e2e/.auth/user.json',
  },
})
