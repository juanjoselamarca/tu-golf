import { createClient } from '@supabase/supabase-js'

/**
 * Fixture de "ronda libre" para E2E tests con writes.
 *
 * - `createRondaFixture()` crea una ronda real en Supabase usando admin client
 *   (bypassa RLS — más rápido que ir vía API route + auth).
 * - `cleanupRondaFixture(id)` borra todo rastro: scores, jugadores, ronda.
 * - Cada fixture tiene metadatos `e2e: true` y fecha actual para identificación.
 *
 * Safety:
 * - Solo usar con service_role key (Claude CTO, no en frontend).
 * - Cada test que crea un fixture DEBE llamar cleanup en afterAll, aún si falla.
 */

// Course que sabemos existe en producción CON course_holes pobladas.
// Default: Los Leones — validado 12-may-2026 contra prod. El anterior default
// ("La Dehesa", 8fb8c2ce-...) no tenía holes y rompía el fixture en CI.
const DEFAULT_COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'
const DEFAULT_COURSE_NAME = 'Los Leones'

export interface RondaFixture {
  id: string
  codigo: string
  course_id: string
  creador_id: string
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function generateCode(): string {
  // Alfabeto unambiguous de src/lib/round-code.ts
  const alphabet = 'ACDEFGHJKMNPQRSTVWXYZ2345679'
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return code
}

export interface CreateRondaOptions {
  codigo?: string
  formato_juego?: 'stroke_play' | 'stableford' | 'match_play'
  modo_juego?: 'gross' | 'neto'
  holes?: 9 | 18
  creadorUserId: string // user_id del test user (obligatorio)
  creadorName?: string
}

/** Genera un course_snapshot mínimo viable desde course_holes + course_tees. */
async function buildSnapshot(courseId: string, tees: string) {
  const admin = adminClient()
  const { data: course } = await admin
    .from('courses')
    .select('par_total, slope_rating, course_rating, si_verificado')
    .eq('id', courseId)
    .single()
  const { data: holes } = await admin
    .from('course_holes')
    .select('numero, par, stroke_index, yardaje_blanco, yardaje_azul, yardaje_negras, yardaje_rojo')
    .eq('course_id', courseId)
    .order('numero')
  const { data: teeData } = await admin
    .from('course_tees')
    .select('rating, slope, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating')
    .eq('course_id', courseId)
    .ilike('nombre', `${tees}%`)
    .limit(1)
    .maybeSingle()
  if (!course || !holes || holes.length === 0) {
    throw new Error(`No se pudo cargar course/holes para ${courseId}`)
  }
  return {
    holes: holes.map(h => ({
      numero: h.numero,
      par: h.par,
      stroke_index: h.stroke_index,
      yardaje_blanco: h.yardaje_blanco,
      yardaje_azul: h.yardaje_azul,
      yardaje_negras: h.yardaje_negras,
      yardaje_rojo: h.yardaje_rojo,
    })),
    par_total: course.par_total,
    si_source: course.si_verificado ? 'verified' : 'estimated',
    course_rating: teeData?.rating ?? course.course_rating,
    slope_rating: teeData?.slope ?? course.slope_rating,
    front_course_rating: teeData?.front_course_rating ?? null,
    front_slope_rating: teeData?.front_slope_rating ?? null,
    back_course_rating: teeData?.back_course_rating ?? null,
    back_slope_rating: teeData?.back_slope_rating ?? null,
  }
}

export async function createRondaFixture(opts: CreateRondaOptions): Promise<RondaFixture> {
  const admin = adminClient()
  const codigo = opts.codigo ?? generateCode()
  const formato_juego = opts.formato_juego ?? 'stroke_play'
  const modo_juego = opts.modo_juego ?? 'gross'
  const holes = opts.holes ?? 18
  const name = opts.creadorName ?? 'E2E Test'

  // Generar course_snapshot inmutable (replica lo que hace el wizard real)
  const course_snapshot = await buildSnapshot(DEFAULT_COURSE_ID, 'blanco')

  // 1. Insert ronda — schema real según create/route.ts
  const { data: ronda, error: rondaErr } = await admin
    .from('rondas_libres')
    .insert({
      codigo,
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      tees: 'blanco',
      holes,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego,
      modo_juego,
      admin_mode: false,
      estado: 'en_curso',
      creador_id: opts.creadorUserId,
      course_snapshot,
    })
    .select('id, codigo, course_id, creador_id')
    .single()

  if (rondaErr || !ronda) {
    throw new Error(`createRondaFixture falló: ${rondaErr?.message ?? 'unknown'}`)
  }

  // 2. Insert jugador (creador juega su propia ronda)
  const { error: jugErr } = await admin
    .from('ronda_libre_jugadores')
    .insert({
      ronda_id: ronda.id,
      user_id: opts.creadorUserId,
      nombre: name,
      handicap: null,
      tees: 'blanco',
      scores: {},
      is_guest: false,
    })

  if (jugErr) {
    // Cleanup parcial — borrar la ronda huérfana
    await admin.from('rondas_libres').delete().eq('id', ronda.id)
    throw new Error(`insert jugador falló: ${jugErr.message}`)
  }

  return ronda as RondaFixture
}

export async function cleanupRondaFixture(id: string): Promise<void> {
  const admin = adminClient()
  // Orden importa — borrar children antes que parent (FK constraints)
  await admin.from('hole_scores').delete().eq('ronda_libre_id', id)
  await admin.from('ronda_libre_jugadores').delete().eq('ronda_id', id)
  await admin.from('rondas_libres').delete().eq('id', id)
}

/**
 * Cleanup masivo de TODAS las rondas e2e sin depender de un id específico.
 * Útil como safety net — borra todas las rondas creadas por el test user.
 */
export async function cleanupAllE2ERondas(testUserId: string): Promise<number> {
  const admin = adminClient()
  const { data: rondas } = await admin
    .from('rondas_libres')
    .select('id')
    .eq('creador_id', testUserId)
  const ids = (rondas ?? []).map(r => r.id)
  for (const id of ids) await cleanupRondaFixture(id)
  return ids.length
}

/**
 * Resuelve el user id del usuario de prueba.
 *
 * OJO con el manejo de error: antes esto hacía `const { data } = await listUsers()`
 * y descartaba el `error`. Cuando la Auth Admin API devolvía un 5xx transitorio,
 * `data` venía null y el test moría con "Test user no encontrado: <email>" — un
 * mensaje que MIENTE (el usuario existe) y manda a buscar el bug al lado equivocado.
 * Pasó el 2026-07-24 en el Import Canary programado. Ahora: el error de la API se
 * propaga tal cual, y se reintenta 3× con backoff antes de rendirse.
 */
export async function getTestUserId(): Promise<string> {
  const admin = adminClient()
  const email = process.env.E2E_TEST_USER_EMAIL
  if (!email) throw new Error('E2E_TEST_USER_EMAIL no configurado')

  let lastApiError: string | null = null
  for (let intento = 1; intento <= 3; intento++) {
    const { data: users, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error || !users) {
      lastApiError = error?.message ?? 'respuesta vacía sin error'
      if (intento < 3) {
        await new Promise(r => setTimeout(r, intento * 1000))
        continue
      }
      throw new Error(
        `Auth Admin API falló al listar usuarios (${intento} intentos): ${lastApiError}. ` +
          'Esto NO significa que el usuario de prueba no exista — revisá credenciales o estado de Supabase.'
      )
    }
    const u = users.users.find(x => x.email === email)
    if (!u) throw new Error(`Test user no encontrado: ${email} (la API respondió OK con ${users.users.length} usuarios)`)
    return u.id
  }
  throw new Error(`Auth Admin API falló al listar usuarios: ${lastApiError}`)
}

/**
 * Crea un usuario efímero para tests que necesitan MUTAR el perfil (ej: fijar
 * `default_tee_color`). Nunca usar el usuario compartido para eso: dos corridas
 * de CI simultáneas (push a main + PR) se pisan el perfil y el canario falla con
 * asserts imposibles. Pasó el 2026-07-23. El trigger `on_auth_user_created` crea
 * la fila en `profiles` automáticamente.
 */
export async function createEphemeralUser(prefix: string): Promise<string> {
  const admin = adminClient()
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@golfersplus-test.local`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Ef1mero-${Math.random().toString(36).slice(2, 10)}!`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`No se pudo crear usuario efímero: ${error?.message ?? 'sin usuario'}`)
  return data.user.id
}

/** Borra el usuario efímero y todo lo que colgaba de él (cascade en profiles). */
export async function deleteEphemeralUser(userId: string): Promise<void> {
  const admin = adminClient()
  await admin.from('historical_rounds').delete().eq('user_id', userId)
  await admin.auth.admin.deleteUser(userId)
}
