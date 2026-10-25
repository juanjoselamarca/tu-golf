import { test, expect, devices, type BrowserContext, type Page } from '@playwright/test'
import {
  adminClient,
  createEphemeralUserConCredenciales,
  deleteEphemeralUser,
  sinError,
} from './helpers/ronda-fixture'
import { esperarStreaming } from './helpers/streaming'

/**
 * Coach tAIger+: la puerta de la beta (código TAIGER25) con un usuario que de verdad NO tiene acceso.
 *
 * Los specs del coach (coach-deep, coach-taiger) corren con el usuario E2E compartido, que YA tiene
 * `coach_access_enabled = true`: los tests del gate de coach-deep salen por "no se ve el gate" sin afirmar nada. Este
 * spec usa un usuario efímero recién creado (plan free, sin beta) y recorre la puerta entera, mirando la base:
 *
 * 1. Sin beta: /coach muestra el gate (no el dashboard), las sub-rutas /coach/progreso y /coach/sesion/nueva lo
 *    devuelven a /coach, y los endpoints que leen o gastan IA (/api/coach/progress, /api/taiger/chat) responden 403.
 * 2. /api/coach/activate: sin código → 400, código ajeno → 403, y el perfil sigue sin acceso.
 * 3. En el gate, un código incorrecto muestra "Código incorrecto", deja el gate y NO abre el acceso.
 * 4. TAIGER25 escrito en minúsculas (el campo lo pasa a mayúsculas) abre el coach: el dashboard de bienvenida
 *    reemplaza al gate tras la recarga, `coach_access_enabled` queda en true y las sub-rutas y la API se abren.
 *
 * Con el paywall encendido, un plan free tampoco entra por el camino del plan (canUseCoach): el gate se ve igual.
 * Presupuesto: /api/coach/activate limita a 5 intentos por hora por usuario y este spec usa 4 (usuario nuevo por
 * corrida). No llama al chat con acceso: eso gastaría IA.
 *
 * SOLO base de pruebas (`node --env-file=.env.local scripts/test-db/e2e-local.mjs -- coach-gate-activacion.spec.ts
 * --project=mobile-chromium-auth`). El usuario y su perfil se borran en afterAll.
 */

let jugador = { id: '', email: '', password: '' }
let ctx: BrowserContext
let page: Page

async function accesoEnBase(): Promise<boolean | null> {
  const fila = await sinError(
    'profiles.coach_access_enabled',
    adminClient().from('profiles').select('coach_access_enabled').eq('id', jugador.id).maybeSingle(),
  )
  return (fila as { coach_access_enabled: boolean | null } | null)?.coach_access_enabled ?? null
}

async function irAlCoach(ruta = '/coach'): Promise<void> {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  // /coach tiene loading.tsx: hasta que React mueve el segmento, el gate está dos veces en el DOM.
  await esperarStreaming(page)
}

const botonCodigo = () => page.getByRole('button', { name: 'Ingresar código de acceso' })
const bienvenida = () => page.getByText('Bienvenido a tAIger+')
const campoCodigo = () => page.getByPlaceholder('Tu código')

/** Abre el campo del código. El gate es 'use client': un clic antes de hidratar no hace nada, así que se reintenta. */
async function abrirCampoCodigo(): Promise<void> {
  await expect(async () => {
    await botonCodigo().click()
    await expect(campoCodigo()).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

test.describe.configure({ mode: 'serial' })

test.describe('Coach: la beta TAIGER25 abre la puerta y nada más la abre', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    jugador = await createEphemeralUserConCredenciales('e2e-coach-gate')
    ctx = await browser.newContext({
      ...devices['Pixel 5'],
      baseURL: testInfo.project.use.baseURL,
      storageState: { cookies: [], origins: [] },
    })
    page = await ctx.newPage()
    await page.goto('/login')
    await page.locator('input[type="email"]').first().fill(jugador.email)
    await page.locator('input[placeholder="Tu contraseña"]').first().fill(jugador.password)
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 45_000 })
  })

  test.afterAll(async () => {
    await ctx?.close()
    if (!jugador.id) return
    const errs = await deleteEphemeralUser(jugador.id)
    if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
  })

  test('sin beta: /coach es el gate, las sub-rutas vuelven a /coach y la API responde 403', async () => {
    // Punto de partida verificado en la base: el trigger crea el perfil sin acceso.
    expect(await accesoEnBase(), 'el perfil recién creado existe y no tiene la beta').toBe(false)

    await irAlCoach()
    expect(new URL(page.url()).pathname).toBe('/coach')
    await expect(botonCodigo()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Acceso por invitación.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'tAIger+' })).toBeVisible()
    await expect(bienvenida()).toHaveCount(0)
    // El botón del gate es tocable en cancha (≥44 px de alto).
    const caja = await botonCodigo().boundingBox()
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44)

    for (const sub of ['/coach/progreso', '/coach/sesion/nueva']) {
      await irAlCoach(sub)
      await expect
        .poll(() => new URL(page.url()).pathname, { message: `${sub} sin beta debe volver al gate`, timeout: 15_000 })
        .toBe('/coach')
      await expect(botonCodigo()).toBeVisible()
    }

    const progreso = await page.request.get('/api/coach/progress')
    expect(progreso.status()).toBe(403)
    expect(await progreso.json()).toEqual({ error: 'Acceso al coach no habilitado' })

    const chat = await page.request.post('/api/taiger/chat', { data: { message: 'hola' } })
    expect(chat.status(), 'el chat (gasta IA) no se abre sin beta').toBe(403)
  })

  test('API de activación: sin código 400, código ajeno 403, y el perfil sigue cerrado', async () => {
    const vacio = await page.request.post('/api/coach/activate', { data: { code: '   ' } })
    expect(vacio.status()).toBe(400)
    expect(await vacio.json()).toEqual({ error: 'Código requerido' })

    const ajeno = await page.request.post('/api/coach/activate', { data: { code: 'TAIGER24' } })
    expect(ajeno.status()).toBe(403)
    expect(await ajeno.json()).toEqual({ error: 'Código inválido' })

    expect(await accesoEnBase()).toBe(false)
  })

  test('gate: un código incorrecto avisa y deja la puerta cerrada', async () => {
    await irAlCoach()
    await abrirCampoCodigo()
    const campo = campoCodigo()
    const activar = page.getByRole('button', { name: 'Activar' })
    await expect(activar, 'sin código no se puede enviar').toBeDisabled()

    await campo.fill('golf2026')
    await expect(campo, 'el campo escribe en mayúsculas').toHaveValue('GOLF2026')
    const respuesta = page.waitForResponse(r => r.url().endsWith('/api/coach/activate'))
    await activar.click()
    expect((await respuesta).status()).toBe(403)

    await expect(page.getByText('Código incorrecto')).toBeVisible()
    await expect(bienvenida()).toHaveCount(0)
    expect(await accesoEnBase()).toBe(false)

    // Al volver a escribir, el aviso se va.
    await campo.fill('X')
    await expect(page.getByText('Código incorrecto')).toHaveCount(0)
  })

  test('gate: TAIGER25 (en minúsculas) abre el coach, queda guardado y abre sub-rutas y API', async () => {
    await irAlCoach()
    await abrirCampoCodigo()
    const campo = campoCodigo()
    await campo.fill('taiger25')
    await expect(campo).toHaveValue('TAIGER25')

    const respuesta = page.waitForResponse(r => r.url().endsWith('/api/coach/activate'))
    // Una navegación NUEVA del documento (la recarga del gate), no el 'load' pendiente de la visita anterior.
    const recarga = page.waitForEvent('framenavigated', f => f === page.mainFrame())
    await campo.press('Enter')
    // El cuerpo ya no se puede leer: el gate recarga la página apenas llega el 200. Lo que importa queda en la base.
    expect((await respuesta).status()).toBe(200)
    await recarga
    await esperarStreaming(page)

    // Tras la recarga, el dashboard (usuario sin rondas → bienvenida) reemplaza al gate.
    await expect(bienvenida()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: 'Hablar con mi coach' })).toHaveAttribute('href', '/coach/sesion/nueva')
    await expect(botonCodigo()).toHaveCount(0)
    expect(await accesoEnBase(), 'la activación queda escrita en el perfil').toBe(true)

    // Persiste: una visita nueva entra directo, y la sub-ruta ya no rebota.
    await irAlCoach()
    await expect(bienvenida()).toBeVisible({ timeout: 15_000 })
    await irAlCoach('/coach/progreso')
    expect(new URL(page.url()).pathname).toBe('/coach/progreso')
    await expect(page.getByRole('heading', { name: 'La bajada hacia tu meta' })).toBeVisible({ timeout: 15_000 })
    await expect(botonCodigo()).toHaveCount(0)

    const progreso = await page.request.get('/api/coach/progress')
    expect(progreso.status(), 'con beta la API del progreso responde').toBe(200)
  })
})
