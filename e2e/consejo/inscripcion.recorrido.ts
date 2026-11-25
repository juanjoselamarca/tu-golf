import { test, expect } from '@playwright/test'
import { recorrido } from '../helpers/consejo-captura'
import { adminClient, createEphemeralUser, deleteEphemeralUser, DEFAULT_COURSE_ID, sinError, sufijo } from '../helpers/ronda-fixture'

/**
 * Recorrido del consejo: un socio recibe por WhatsApp el link de inscripción a un torneo (/torneo/[slug]/unirse).
 * Dos partes, como pasa en la realidad: primero sin sesión (lo que ve quien nunca entró a Golfers+) y después con su
 * cuenta. Pasos tomados de e2e/torneo-inscripcion.spec.ts. El torneo es de un organizador efímero en la base de
 * pruebas y se borra al final. NO toca "Inscribirme" ni escribe ninguna contraseña.
 */
let organizadorId = ''
let slug = ''

test.beforeAll(async () => {
  organizadorId = await createEphemeralUser('consejo-organizador')
  slug = `consejo-inscr-${sufijo()}`
  await sinError('insert tournaments', adminClient().from('tournaments').insert({
    name: 'Copa Primavera Los Leones',
    slug,
    organizer_id: organizadorId,
    course_id: DEFAULT_COURSE_ID,
    course_name: 'Los Leones',
    date_start: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10),
    format: 'stroke_play',
    hole_count: 18,
    status: 'open',
    hcp_calc_mode: 'whs',
  }).select('id').single())
})

test.afterAll(async () => {
  if (!organizadorId) return
  const errores = await deleteEphemeralUser(organizadorId)
  if (errores.length) console.warn(errores.join('\n'))
})

test('inscripción: llega el link por WhatsApp', async ({ browser, page }) => {
  const anonimo = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const sinSesion = await anonimo.newPage()
  const a = recorrido(sinSesion, 'inscripcion-sin-cuenta', 'Abrir el link que mandó el organizador por WhatsApp e inscribirse, sin haber usado nunca Golfers+')
  await sinSesion.goto(`/torneo/${slug}/unirse`, { waitUntil: 'domcontentloaded' })
  await a.pantalla('Link de inscripción sin sesión', 'Inscribirme al torneo')
  const entrar = sinSesion.getByRole('link', { name: 'Iniciar sesión con mi cuenta' })
  if (await entrar.count()) {
    await a.tocar(entrar, 'Iniciar sesión con mi cuenta')
    await sinSesion.waitForURL(/\/login/)
    await a.pantalla('Login desde la invitación', 'Entrar o crear cuenta para volver al torneo')
  }
  console.log(`recorrido guardado en ${a.guardar()}`)
  await anonimo.close()

  const r = recorrido(page, 'inscripcion-con-cuenta', 'Inscribirme al torneo desde el link, ya con mi cuenta de Golfers+')
  await page.goto(`/torneo/${slug}/unirse`, { waitUntil: 'domcontentloaded' })
  expect(page.url()).not.toContain('/login')
  await expect(page.getByRole('heading', { name: /inscribirse al torneo/i })).toBeVisible()
  // Una cuenta nueva suele no tener índice: la pantalla entonces pide cargarlo antes de inscribirse. Es el caso real
  // de un primer uso y se captura tal cual (el usuario de pruebas no tiene índice).
  const cargarIndice = page.getByRole('link', { name: 'Cargar mi índice' })
  // El perfil carga después del encabezado: se espera a que aparezca una de las dos salidas antes de decidir.
  await expect(page.getByRole('button', { name: /inscribirme/i }).or(cargarIndice).first()).toBeVisible()
  const sinIndice = await cargarIndice.count()
  await r.pantalla(sinIndice ? 'Inscribirme (cuenta sin índice)' : 'Inscribirme', 'Inscribirme al torneo')
  if (sinIndice) {
    await r.tocar(cargarIndice, 'Cargar mi índice')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await r.pantalla('Donde se carga el índice', 'Cargar mi índice y volver al torneo')
  }
  console.log(`recorrido guardado en ${r.guardar()}`)
})
