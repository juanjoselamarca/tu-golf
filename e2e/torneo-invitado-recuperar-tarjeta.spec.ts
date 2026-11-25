import { test, expect, devices, type BrowserContext, type Page, type Request } from '@playwright/test'
import {
  adminClient,
  DEFAULT_COURSE_ID,
  DEFAULT_COURSE_NAME,
  createEphemeralUser,
  deleteEphemeralUser,
  sinError,
  sufijo,
} from './helpers/ronda-fixture'
import { marcarAvisoNoMolestarVistoTorneo } from './helpers/aviso-no-molestar'

/**
 * «Recuperar mi tarjeta»: el invitado de un torneo cuyo token dejó de servir (secret rotado, token vencido) recupera
 * el acceso SIN salir del scorer, y los golpes que quedaron en el teléfono suben solos (Fable #833 v2). Hasta hoy
 * ningún E2E pasaba por ahí: `useRecuperarAccesoInvitado` y `AvisoSinAccesoBanner` sólo tenían tests unitarios.
 *
 * Todo por la pantalla real, con un teléfono sin cuenta: se inscribe por el link (`/torneo/[slug]/unirse`, que crea
 * su guestId y la prueba de identidad), anota, y el token se rompe. Lo que se afirma es lo que QUEDA GUARDADO:
 *  - con el token roto, el golpe NO llega a `hole_scores` y el aviso ofrece «Recuperar mi tarjeta»;
 *  - si la base no responde al recuperar (500 `lookup_failed`, #882 del hunter 25-nov), la pantalla dice
 *    «Intenta de nuevo» y NO «Muéstrale tu tarjeta al organizador» (antes el servidor respondía 404 `not_registered`
 *    y el invitado se rendía con un golpe que se podía recuperar);
 *  - al reintentar recupera al MISMO jugador (una sola fila en `players`), el golpe sube solo y al volver a abrir
 *    el scorer la tarjeta se abre sola;
 *  - sin la prueba de identidad no hay botón que prometa algo imposible: lo manda al organizador.
 *
 * SOLO base de pruebas y app local (`scripts/test-db/e2e-local.mjs`): siembra un torneo en curso, que en prod se vería
 * en /en-vivo. Contra prod lo corta el globalSetup (`exigirBaseDePruebas`). Todo se borra en afterAll.
 *
 *   node --env-file=.env.local scripts/test-db/e2e-local.mjs -- torneo-invitado-recuperar-tarjeta.spec.ts --project=mobile-chromium-auth
 */

const NOMBRE_INVITADO = 'E2E Invitado Recupera'
const GOLPES_HOYO_1 = 5
const GOLPES_HOYO_2 = 6

const AVISO_CORTADO = 'Se cortó tu acceso de invitado'
const AVISO_SIN_PRUEBA = 'Tu acceso de invitado ya no sirve'
const MUESTRALE = /Muéstrale tu tarjeta al organizador/
const CTA_RECUPERAR = 'Recuperar mi tarjeta'

const slug = `e2e-recupera-${sufijo()}`
const nombreTorneo = `E2E Recupera ${slug.slice(-8)}`
let organizadorId = ''
let tournamentId = ''
let ctx: BrowserContext
let page: Page

/** Lo que el teléfono guardó al inscribirse. */
let guestId = ''
let tokenOriginal = ''
let pruebaOriginal = ''
let playerId = ''
let roundId = ''

interface FilaJugador { id: string; pending_user_id: string | null; user_id: string | null; rounds: Array<{ id: string }> }

async function jugadoresEnBase(): Promise<FilaJugador[]> {
  const filas = await sinError('select players', adminClient().from('players')
    .select('id, pending_user_id, user_id, rounds(id)').eq('tournament_id', tournamentId))
  return (filas ?? []) as unknown as FilaJugador[]
}

async function golpesEnBase(): Promise<Array<{ hole_number: number; gross_score: number | null }>> {
  const filas = await sinError('select hole_scores', adminClient().from('hole_scores')
    .select('hole_number, gross_score').eq('round_id', roundId).order('hole_number', { ascending: true }))
  return (filas ?? []) as Array<{ hole_number: number; gross_score: number | null }>
}

const leerLocal = (p: Page, clave: string) => p.evaluate((k) => localStorage.getItem(k), clave)

/** Un token con la forma correcta (64 hex) pero que el servidor no firmó: lo que deja un secret rotado. */
function tokenRoto(token: string): string {
  return token.split('').reverse().join('')
}

/** Fila del hoyo N (el texto "Hoyo N" exacto, no "Hoyo 1" dentro de "Hoyo 10"). */
function inputHoyo(p: Page, n: number) {
  return p.locator('div', { has: p.getByText(`Hoyo ${n}`, { exact: true }) })
    .filter({ has: p.locator('input[type="number"]') }).last().locator('input[type="number"]')
}

/** Abre el scorer con el token roto: sin auto-selección, el invitado elige su nombre en «¿Quién eres?». */
async function abrirScorerConTokenRoto(p: Page, opts: { sinPrueba?: boolean } = {}) {
  await p.evaluate(({ roto, sinPrueba }) => {
    localStorage.setItem('gp_guest_token', roto)
    if (sinPrueba) localStorage.removeItem('gp_guest_proof')
  }, { roto: tokenRoto(tokenOriginal), sinPrueba: !!opts.sinPrueba })
  const res = await p.goto(`/torneo/${slug}/score`)
  expect(res?.status(), 'el scorer del torneo responde').toBeLessThan(400)
  await expect(p.getByRole('heading', { name: '¿Quién eres?' }), 'con el token roto no se auto-selecciona').toBeVisible()
  await p.getByRole('button', { name: new RegExp(NOMBRE_INVITADO) }).click()
  await expect(p.getByRole('button', { name: /Cambiar jugador/ })).toBeVisible()
}

async function anotar(p: Page, hoyo: number, golpes: number) {
  const input = inputHoyo(p, hoyo)
  await expect(input).toBeEnabled()
  await input.fill(String(golpes))
  await input.blur()
}

const banner = (p: Page) => p.getByRole('alert').filter({ hasText: /acceso de invitado/ })

test.describe.configure({ mode: 'serial' })

test.describe('Torneo: el invitado con el token roto recupera su tarjeta desde el scorer', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    organizadorId = await createEphemeralUser('e2e-org-recupera')
    // `guest-tournament` es feature Pro: con un organizador Free el join responde 403 pro_required.
    await sinError('update organizador pro', adminClient().from('profiles')
      .update({ subscription_tier: 'pro', subscription_status: 'active' })
      .eq('id', organizadorId).select('id').single())
    const t = await sinError('insert tournaments', adminClient().from('tournaments').insert({
      name: nombreTorneo,
      slug,
      organizer_id: organizadorId,
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      date_start: new Date().toISOString().slice(0, 10),
      format: 'stroke_play',
      hole_count: 18,
      status: 'open',
      hcp_calc_mode: 'whs',
    }).select('id').single())
    tournamentId = (t as { id: string }).id

    // Teléfono sin cuenta. IP propia: `guest-join` frena 10 por minuto y por IP, y otro spec la puede gastar.
    ctx = await browser.newContext({
      ...devices['Pixel 5'],
      baseURL: testInfo.project.use.baseURL,
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250) + 1}` },
    })
    page = await ctx.newPage()
  })

  test.afterAll(async () => {
    await ctx?.close()
    // Borra el torneo del organizador (players, rounds y hole_scores caen por ON DELETE CASCADE).
    if (organizadorId) {
      const errs = await deleteEphemeralUser(organizadorId)
      if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
    }
  })

  test('se inscribe por el link como invitado y su tarjeta se abre sola', async () => {
    const res = await page.goto(`/torneo/${slug}/unirse`)
    expect(res?.status()).toBeLessThan(400)
    await page.locator('#guest-name').fill(NOMBRE_INVITADO)
    await page.locator('#guest-handicap').fill('14.2')
    await page.getByRole('button', { name: 'Scorear como invitado' }).click()
    await page.waitForURL(new RegExp(`/torneo/${slug}/score`), { timeout: 20_000 })

    guestId = (await leerLocal(page, 'gp_guest_id')) ?? ''
    tokenOriginal = (await leerLocal(page, 'gp_guest_token')) ?? ''
    expect(tokenOriginal, 'el teléfono guardó el token firmado').toMatch(/^[0-9a-f]{64}$/)
    pruebaOriginal = (await leerLocal(page, 'gp_guest_proof')) ?? ''
    expect(pruebaOriginal, 'y la prueba de identidad de la que sale el guestId').toBeTruthy()

    const filas = await jugadoresEnBase()
    expect(filas, 'una sola inscripción').toHaveLength(1)
    expect(filas[0].pending_user_id, 'vinculada al guestId de ESTE teléfono').toBe(guestId)
    expect(filas[0].user_id).toBeNull()
    expect(filas[0].rounds, 'con su tarjeta').toHaveLength(1)
    playerId = filas[0].id
    roundId = filas[0].rounds[0].id

    // La hoja «Activa No molestar» entra 400 ms después de abrir la tarjeta y tapa el banner: se marca vista (la hoja
    // se prueba aparte, en ronda-scoring.spec.ts).
    await marcarAvisoNoMolestarVistoTorneo(page, roundId)

    // El organizador inicia el torneo (legacy, sin grupos: status en juego y la tarjeta ya existe).
    await sinError('torneo → in_progress', adminClient().from('tournaments')
      .update({ status: 'in_progress' }).eq('id', tournamentId).select('id').single())
    await page.goto(`/torneo/${slug}/score`)
    await expect(page.getByRole('button', { name: /Cambiar jugador/ }), 'con el token sano se auto-selecciona').toBeVisible()
    await expect(page.getByText(new RegExp(`${NOMBRE_INVITADO} · HCP 14[.,]2`))).toBeVisible()
    await expect(inputHoyo(page, 1)).toBeEnabled()
  })

  test('con el token roto el golpe queda en el teléfono y el aviso ofrece recuperar la tarjeta', async () => {
    await abrirScorerConTokenRoto(page)
    await anotar(page, 1, GOLPES_HOYO_1)

    await expect(banner(page)).toContainText(AVISO_CORTADO, { timeout: 20_000 })
    await expect(banner(page)).toContainText('Tus golpes quedaron en este teléfono')
    await expect(page.getByTestId('recuperar-acceso-invitado')).toHaveText(CTA_RECUPERAR)
    await expect(banner(page)).not.toContainText(MUESTRALE)
    // El aviso sale DESPUÉS de que el servidor lo rechazó: lo que hay en la base ya es definitivo.
    expect(await golpesEnBase(), 'con el token roto no entra ningún golpe').toEqual([])
  })

  test('si la base no responde al recuperar, dice «Intenta de nuevo» y no lo manda al organizador', async () => {
    const pedidos: Request[] = []
    // Lo que responde guest-join desde #882 cuando falla la lectura de «¿ya inscrito?» (antes: 404 not_registered).
    await page.route(`**/api/torneos/${slug}/guest-join`, async (route) => {
      pedidos.push(route.request())
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'lookup_failed', message: 'No se pudo completar la inscripción. Intenta nuevamente.' }),
      })
    })
    try {
      await page.getByTestId('recuperar-acceso-invitado').click()
      const estado = banner(page).getByRole('status')
      await expect(estado).toContainText('No pudimos conectar. Intenta de nuevo.')
      await expect(estado).not.toContainText(MUESTRALE)
      await expect(estado.getByRole('link', { name: 'Ver el torneo' })).toHaveAttribute('href', `/torneo/${slug}`)
      // El botón sigue ahí: se puede reintentar en el acto.
      await expect(page.getByTestId('recuperar-acceso-invitado')).toBeEnabled()
    } finally {
      await page.unroute(`**/api/torneos/${slug}/guest-join`)
    }

    expect(pedidos, 'un solo intento por toque').toHaveLength(1)
    const cuerpo = pedidos[0].postDataJSON() as { guestId?: string; guestProof?: string; soloRecuperar?: boolean }
    expect(cuerpo.soloRecuperar, 'recuperar nunca inscribe').toBe(true)
    expect(cuerpo.guestId).toBe(guestId)
    expect(cuerpo.guestProof, 'manda la prueba de identidad guardada al inscribirse').toBe(pruebaOriginal)
    expect(await leerLocal(page, 'gp_guest_token'), 'el token no cambió').toBe(tokenRoto(tokenOriginal))
    expect(await golpesEnBase()).toEqual([])
    expect(await jugadoresEnBase(), 'nada se inscribió').toHaveLength(1)
  })

  test('al reintentar recupera al MISMO jugador y el golpe que quedó en el teléfono sube solo', async () => {
    await page.getByTestId('recuperar-acceso-invitado').click()
    await expect(page.getByText('Tarjeta recuperada')).toBeVisible()
    await expect(banner(page)).toHaveCount(0)

    await expect.poll(golpesEnBase, { timeout: 20_000, message: 'el golpe del hoyo 1 se reenvió solo' })
      .toEqual([{ hole_number: 1, gross_score: GOLPES_HOYO_1 }])
    const filas = await jugadoresEnBase()
    expect(filas, 'no se creó otro jugador').toHaveLength(1)
    expect(filas[0].id).toBe(playerId)
    expect(filas[0].pending_user_id).toBe(guestId)

    const tokenNuevo = await leerLocal(page, 'gp_guest_token')
    // El token se firma de forma determinista por jugador: recuperar al MISMO jugador devuelve el mismo token.
    expect(tokenNuevo, 'mismo jugador → mismo token firmado').toBe(tokenOriginal)

    // Con el token recuperado, la próxima vez la tarjeta se abre sola y trae lo anotado desde el servidor.
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (!k.startsWith('gp_guest_')) localStorage.removeItem(k)
    })
    await page.goto(`/torneo/${slug}/score`)
    await expect(page.getByRole('button', { name: /Cambiar jugador/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: '¿Quién eres?' })).toHaveCount(0)
    await expect(inputHoyo(page, 1)).toHaveValue(String(GOLPES_HOYO_1))
  })

  test('sin la prueba de identidad no hay botón: lo manda al organizador y nada se guarda', async () => {
    await abrirScorerConTokenRoto(page, { sinPrueba: true })
    await anotar(page, 2, GOLPES_HOYO_2)

    await expect(banner(page)).toContainText(AVISO_SIN_PRUEBA, { timeout: 20_000 })
    await expect(banner(page)).toContainText(MUESTRALE)
    await expect(page.getByTestId('recuperar-acceso-invitado')).toHaveCount(0)
    await expect(banner(page).getByRole('link', { name: 'Ver el torneo' })).toHaveAttribute('href', `/torneo/${slug}`)
    expect(await golpesEnBase(), 'el hoyo 2 no entró; el hoyo 1 sigue').toEqual([{ hole_number: 1, gross_score: GOLPES_HOYO_1 }])
  })
})
