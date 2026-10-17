import { test, expect, devices, type BrowserContext, type Page } from '@playwright/test'
import {
  adminClient,
  DEFAULT_COURSE_ID,
  createEphemeralUser,
  createEphemeralUserConCredenciales,
  deleteEphemeralUser,
} from './helpers/ronda-fixture'
import { exigirBaseDePruebas } from './helpers/base-de-pruebas'

/**
 * Inscripción a un torneo por su link (/torneo/[slug]/unirse): qué queda GUARDADO, no sólo qué se ve.
 *
 * Un visitante sin sesión abre el link → "Iniciar sesión con mi cuenta" → vuelve al MISMO link → "Inscribirme". La
 * fila de `players` debe quedar con el handicap que corresponde al modo del torneo (WHS: el índice crudo; legacy: el
 * course handicap de la cancha), el género congelado y su ronda. Y cada puerta cerrada (ya inscrito, cupo lleno,
 * inscripciones cerradas, sin índice) se cierra en la pantalla Y en el POST directo, sin crear filas.
 *
 * Fixture realista: el organizador y la jugadora son usuarios efímeros distintos (la RLS y la sesión son las de una
 * jugadora cualquiera). SOLO base de pruebas (`node --env-file=.env.local scripts/test-db/e2e-local.mjs --
 * torneo-inscripcion.spec.ts --project=mobile-chromium-auth`): los torneos 'open' se ven en listados públicos. Contra
 * prod se corta en beforeAll. Todo se borra en afterAll.
 */

function sufijo(): string {
  const a = 'acdefghjkmnpqrstvwxyz2345679'
  let s = ''
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)]
  return s
}

async function sinError<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

interface Torneo { id: string; slug: string; nombre: string }

let organizadorId = ''
let jugadora = { id: '', email: '', password: '' }
const NOMBRE_JUGADORA = 'E2E Jugadora Inscripción'
let ctx: BrowserContext
let page: Page

/** Torneo del organizador efímero en Los Leones, hoy, 18 hoyos stroke play. */
async function crearTorneo(opts: { status: string; hcpCalcMode?: 'whs' | 'raw'; maxPlayers?: number }): Promise<Torneo> {
  const slug = `e2e-inscr-${sufijo()}`
  const nombre = `E2E Inscripción ${slug.slice(-8)}`
  const t = await sinError('insert tournaments', adminClient().from('tournaments').insert({
    name: nombre,
    slug,
    organizer_id: organizadorId,
    course_id: DEFAULT_COURSE_ID,
    course_name: 'Los Leones',
    date_start: new Date().toISOString().slice(0, 10),
    format: 'stroke_play',
    hole_count: 18,
    status: opts.status,
    hcp_calc_mode: opts.hcpCalcMode ?? 'whs',
    max_players: opts.maxPlayers ?? null,
  }).select('id').single())
  return { id: (t as { id: string }).id, slug, nombre }
}

async function perfilDeLaJugadora(indice: number | null) {
  await sinError('update profiles', adminClient().from('profiles')
    .update({ name: NOMBRE_JUGADORA, indice, genero: 'F' }).eq('id', jugadora.id).select('id').single())
}

/** Filas de la jugadora en el torneo, con su ronda. */
async function inscripcionEnBase(t: Torneo) {
  const players = await sinError('select players', adminClient().from('players')
    .select('id, status, handicap_at_registration, genero, rounds(id, status)')
    .eq('tournament_id', t.id).eq('user_id', jugadora.id))
  return (players ?? []) as unknown as Array<{
    id: string; status: string; handicap_at_registration: number | null; genero: string | null
    rounds: Array<{ id: string; status: string }>
  }>
}

/** Course handicap WHS de la cancha: índice × slope/113 + (CR − par), redondeado (.5 hacia arriba) sobre el valor EXACTO. */
async function courseHandicapEsperado(indice: number) {
  const c = await sinError('select courses', adminClient().from('courses')
    .select('slope_rating, course_rating, par_total').eq('id', DEFAULT_COURSE_ID).single()) as
    { slope_rating: number; course_rating: number; par_total: number | null }
  // En milésimas enteras: así 12.4 + 3.1 da 15.5 exacto y no 15.4999… (el flotante que redondea mal).
  const exactoMilesimas = Math.round((indice * c.slope_rating / 113 + c.course_rating - (c.par_total ?? 72)) * 1000)
  return { valor: Math.round(exactoMilesimas / 1000), esMedio: exactoMilesimas % 1000 === 500 }
}

async function abrirUnirse(t: Torneo) {
  const res = await page.goto(`/torneo/${t.slug}/unirse`)
  expect(res?.status(), 'la página de inscripción responde').toBeLessThan(400)
  await expect(page.getByText(t.nombre).first(), 'se pintó ESTE torneo').toBeVisible({ timeout: 20_000 })
}

/** POST directo de inscripción con la sesión de la jugadora (la puerta real, sin pasar por la UI). */
async function postInscribirse(t: Torneo) {
  const res = await page.request.post(`/api/torneos/${t.slug}/inscribirse`)
  return { status: res.status(), body: await res.json().catch(() => ({})) as { error?: string } }
}

async function inscribirseYVerExito(t: Torneo) {
  await abrirUnirse(t)
  await page.getByRole('button', { name: 'Inscribirme' }).click()
  await expect(page.getByText('¡Inscripción exitosa!')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(`Estás inscrito en ${t.nombre}`)).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.describe('Torneo: inscripción por link guarda el handicap correcto y cierra cada puerta', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    exigirBaseDePruebas('torneo-inscripcion.spec.ts')
    organizadorId = await createEphemeralUser('e2e-org-inscripcion')
    jugadora = await createEphemeralUserConCredenciales('e2e-jug-inscripcion')
    await perfilDeLaJugadora(12.4)
    // Sesión propia de la jugadora (no la del usuario E2E compartido): parte sin cookies y entra por el link del torneo.
    ctx = await browser.newContext({
      ...devices['Pixel 5'],
      baseURL: testInfo.project.use.baseURL,
      storageState: { cookies: [], origins: [] },
    })
    page = await ctx.newPage()
  })

  test.afterAll(async () => {
    await ctx?.close()
    const errs: string[] = []
    // Borra los torneos del organizador (con sus players y rounds) y los dos usuarios.
    if (organizadorId) errs.push(...(await deleteEphemeralUser(organizadorId)))
    if (jugadora.id) errs.push(...(await deleteEphemeralUser(jugadora.id)))
    if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
  })

  let whs: Torneo

  test('sin sesión → inicia sesión desde el link → vuelve al torneo → inscrita con su índice (WHS)', async () => {
    whs = await crearTorneo({ status: 'open' })
    await abrirUnirse(whs)
    const entrar = page.getByRole('link', { name: 'Iniciar sesión con mi cuenta' })
    await expect(entrar).toBeVisible()
    await entrar.click()
    await page.waitForURL(/\/login/)
    await page.locator('input[type="email"]').first().fill(jugadora.email)
    await page.locator('input[placeholder="Tu contraseña"]').first().fill(jugadora.password)
    await page.locator('form button[type="submit"]').first().click()
    // Vuelve al MISMO link del torneo, no al dashboard.
    await page.waitForURL(new RegExp(`/torneo/${whs.slug}/unirse`), { timeout: 45_000 })
    await expect(page.getByText(NOMBRE_JUGADORA)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Índice: 12.4')).toBeVisible()

    await page.getByRole('button', { name: 'Inscribirme' }).click()
    await expect(page.getByText('¡Inscripción exitosa!')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(`Estás inscrito en ${whs.nombre}`)).toBeVisible()

    const filas = await inscripcionEnBase(whs)
    expect(filas, 'una sola inscripción').toHaveLength(1)
    expect(filas[0].status).toBe('approved')
    // WHS guarda el ÍNDICE crudo: el leaderboard calcula el course handicap con el tee de cada jugador.
    expect(Number(filas[0].handicap_at_registration), 'WHS: índice crudo, sin convertir').toBe(12.4)
    expect(filas[0].genero, 'género congelado desde el perfil').toBe('F')
    expect(filas[0].rounds, 'su ronda del torneo quedó creada').toHaveLength(1)
    expect(filas[0].rounds[0].status).toBe('in_progress')
  })

  test('ya inscrita: la pantalla lo dice y un segundo POST no duplica', async () => {
    await abrirUnirse(whs)
    await expect(page.getByText('Ya estás inscrito en este torneo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
    const r = await postInscribirse(whs)
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('already_registered')
    expect(await inscripcionEnBase(whs), 'sigue una sola fila').toHaveLength(1)
  })

  test('torneo legacy (raw): guarda el course handicap de la cancha', async () => {
    await perfilDeLaJugadora(12.0)
    const legacy = await crearTorneo({ status: 'open', hcpCalcMode: 'raw' })
    const esperado = await courseHandicapEsperado(12.0)
    await inscribirseYVerExito(legacy)
    const filas = await inscripcionEnBase(legacy)
    expect(filas).toHaveLength(1)
    expect(Number(filas[0].handicap_at_registration), 'legacy: course handicap ya convertido').toBe(esperado.valor)
  })

  /**
   * BUG (17-oct, zona crítica, sin arreglar): `courseHandicapDeLaCancha` (src/golf/core/course-handicap.ts) redondea
   * el flotante: 12.4 × 113/113 + (75.1 − 72) = 15.499999999999995 → 15, pero el valor exacto es 15.5 → 16. Pega en
   * cualquier índice cuyo course handicap exacto termina en .5 (141 de 193 canchas de prod tienen slope 113).
   * `test.fail()`: se pone rojo cuando se arregle → quitar el `test.fail()`.
   */
  test('torneo legacy (raw): un course handicap exacto de .5 redondea hacia arriba', async () => {
    const esperado = await courseHandicapEsperado(12.4)
    test.skip(!esperado.esMedio, 'la cancha ya no da un course handicap exacto de .5 con índice 12.4')
    test.fail(true, 'courseHandicapDeLaCancha redondea 15.4999… a 15 (pendientes-e2e 17-oct)')
    await perfilDeLaJugadora(12.4)
    const legacy = await crearTorneo({ status: 'open', hcpCalcMode: 'raw' })
    await inscribirseYVerExito(legacy)
    const filas = await inscripcionEnBase(legacy)
    expect(filas).toHaveLength(1)
    expect(Number(filas[0].handicap_at_registration)).toBe(esperado.valor)
  })

  test('cupo lleno: "Torneo completo", sin botón, y el POST directo no entra', async () => {
    await perfilDeLaJugadora(12.4)
    const lleno = await crearTorneo({ status: 'open', maxPlayers: 2 })
    await sinError('insert players', adminClient().from('players').insert(
      ['E2E Invitado Uno', 'E2E Invitado Dos'].map(player_name => ({
        tournament_id: lleno.id, pending_user_id: crypto.randomUUID(), player_name, handicap_at_registration: 10, status: 'approved',
      })),
    ))
    await abrirUnirse(lleno)
    await expect(page.getByText('Torneo completo')).toBeVisible()
    await expect(page.getByText('Este torneo llegó a su cupo de 2 jugadores. Habla con el organizador para que lo amplíe.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
    const r = await postInscribirse(lleno)
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('tournament_full')
    expect(await inscripcionEnBase(lleno), 'no quedó inscrita').toHaveLength(0)
  })

  test('torneo ya en juego: inscripciones cerradas en la pantalla y en el POST', async () => {
    const enJuego = await crearTorneo({ status: 'in_progress' })
    await abrirUnirse(enJuego)
    await expect(page.getByText('Las inscripciones de este torneo están cerradas')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
    const r = await postInscribirse(enJuego)
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('not_inscribible')
    expect(await inscripcionEnBase(enJuego)).toHaveLength(0)
  })

  test('sin índice: pide cargarlo, sin botón, y el POST directo se rechaza', async () => {
    await perfilDeLaJugadora(null)
    const abierto = await crearTorneo({ status: 'open' })
    await abrirUnirse(abierto)
    await expect(page.getByText('Sin índice registrado')).toBeVisible()
    await expect(page.getByText('Necesitas tu índice de handicap')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cargar mi índice' })).toHaveAttribute('href', '/perfil')
    await expect(page.getByRole('button', { name: 'Inscribirme' })).toHaveCount(0)
    const r = await postInscribirse(abierto)
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('missing_index')
    expect(await inscripcionEnBase(abierto), 'sin índice no se inscribe (el neto saldría igual al bruto)').toHaveLength(0)
  })
})
