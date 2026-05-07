import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getTestUserId } from './helpers/ronda-fixture'

/**
 * E2E del fix del 2026-05-06: el botón "Finalizar" en /score-grupo debe
 * mostrar copy explícito cuando hay hoyos sin marcar, y rellenarlos con
 * par al confirmar (en vez de perder los datos silenciosamente).
 *
 * Bug origen: Juanjo, 30-abr-2026, Los Leones, ronda 566RV4 — hizo 38 en 9
 * hoyos pero solo 8 se persistieron (hoyo 9 = par 5 quedó undefined).
 *
 * Este test crea una ronda admin_mode + va directo al último hoyo sin
 * marcar nada → tap Finalizar → primer tap activa confirmación → copy
 * debe ser "¿Marcar N hoyos como par y finalizar?".
 *
 * Pre-fix: el copy era "¿Guardar ronda parcial (0/9 hoyos)?".
 * Post-fix: el copy es "¿Marcar N hoyos como par y finalizar?".
 */

const COURSE_ID = '8fb8c2ce-a8ec-4938-bc05-e77e2dcb2281' // La Dehesa (estable en prod)
const COURSE_NAME = 'Club de Golf La Dehesa'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function generateCode(): string {
  const alphabet = 'ACDEFGHJKMNPQRSTVWXYZ2345679'
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return code
}

let testUserId: string
let createdRondaId: string | null = null

test.beforeAll(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL) return
  testUserId = await getTestUserId()
})

test.beforeEach(() => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
  }
})

test.afterEach(async () => {
  if (!createdRondaId) return
  const admin = adminClient()
  await admin.from('hole_scores').delete().eq('ronda_libre_id', createdRondaId)
  await admin.from('ronda_libre_jugadores').delete().eq('ronda_id', createdRondaId)
  await admin.from('rondas_libres').delete().eq('id', createdRondaId)
  createdRondaId = null
})

async function createAdminRonda(holes: 9 | 18): Promise<{ id: string; codigo: string }> {
  const admin = adminClient()
  const codigo = generateCode()

  const { data: course } = await admin
    .from('courses')
    .select('par_total, slope_rating, course_rating, si_verificado')
    .eq('id', COURSE_ID).single()
  const { data: cholesData } = await admin
    .from('course_holes')
    .select('numero, par, stroke_index, yardaje_blanco, yardaje_azul, yardaje_campeonato, yardaje_rojo')
    .eq('course_id', COURSE_ID).order('numero')
  const choles = cholesData ?? []

  const { data: ronda, error } = await admin
    .from('rondas_libres')
    .insert({
      codigo,
      course_id: COURSE_ID,
      course_name: COURSE_NAME,
      tees: 'blanco',
      holes,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
      admin_mode: true,
      admin_user_id: testUserId,
      estado: 'en_curso',
      creador_id: testUserId,
      course_snapshot: {
        holes: choles.map(h => ({
          numero: h.numero, par: h.par, stroke_index: h.stroke_index,
          yardaje_blanco: h.yardaje_blanco, yardaje_azul: h.yardaje_azul,
          yardaje_campeonato: h.yardaje_campeonato, yardaje_rojo: h.yardaje_rojo,
        })),
        par_total: course?.par_total,
        slope_rating: course?.slope_rating,
        course_rating: course?.course_rating,
      },
    })
    .select('id, codigo')
    .single()

  if (error || !ronda) throw new Error(`Crear ronda falló: ${error?.message}`)

  await admin.from('ronda_libre_jugadores').insert({
    ronda_id: ronda.id, user_id: testUserId, nombre: 'E2E Test',
    handicap: null, tees: 'blanco', scores: {}, is_guest: false,
  })

  createdRondaId = ronda.id
  return ronda as { id: string; codigo: string }
}

test('finalize en grupo con hoyos sin marcar pide confirmar auto-fill con par', async ({ page }) => {
  const { codigo } = await createAdminRonda(9)

  await page.goto(`/ronda-libre/${codigo}/score-grupo`, { waitUntil: 'networkidle' })
  expect(page.url(), 'no debería redirigir a /login').not.toContain('/login')

  // Click directo en el hoyo 9 desde la barra de progreso para no marcar nada
  // (deja todos los 9 hoyos en estado missing).
  await page.locator('text=/^9$/').first().click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(500)

  // Primer tap en Finalizar → activa confirmación → copy debería contener
  // "Marcar N hoyos como par y finalizar"
  const finalizarBtn = page.getByRole('button', { name: /Finalizar ronda/i }).first()
  await expect(finalizarBtn).toBeVisible({ timeout: 10_000 })
  await finalizarBtn.click()

  // Después del primer tap, el botón cambia a estado "confirmFinalize=true"
  // El copy esperado para missingCount=9: "¿Marcar 9 hoyos como par y finalizar?"
  await expect(
    page.getByRole('button', { name: /Marcar.*como par y finalizar/i }).first()
  ).toBeVisible({ timeout: 5_000 })
})
