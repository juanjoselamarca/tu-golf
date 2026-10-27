# E2E Tests — Golfers+

Playwright tests que ejercitan la app como usuario real (con browser) contra la app local apuntada a la base de
pruebas. Ninguno escribe en prod.

## Cómo correr

```bash
# Suite completa: build con las variables de la base de pruebas, next start en localhost y Playwright contra él
node --env-file=.env.local scripts/test-db/e2e-local.mjs -- --project=mobile-chromium --project=mobile-chromium-auth

# Un spec, reutilizando el build de la corrida anterior (vive en .next-e2e; aborta si es de otra base)
node --env-file=.env.local scripts/test-db/e2e-local.mjs --sin-build -- ronda-flow.spec.ts --project=mobile-chromium-auth

# Smoke público contra el deploy real (anónimo, sin login, sin tocar la base)
npm run test:e2e:smoke
```

`playwright.config.ts` no tiene `baseURL` por defecto: `npm run test:e2e` sin `e2e-local.mjs` no corre. `e2e/global-setup.ts`
aborta si la app no es localhost o si la base no es la de pruebas (o un Supabase local). Detalle de la base y sus
credenciales `TEST_*`: `docs/claude/base-de-pruebas.md`.

## Suites

### `smoke.spec.ts` (3 tests)

Smoke básico post-refactor. Verifica que páginas críticas cargan sin 500. Heredado de un sprint previo.

### `smoke-public-pages.spec.ts` (25 tests)

Smoke extendido. Cubre:

- **11 páginas públicas** (sin auth): login, register, legal, en-vivo, leaderboard, indices, ranking, demo, recuperar
- **9 rutas protegidas** → verifica redirect a `/login`
- **3 rutas con params inexistentes** → no-crash
- **2 tests de navegación** (CTAs, navbar)

Read-only. Es lo que corre contra el deploy real (`playwright.monitoreo.config.ts`).

Helper `assertCleanLoad` soporta `allowedReactErrors` para whitelist de bugs conocidos (ver TECH_DEBT.md). Si aparece un error NUEVO no-whitelisted, el test falla.

### `authenticated-flow.spec.ts` (10 tests)

Tests de rutas autenticadas con sesión real inyectada via storageState.

El usuario `e2e-test@golfersplus-test.local` vive en la base de pruebas: lo crea `scripts/test-db/seed.mjs` con la
contraseña de `TEST_E2E_USER_PASSWORD`. El global-setup hace login automático.

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

Modifica la base de pruebas. Cleanup en afterEach + afterAll.

### `rondas-existentes.spec.ts`

Tests que crean rondas con la service key de Supabase, verifican vista espectador, y limpian al final. Modifica la base de pruebas; `e2e-local.mjs` le pasa `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de esa base.

### `http-smoke.ts`

Smoke HTTP puro (sin browser) como fallback si Playwright está bloqueado. Verifica respuestas SSR con fetch + grep de HTML.

## Política

- Solo el smoke público corre contra el deploy real.
- Todo lo demás corre contra la app local y la base de pruebas; cada spec que escribe crea sus datos y los borra en `afterAll`.

## Agregar un test nuevo

1. Si es read-only → extender `smoke-public-pages.spec.ts`
2. Si modifica BD → archivo separado, con `afterAll` de cleanup obligatorio
3. Usar rutas relativas (`page.goto('/...')`): el `baseURL` lo pone `e2e-local.mjs`
4. Mobile-first viewport (ya configurado: Pixel 5)

## Troubleshooting

- **Tests fallan con timeout**: el entorno puede estar lento. Ajustar `timeout` en `playwright.config.ts`.
- **Browsers no instalados**: `npx playwright install chromium`
- **Aborta en el global-setup**: la app o la base no son las de pruebas; correr con `e2e-local.mjs`.
- **Ver trace de fallo**: `npx playwright show-trace test-results/.../trace.zip`
