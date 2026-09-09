import { test, expect } from '@playwright/test'
import {
  cleanupRondaFixture,
  getTestUserId,
} from './helpers/ronda-fixture'
import { createClient } from '@supabase/supabase-js'

/**
 * E2E del flujo INVITADO (Wednesday QA).
 *
 * Verifica que un usuario anónimo puede:
 *   1. Ver el scoreboard público de una ronda activa
 *   2. Acceder al scorer y seleccionar un jugador invitado
 *   3. Scorear hoyos como invitado
 *   4. Ver el banner de registro ("Unirme gratis")
 *
 * El test crea una ronda fixture con un jugador invitado (is_guest=true)
 * y navega SIN autenticación (proyecto mobile-chromium, no auth storageState).
 *
 * IMPORTANTE: estos tests corren en el proyecto ANÓNIMO — no cargan
 * storageState. La ronda se crea vía admin client (bypass RLS).
 */

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function generateCode(): string {
  const alphabet = 'ACDEFGHJKMNPQRSTVWXYZ2345679'
  let code = 'GF' // prefix para identificar fácil en BD
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return code
}

const DEFAULT_COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'
const DEFAULT_COURSE_NAME = 'Los Leones'
const GUEST_NAME = 'Invitado E2E'

interface GuestRondaFixture {
  rondaId: string
  codigo: string
  guestJugadorId: string
}

/** Crea ronda con un jugador invitado (is_guest=true) para el test. */
async function createGuestRondaFixture(creadorId: string): Promise<GuestRondaFixture> {
  const admin = adminClient()
  const codigo = generateCode()

  // Build minimal course_snapshot
  const { data: course } = await admin
    .from('courses')
    .select('par_total, slope_rating, course_rating, si_verificado')
    .eq('id', DEFAULT_COURSE_ID)
    .single()
  const { data: holes } = await admin
    .from('course_holes')
    .select('numero, par, stroke_index, yardaje_blanco, yardaje_azul, yardaje_negras, yardaje_rojo')
    .eq('course_id', DEFAULT_COURSE_ID)
    .order('numero')

  if (!course || !holes?.length) throw new Error('No se pudo cargar Los Leones para fixture')

  const course_snapshot = {
    holes: holes.map(h => ({
      numero: h.numero, par: h.par, stroke_index: h.stroke_index,
      yardaje_blanco: h.yardaje_blanco, yardaje_azul: h.yardaje_azul,
      yardaje_negras: h.yardaje_negras, yardaje_rojo: h.yardaje_rojo,
    })),
    par_total: course.par_total,
    si_source: course.si_verificado ? 'verified' : 'estimated',
    course_rating: course.course_rating,
    slope_rating: course.slope_rating,
  }

  // Insert ronda
  const { data: ronda, error: rondaErr } = await admin
    .from('rondas_libres')
    .insert({
      codigo,
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      tees: 'blanco',
      holes: 18,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
      admin_mode: false,
      estado: 'en_curso',
      creador_id: creadorId,
      course_snapshot,
    })
    .select('id, codigo')
    .single()

  if (rondaErr || !ronda) throw new Error(`createGuestRondaFixture: ${rondaErr?.message}`)

  // Insert guest player (is_guest=true, no user_id)
  const guestPendingId = crypto.randomUUID()
  const { data: jugador, error: jugErr } = await admin
    .from('ronda_libre_jugadores')
    .insert({
      ronda_id: ronda.id,
      user_id: null,
      nombre: GUEST_NAME,
      handicap: null,
      tees: 'blanco',
      scores: {},
      is_guest: true,
      pending_user_id: guestPendingId,
    })
    .select('id')
    .single()

  if (jugErr || !jugador) {
    await admin.from('rondas_libres').delete().eq('id', ronda.id)
    throw new Error(`insert guest jugador: ${jugErr?.message}`)
  }

  return { rondaId: ronda.id, codigo: ronda.codigo, guestJugadorId: jugador.id }
}

test.describe.configure({ mode: 'serial' })

let testUserId: string
let fixture: GuestRondaFixture | null = null

test.beforeAll(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL) return
  testUserId = await getTestUserId()
})

test.afterAll(async () => {
  if (fixture) {
    try { await cleanupRondaFixture(fixture.rondaId) } catch { /* ignore */ }
    fixture = null
  }
})

test('invitado: scoreboard público de ronda activa carga sin auth', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))

  // Crear fixture
  fixture = await createGuestRondaFixture(testUserId)

  // Navegar al scoreboard público SIN auth
  await page.goto(`/ronda-libre/${fixture.codigo}`, { waitUntil: 'networkidle' })

  // No debe redirigir a login
  expect(page.url()).not.toContain('/login')

  // Debe mostrar el nombre de la cancha (hay dos instancias — usar .first())
  await expect(page.getByText(DEFAULT_COURSE_NAME).first()).toBeVisible({ timeout: 10_000 })

  // Debe mostrar el nombre del invitado en el scoreboard
  await expect(page.getByText(GUEST_NAME)).toBeVisible({ timeout: 5_000 })

  expect(errors, 'sin errores JS en scoreboard público').toEqual([])
})

test('invitado: banner de registro aparece para usuario anónimo', async ({ page }) => {
  if (!fixture) test.skip(true, 'fixture no creado')

  await page.goto(`/ronda-libre/${fixture!.codigo}`, { waitUntil: 'networkidle' })

  // Esperar a que la página renderice completamente
  await expect(page.getByText(DEFAULT_COURSE_NAME).first()).toBeVisible({ timeout: 10_000 })

  // El banner aparece tras 8s (timer) o al primer scroll (listener).
  // Usamos scroll + espera larga para cubrir ambos triggers.
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(10_000)

  // El banner debe mostrar "Registra tu propio score" y el CTA "Unirme gratis"
  await expect(page.getByText('Registra tu propio score')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('Unirme gratis')).toBeVisible()

  // El link del CTA debe apuntar a /register con next param
  const ctaLink = page.getByRole('link', { name: 'Unirme gratis' })
  await expect(ctaLink).toHaveAttribute('href', `/register?next=/ronda-libre/${fixture!.codigo}`)
})

test('invitado: scorer carga y permite scorear sin auth', async ({ page }) => {
  if (!fixture) test.skip(true, 'fixture no creado')

  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))

  // Navegar al score page SIN auth
  await page.goto(`/ronda-libre/${fixture!.codigo}/score`, { waitUntil: 'networkidle' })

  // No debe redirigir a login (el score page es público)
  expect(page.url()).not.toContain('/login')

  // Con un solo jugador, el scorer salta directo al scoring (sin "Quien eres?").
  // Si hay múltiples jugadores, mostraría el PlayerSelectorScreen primero.
  // En ambos casos, el botón de score debe ser visible.
  const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
  const playerSelector = page.getByText('Quien eres?')

  // Esperar a que aparezca o el scorer directo o el selector de jugador
  await expect(btnAumentar.or(playerSelector)).toBeVisible({ timeout: 10_000 })

  // Si apareció el selector, seleccionar al invitado
  if (await playerSelector.isVisible()) {
    const guestButton = page.getByRole('button', { name: GUEST_NAME })
    await expect(guestButton).toBeVisible()
    await guestButton.click()
    await expect(btnAumentar).toBeVisible({ timeout: 10_000 })
  }

  // Tap + para poner un score
  await btnAumentar.click()

  // Navegar al siguiente hoyo para triggear save
  const btnSiguiente = page.getByRole('button', { name: 'Siguiente hoyo' })
  await expect(btnSiguiente).toBeVisible()
  await btnSiguiente.click()
  await page.waitForTimeout(2500)

  // Verificar que el score se persistió en BD
  const admin = adminClient()
  const { data } = await admin
    .from('ronda_libre_jugadores')
    .select('scores')
    .eq('id', fixture!.guestJugadorId)
    .single()

  expect(data?.scores, 'scores del invitado no deben ser null').not.toBeNull()
  const scoreEntries = Object.entries(data!.scores as Record<string, number>)
  expect(scoreEntries.length, 'al menos 1 hoyo scoreado').toBeGreaterThanOrEqual(1)

  // Score razonable de golf (1-15)
  const firstScore = scoreEntries[0][1]
  expect(firstScore).toBeGreaterThanOrEqual(1)
  expect(firstScore).toBeLessThanOrEqual(15)

  expect(errors, 'sin errores JS durante scoring invitado').toEqual([])
})

test('invitado: banner se puede cerrar con ×', async ({ page }) => {
  if (!fixture) test.skip(true, 'fixture no creado')

  await page.goto(`/ronda-libre/${fixture!.codigo}`, { waitUntil: 'networkidle' })

  // Esperar a que cargue la página
  await expect(page.getByText(DEFAULT_COURSE_NAME).first()).toBeVisible({ timeout: 10_000 })

  // Trigger banner via scroll + timer
  await page.evaluate(() => window.scrollBy(0, 300))
  await page.waitForTimeout(10_000)
  await expect(page.getByText('Registra tu propio score')).toBeVisible({ timeout: 5_000 })

  // Click the dismiss button (×) — hay dos en la página, usar el del banner (último)
  const dismissBtn = page.getByRole('button', { name: '×' }).last()
  await dismissBtn.click()

  // Banner should disappear
  await expect(page.getByText('Registra tu propio score')).not.toBeVisible({ timeout: 3_000 })
})
