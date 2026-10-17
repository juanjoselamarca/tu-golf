import type { BrowserContext, Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Auth E2E para Playwright — login vía UI real y storageState reutilizable.
 *
 * El cookie que Supabase SSR setea cambia entre versiones (formato base64-JSON,
 * chunks, etc.). Lugar de reproducir el formato manualmente (frágil), hacemos
 * login REAL vía el formulario de /login y dejamos que @supabase/ssr genere
 * las cookies exactas que el middleware luego leerá.
 *
 * Luego guardamos el estado del context (cookies + localStorage) en un JSON
 * y los tests lo cargan vía `context.storageState(authStatePath)`. Es el
 * pattern oficial de Playwright.
 */

const AUTH_STATE_DIR = path.resolve(__dirname, '..', '.auth')
const AUTH_STATE_FILE = path.join(AUTH_STATE_DIR, 'user.json')
const AUTH_STATE_TTL_MS = 60 * 60 * 1000 // 1 hora — después de eso, re-login

export const authStatePath = AUTH_STATE_FILE

/** ¿Existe un storageState reciente que podemos reutilizar? */
export function hasValidAuthState(): boolean {
  if (!fs.existsSync(AUTH_STATE_FILE)) return false
  const stat = fs.statSync(AUTH_STATE_FILE)
  const ageMs = Date.now() - stat.mtimeMs
  return ageMs < AUTH_STATE_TTL_MS
}

/**
 * Login vía UI real. Llena email+password, hace submit, espera redirect.
 * Usar SOLO desde global-setup o tests que explícitamente necesitan un
 * login fresco — los tests normales deben cargar el storageState existente.
 */
export async function loginViaUI(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_USER_EMAIL
  const password = process.env.E2E_TEST_USER_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Faltan E2E_TEST_USER_EMAIL/PASSWORD. Correr: ' +
      'node --env-file=.env.local scripts/setup-e2e-user.mjs'
    )
  }

  await page.goto('/login', { waitUntil: 'networkidle' })

  // Selectores robustos (basados en el form actual — ver src/app/login/page.tsx)
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[placeholder="Tu contraseña"]').first().fill(password)

  // El botón de submit es un <button type="submit"> dentro del form
  await page.locator('form button[type="submit"]').first().click()

  // Login exitoso = redirect a /dashboard (default del page.tsx)
  // 45s timeout: en CI cold-start el primer request a Vercel + supabase-auth
  // a veces supera los 15s. Local con browser cache es < 3s.
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 })
  } catch (err) {
    // Debug-friendly failure: capturamos URL y posibles mensajes de error
    // visibles en la página antes de re-throw.
    const currentUrl = page.url()
    const errorText = await page.locator('[role="alert"], .error, [class*="error"]').first().textContent().catch(() => null)
    throw new Error(
      `Login no redirigió a /dashboard tras 45s. URL actual: ${currentUrl}. ` +
      `Error visible en página: ${errorText ?? '(ninguno)'}. ` +
      `Original: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/** Guarda el estado de auth del contexto al archivo. */
export async function saveAuthState(context: BrowserContext): Promise<void> {
  if (!fs.existsSync(AUTH_STATE_DIR)) fs.mkdirSync(AUTH_STATE_DIR, { recursive: true })
  await context.storageState({ path: AUTH_STATE_FILE })
}
