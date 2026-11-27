import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient, sinError, DEFAULT_COURSE_ID, DEFAULT_COURSE_NAME } from './ronda-fixture'

/**
 * Scramble rápido «un celular por equipo» (#857–#862): lo que comparten los E2E de equipos con el hándicap del club.
 * Las rondas se crean por la API REAL del wizard y los reclamos/liberaciones van por las RPC con la sesión de cada
 * celular; service_role solo lee para verificar (o prepara un estado que la UI no puede producir sola).
 */

/** Cliente con la sesión de una cuenta (anon key + login): las RPC corren como ese celular, no como service_role. */
export async function clienteConSesion(email: string, password: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const db = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login de ${email}: ${error.message}`)
  return db
}

/** El cliente con la sesión del usuario e2e (el creador de las rondas). */
export async function clienteDelUsuarioE2E(): Promise<SupabaseClient> {
  const email = process.env.E2E_TEST_USER_EMAIL
  const password = process.env.E2E_TEST_USER_PASSWORD
  if (!email || !password) throw new Error('Faltan E2E_TEST_USER_EMAIL/PASSWORD (correr con scripts/test-db/e2e-local.mjs)')
  return clienteConSesion(email, password)
}

/**
 * El nombre del perfil tal cual: el trigger `ronda_equipos_anotador_nombre` lo copia sin tocar, y «lo anota …» lo
 * muestra igual. Sin nombre, los asserts de «lo anota …» no se pueden afirmar: se falla acá.
 */
export async function nombreDePerfil(userId: string): Promise<string> {
  const perfil = await sinError('perfil', adminClient().from('profiles').select('name').eq('id', userId).single())
  const nombre = (perfil as { name: string | null }).name ?? ''
  if (!nombre.trim()) throw new Error(`El perfil ${userId} no tiene nombre: «lo anota …» no se puede afirmar`)
  return nombre
}

export type FilaEquipo = {
  id: string
  nombre: string
  handicap_origen: string
  anotador_user_id: string | null
  anotador_nombre: string | null
  scores: Record<string, number> | null
}

/**
 * Ronda scramble gross de 9 hoyos con equipos del club y `quien_anota: 'cada_equipo'`, por la API real del wizard
 * (`request` con la sesión del creador). La API deja el equipo 1 anotado por el creador y los demás libres.
 */
export async function crearScrambleDeClub(
  request: APIRequestContext,
  creador: { id: string; nombre: string },
  equipos: string[],
  /** Con drives: los 4 jugadores de cada equipo, por nombre de equipo (sin la clave, el equipo no se lista). */
  drives?: Record<string, string[]>,
): Promise<{ id: string; codigo: string }> {
  const res = await request.post('/api/ronda-libre/create', {
    data: {
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      tees: 'blanco',
      holes: 9,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'scramble',
      modo_juego: 'gross',
      admin_mode: true, // lo decide el servidor con equipos de club: debe quedar en false con 'cada_equipo'
      jugadores: [{ nombre: creador.nombre, user_id: creador.id, handicap: null, tees: 'blanco' }],
      equipos_de_club: {
        equipos: equipos.map(nombre => ({ nombre, handicap: null, ...(drives ? { driveJugadores: drives[nombre] } : {}) })),
        quien_anota: 'cada_equipo',
        ...(drives ? { anotar_drives: true } : {}),
      },
    },
  })
  const body = await res.json()
  expect(res.status(), `create scramble de club: ${JSON.stringify(body)}`).toBe(200)
  return { id: body.ronda_id, codigo: body.codigo }
}

/** Los equipos de la ronda por nombre, leídos del servidor. */
export async function equiposDe(rondaId: string): Promise<Record<string, FilaEquipo>> {
  const filas = await sinError(
    'equipos de la ronda',
    adminClient().from('ronda_equipos').select('id, nombre, handicap_origen, anotador_user_id, anotador_nombre, scores').eq('ronda_id', rondaId),
  )
  return Object.fromEntries((filas as FilaEquipo[]).map(f => [f.nombre, f]))
}

/** Golpes de un equipo en un hoyo, leídos del servidor (lo que ve la tabla en vivo). */
export async function golpeDelEquipo(rondaId: string, nombre: string, hoyo: number): Promise<number | null> {
  return (await equiposDe(rondaId))[nombre]?.scores?.[String(hoyo)] ?? null
}

/**
 * Tarjeta de un equipo en el scorer: el bloque más interno con su nombre y el botón «+». Se excluyen los contenedores
 * que envuelven la franja de otro celular: si no, la página entera «tiene» el nombre (en la franja) y un «+» ajeno.
 */
export function tarjetaDeEquipo(page: Page, nombre: string) {
  return page
    .locator('div')
    .filter({ has: page.getByText(nombre, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: '+', exact: true }) })
    .filter({ hasNot: page.getByRole('region', { name: 'Equipos que anota otro celular' }) })
    .last()
}

/** Entra por el formulario de /login con otra cuenta (navegador propio de ese «celular»). */
export async function entrarComo(page: Page, cuenta: { email: string; password: string }): Promise<void> {
  await page.goto('/login')
  await page.locator('input[type="email"]').first().fill(cuenta.email)
  await page.locator('input[placeholder="Tu contraseña"]').first().fill(cuenta.password)
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45_000 })
}
