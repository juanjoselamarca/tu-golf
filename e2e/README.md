# E2E Tests — Golfers+

Playwright tests que ejercitan la app como usuario real (con browser) contra una URL configurable.

## Cómo correr

```bash
# Smoke tests contra producción (default, read-only — no modifica BD)
npm run test:e2e:smoke

# Full suite (incluye tests que escriben en BD — usar con cuidado)
npm run test:e2e

# UI mode interactivo
npm run test:e2e:ui

# Contra otro entorno
PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app npm run test:e2e:smoke
```

## Suites

### `smoke.spec.ts` (3 tests)

Smoke básico post-refactor. Verifica que páginas críticas cargan sin 500. Heredado de un sprint previo.

### `smoke-public-pages.spec.ts` (25 tests)

Smoke extendido. Cubre:

- **11 páginas públicas** (sin auth): login, register, legal, en-vivo, leaderboard, indices, ranking, demo, recuperar
- **9 rutas protegidas** → verifica redirect a `/login`
- **3 rutas con params inexistentes** → no-crash
- **2 tests de navegación** (CTAs, navbar)

Read-only. Seguro correr contra producción.

Helper `assertCleanLoad` soporta `allowedReactErrors` para whitelist de bugs conocidos (ver TECH_DEBT.md). Si aparece un error NUEVO no-whitelisted, el test falla.

### `authenticated-flow.spec.ts` (10 tests)

Tests de rutas autenticadas con sesión real inyectada via storageState.

**Setup**:
```bash
# 1. Crear test user en Supabase (idempotente)
npm run test:e2e:setup-user
# Copiar las credenciales que imprime a .env.local

# 2. Correr tests (el global-setup hace login automático)
npm run test:e2e:auth
```

Cubre `/dashboard`, `/perfil`, `/perfil/historial`, `/perfil/stats`,
`/ronda-libre/nueva`, `/coach`, `/importar`, `/organizador/nuevo`, + estado
de sesión (navbar, redirect /login → /dashboard si autenticado).

**Cómo funciona**: `e2e/global-setup.ts` hace login real vía UI una vez,
guarda cookies en `e2e/.auth/user.json` (gitignored). Los tests cargan
el storageState desde el project `mobile-chromium-auth` en
`playwright.config.ts`. El storageState se refresca después de 1h.

### `ronda-flow.spec.ts` (4 tests — FLOW COMPLETO con write + cleanup)

Tests del happy path crítico de Ronda Libre. Usa un **fixture**: crea una
ronda real en Supabase via admin (bypassando el wizard de 2118 LOC), abre
la UI con sesión autenticada, verifica que carga sin crashear, y **borra
la ronda completa** (scores + jugadores + ronda) al final.

Casos cubiertos:
- Ronda stroke_play gross 18h → abrir página → abrir scoring
- Ronda stableford 18h → scoring
- Ronda de 9 hoyos → página principal
- Ronda aparece desde dashboard del creador

Usa los helpers en `helpers/ronda-fixture.ts`:
- `createRondaFixture({creadorUserId, ...})` — insert directo admin
- `cleanupRondaFixture(id)` — cascade delete (scores → jugadores → ronda)
- `cleanupAllE2ERondas(userId)` — safety net en afterAll

**Modifica BD de producción**. Cleanup en afterEach + afterAll — verificado
que deja 0 rondas residuales del test user.

```bash
npm run test:e2e:ronda
```

### `rondas-existentes.spec.ts`

Tests que crean rondas vía Supabase Management API, verifican vista espectador, y limpian al final. **Modifica BD** — requiere `SUPABASE_ACCESS_TOKEN` en `.env.local`.

### `http-smoke.ts`

Smoke HTTP puro (sin browser) como fallback si Playwright está bloqueado. Verifica respuestas SSR con fetch + grep de HTML.

## Política

- **Smoke (read-only)** puede correr contra producción sin riesgo
- **Tests con write** solo contra preview o con cleanup estricto garantizado
- **Flujos autenticados** (login UI, wizard completo) pendientes — requieren test user programático. Ver TECH_DEBT P-siguiente-sprint.

## Agregar un test nuevo

1. Si es read-only → extender `smoke-public-pages.spec.ts`
2. Si modifica BD → archivo separado, con `afterAll` de cleanup obligatorio
3. Usar `PLAYWRIGHT_BASE_URL` para no hardcodear URL
4. Mobile-first viewport (ya configurado: Pixel 5)

## Troubleshooting

- **Tests fallan con timeout**: el entorno puede estar lento. Ajustar `timeout` en `playwright.config.ts`.
- **Browsers no instalados**: `npx playwright install chromium`
- **En CI**: setear `CI=true` y `PLAYWRIGHT_BASE_URL` a la URL del preview.
- **Ver trace de fallo**: `npx playwright show-trace test-results/.../trace.zip`
