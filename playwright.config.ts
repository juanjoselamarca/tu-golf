import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E config para Golfers+
 *
 * - Corre contra la app local y la base de pruebas: `scripts/test-db/e2e-local.mjs` la compila, la levanta y le
 *   pasa PLAYWRIGHT_BASE_URL y las credenciales TEST_*. global-setup aborta si falta alguna o si la base o la app
 *   son las de prod. El smoke de páginas públicas contra el deploy real vive aparte, en playwright.monitoreo.config.ts.
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
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Proyecto anónimo — NO carga storageState. Tests smoke públicos.
    {
      name: 'mobile-chromium',
      testMatch: ['smoke.spec.ts', 'smoke-public-pages.spec.ts', 'rondas-existentes.spec.ts', 'guest-flow-wednesday.spec.ts', 'leaderboard-envivo.spec.ts', 'paywall-planes.spec.ts', 'torneo-pagina-publica.spec.ts', 'torneo-tv-paywall.spec.ts', 'envivo-api-data.spec.ts', 'torneo-equipos-leaderboard.spec.ts', 'tarjeta-publica-anonimo.spec.ts'],
      use: {
        ...devices['Pixel 5'],
      },
    },
    // Proyecto autenticado — carga storageState del global-setup.
    {
      name: 'mobile-chromium-auth',
      testMatch: [
        'authenticated-flow.spec.ts',
        'ronda-flow.spec.ts',
        'ronda-scoring.spec.ts',
        'score-grupo-finalize-missing.spec.ts',
        'scorer-smoke.spec.ts',
        'organizar-campeonato-flow.spec.ts',
        'organizar-campeonato-asistente.spec.ts',
        'organizar-campeonato-formato-cambia.spec.ts',
        'organizar-campeonato-live.spec.ts',
        'organizar-campeonato-modal-duplicar.spec.ts',
        'import-photo-scan.spec.ts',
        'inbox-fixes-verify.spec.ts',
        'wizard-dark-light-diag.spec.ts',
        'historial-handicap-thursday.spec.ts',
        'organizar-campeonato-dashboard.spec.ts',
        'perfil-stats.spec.ts',
        'perfil-ronda-detalle.spec.ts',
        'dashboard-data.spec.ts',
        'scorer-nueva-wizard.spec.ts',
        'inscripcion-unirse.spec.ts',
        'coach-taiger.spec.ts',
        'tarjeta-compartir.spec.ts',
        'importar-page.spec.ts',
        'scorer-resultados-ronda.spec.ts',
        'score-grupo-scoring.spec.ts',
        'historial-data-integrity.spec.ts',
        'import-csv-flow.spec.ts',
        'coach-deep.spec.ts',
        'torneo-anotar-mi-score.spec.ts',
        'import-fotos-lotes.spec.ts',
        'envivo-feed-render.spec.ts',
        'scorer-finalizar-ultimo-hoyo.spec.ts',
        'torneo-inscripcion.spec.ts',
        'tarjeta-par-de-la-ronda.spec.ts',
        'import-garmin-zip-flow.spec.ts',
        'torneo-score-sin-empezar.spec.ts',
        'organizador-scoring-estado.spec.ts',
        'dashboard-rondas-recientes.spec.ts',
        'torneo-live-api.spec.ts',
        'ronda-libre-equipos-leaderboard.spec.ts',
        'scorer-match-play.spec.ts',
        'torneo-invitado-join-claim.spec.ts',
      ],
      use: {
        ...devices['Pixel 5'],
        storageState: 'e2e/.auth/user.json',
      },
    },
  ],
})
