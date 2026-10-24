/**
 * Tarjeta compartida vista SIN cuenta — /tarjeta/[id]
 *
 * Es lo que ve el amigo que abre el link de WhatsApp, y lo que lee el bot que arma el preview.
 * `tarjeta-compartir.spec.ts` cubre al dueño con sesión; este cubre al visitante anónimo, que es
 * el caso que se rompió el 22-sep sin que nadie lo viera hasta el 24-oct (#640): `profiles` quedó
 * solo para `authenticated` y la tarjeta y su preview decían "Jugador" en vez del nombre.
 *
 * Verifica:
 * 1. La tarjeta pública muestra el NOMBRE real de quien la compartió (no "Jugador"), el total y el CTA.
 * 2. Las notas privadas del dueño no llegan al visitante (ni en pantalla ni en el HTML).
 * 3. El preview del link (HTML del servidor, sin JS ni cookies) dice "<nombre> jugó 82 (+12) en Los Leones".
 * 4. La API pública del nombre entrega solo `{ nombre }`.
 * 5. Una ronda PRIVADA no se filtra: "Tarjeta no encontrada", la API no da el nombre y el preview es genérico.
 *
 * Fixture: dos rondas históricas del usuario E2E (una pública, una privada) en la base de pruebas; se borran al final.
 */
import { test, expect } from '@playwright/test'
import { adminClient, getTestUserId } from './helpers/ronda-fixture'
import {
  createTarjetaFixture,
  cleanupTarjetaFixture,
  TARJETA_COURSE_NAME,
  TARJETA_TOTAL,
  TARJETA_PAR_TOTAL,
  TARJETA_NOTAS,
} from './helpers/tarjeta-fixture'

// 82 golpes sobre par 70 de la ronda. Se arma a mano (no con formatVsParLabel) para que un cambio
// del formateador se note acá.
const VS_PAR_LABEL = `+${TARJETA_TOTAL - TARJETA_PAR_TOTAL}`

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe('Tarjeta compartida — visitante sin cuenta', () => {
  let publicRoundId: string
  let privateRoundId: string
  let nombreDelDueño: string

  test.beforeAll(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
    const userId = await getTestUserId()

    const { data: perfil, error } = await adminClient().from('profiles').select('name').eq('id', userId).single()
    if (error) throw new Error(`no se pudo leer el perfil del usuario E2E: ${error.message}`)
    nombreDelDueño = (perfil?.name ?? '').trim()
    // Sin nombre el test no discrimina: la tarjeta diría "Jugador" con y sin el bug.
    if (!nombreDelDueño || nombreDelDueño === 'Jugador') {
      throw new Error(`el usuario E2E necesita un nombre real en profiles.name (tiene: "${perfil?.name}")`)
    }

    publicRoundId = await createTarjetaFixture(userId, { privacy: 'public' })
    privateRoundId = await createTarjetaFixture(userId, { privacy: 'private' })
  })

  test.beforeEach(async ({ context }) => {
    test.skip(
      !process.env.E2E_TEST_USER_EMAIL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      'E2E_TEST_USER_EMAIL / SUPABASE_SERVICE_ROLE_KEY no configurados',
    )
    // Este proyecto es anónimo; si algún día hereda un storageState, el test ya no probaría lo que dice.
    expect(await context.cookies(), 'el visitante debe llegar sin sesión').toHaveLength(0)
  })

  test.afterAll(async () => {
    const errores: string[] = []
    for (const id of [publicRoundId, privateRoundId]) {
      if (!id) continue
      try { await cleanupTarjetaFixture(id) } catch (e) { errores.push(String(e)) }
    }
    if (errores.length) throw new Error(errores.join(' | '))
  })

  test('muestra el nombre de quien la compartió, el total y el CTA de registro', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    // La página pide el nombre a la API pública solo porque no hay sesión: esperamos esa respuesta
    // para no leer la pantalla antes de que llegue.
    const nombreResp = page.waitForResponse((r) => r.url().includes(`/api/tarjeta/${publicRoundId}/jugador`))
    await page.goto(`/tarjeta/${publicRoundId}`, { waitUntil: 'domcontentloaded' })
    expect((await nombreResp).status()).toBe(200)

    await expect(page.locator('h1').filter({ hasText: TARJETA_COURSE_NAME })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('18 hoyos')).toBeVisible()

    // El nombre real, no el fallback (el bug de #640)
    await expect(page.getByText(nombreDelDueño, { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Jugador', { exact: true })).toHaveCount(0)

    // Total de la ronda en el scorecard
    await expect(page.getByText(String(TARJETA_TOTAL), { exact: true }).first()).toBeVisible()

    // Sin sesión: CTA de registro y "volver" a la portada, no a "Mi historial"
    const cta = page.getByRole('link', { name: 'Unirme gratis' })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/register')
    await expect(page.getByRole('link', { name: 'Golfers+' }).first()).toHaveAttribute('href', '/')
    await expect(page.getByText('Mi historial')).toHaveCount(0)

    // Compartir sin ser dueño abre el sheet sin intentar publicar (no hay sesión para publicar)
    await page.getByRole('button', { name: /Compartir/i }).click()
    await expect(page.getByRole('button', { name: /Copiar/i }).first()).toBeVisible({ timeout: 5_000 })

    expect(pageErrors, `errores de página: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('las notas privadas del dueño no llegan al visitante', async ({ page }) => {
    const respuestas: string[] = []
    page.on('response', async (r) => {
      if (r.request().resourceType() !== 'fetch' && r.request().resourceType() !== 'xhr') return
      try { respuestas.push(await r.text()) } catch { /* redirects/streams sin cuerpo */ }
    })

    await page.goto(`/tarjeta/${publicRoundId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1').filter({ hasText: TARJETA_COURSE_NAME })).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(TARJETA_NOTAS)).toHaveCount(0)
    await expect(page.getByText('Notas', { exact: true })).toHaveCount(0)
    expect(await page.content()).not.toContain(TARJETA_NOTAS)
    // Tampoco en ninguna respuesta de red (RLS no filtra columnas: la capa de datos no debe pedirlas)
    expect(respuestas.length, 'la tarjeta debió cargarse por red').toBeGreaterThan(0)
    expect(respuestas.some((t) => t.includes(TARJETA_NOTAS)), 'una respuesta de red trajo las notas privadas').toBe(false)
  })

  test('el preview del link (HTML del servidor) lleva el nombre, el score y la cancha', async ({ request }) => {
    // `request` no comparte cookies con el navegador ni ejecuta JS: es lo que ve el bot de WhatsApp.
    const res = await request.get(`/tarjeta/${publicRoundId}`)
    expect(res.status()).toBe(200)
    const html = await res.text()

    const esperado = `${nombreDelDueño} jugó ${TARJETA_TOTAL} (${VS_PAR_LABEL}) en ${TARJETA_COURSE_NAME}`
    expect(html).toMatch(new RegExp(`<title>${escapeRegex(esperado)} — Golfers\\+</title>`))
    expect(html).toMatch(new RegExp(`<meta property="og:title" content="${escapeRegex(esperado)}"`))
    expect(html).not.toContain('Jugador jugó')
    expect(html).not.toContain(TARJETA_NOTAS)
  })

  test('la API pública del nombre entrega solo el nombre', async ({ request }) => {
    const res = await request.get(`/api/tarjeta/${publicRoundId}/jugador`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ nombre: nombreDelDueño })
  })

  test('una ronda privada no se ve ni filtra el nombre', async ({ page, request }) => {
    await page.goto(`/tarjeta/${privateRoundId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Tarjeta no encontrada')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(nombreDelDueño, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Ir a Golfers\+/i })).toBeVisible()

    const api = await request.get(`/api/tarjeta/${privateRoundId}/jugador`)
    expect(api.status()).toBe(200)
    expect(await api.json()).toEqual({ nombre: null })

    const html = await (await request.get(`/tarjeta/${privateRoundId}`)).text()
    expect(html).toContain('<title>Tarjeta de golf — Golfers+</title>')
    expect(html).not.toContain(nombreDelDueño)
  })
})
