#!/usr/bin/env node
// Siembra la escena de una pieza de video en la BASE DE PRUEBAS: la ronda, los
// jugadores y los golpes ya anotados hasta el hoyo anterior al del gesto.
//
//   node --env-file=.env.local scripts/test-db/con-base-de-pruebas.mjs -- \
//     node scripts/rrss/escena.mjs <slug>
//
// Es idempotente: borra la ronda de la escena por su código fijo y la vuelve a
// crear igual. Que el dato sea el MISMO en cada corrida es el punto: si hay que
// regrabar la pieza con otro encuadre, el leaderboard tiene que quedar idéntico.
//
// Nunca contra producción: la guarda de abajo corta antes de tocar nada.
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ESCENAS } from './escenas.mjs'

const REF_PROD = 'hoswfwhvcgqlqdmzpnce'

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
        'Este script se corre envuelto en scripts/test-db/con-base-de-pruebas.mjs.',
    )
  // La escena ESCRIBE: crea una ronda y golpes. En prod eso es basura visible en
  // /en-vivo, así que la URL de prod aborta acá y no en la primera inserción.
  if (url.includes(REF_PROD))
    throw new Error(
      `escena.mjs apunta a PRODUCCIÓN (${url}). Se corre solo contra la base de pruebas, ` +
        'envuelto en scripts/test-db/con-base-de-pruebas.mjs.',
    )
  return createClient(url, key, { auth: { persistSession: false } })
}

/** El usuario con el que Playwright inicia sesión; es el admin de la ronda. */
async function usuarioDeLaToma(sb) {
  const email = process.env.E2E_TEST_USER_EMAIL
  if (!email) throw new Error('falta E2E_TEST_USER_EMAIL (lo mapea con-base-de-pruebas.mjs)')
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error(`la base de pruebas no tiene el usuario ${email}`)
  return user.id
}

async function canchaPorNombre(sb, nombre) {
  const { data, error } = await sb.from('courses').select('id, nombre').eq('nombre', nombre).limit(2)
  if (error) throw error
  if (!data?.length) throw new Error(`la base de pruebas no tiene la cancha "${nombre}"`)
  if (data.length > 1) throw new Error(`"${nombre}" matchea ${data.length} canchas: afiná el nombre`)
  return data[0].id
}

/**
 * Los pares de la cancha, para que el guion pueda decir "birdie" y no un número
 * suelto. Par de la CANCHA, no de la ronda: con hoyo_inicio != 1 no son lo mismo.
 */
async function paresDeLaCancha(sb, courseId) {
  const { data, error } = await sb
    .from('course_holes')
    .select('numero, par')
    .eq('course_id', courseId)
    .order('numero')
  if (error) throw error
  if (!data?.length) throw new Error(`la cancha ${courseId} no tiene hoyos cargados`)
  return Object.fromEntries(data.map((h) => [h.numero, h.par]))
}

export async function sembrarEscena(sb, escena) {
  const adminId = await usuarioDeLaToma(sb)
  const courseId = await canchaPorNombre(sb, escena.cancha)
  const pares = await paresDeLaCancha(sb, courseId)

  // Borrar y recrear, no actualizar: una ronda a medio pisar daría una toma
  // distinta en cada corrida y la escena dejaría de ser reproducible.
  const { data: previa } = await sb
    .from('rondas_libres')
    .select('id')
    .eq('codigo', escena.codigo)
    .maybeSingle()
  if (previa) {
    await sb.from('ronda_libre_jugadores').delete().eq('ronda_id', previa.id)
    await sb.from('rondas_libres').delete().eq('id', previa.id)
  }

  const { data: ronda, error: errRonda } = await sb
    .from('rondas_libres')
    .insert({
      codigo: escena.codigo,
      course_id: courseId,
      course_name: escena.cancha,
      fecha: escena.fecha,
      holes: 18,
      hoyo_inicio: 1,
      estado: 'en_curso',
      // es_demo NO: una ronda demo es spectator-only (useRondaGrupoData la manda
      // de vuelta a la vista pública) y la toma es justamente anotar un golpe.
      es_demo: false,
      hcp_pct: 100,
      modo_juego: escena.modo_juego,
      formato_juego: 'stroke_play',
      tees: escena.tee,
      admin_mode: true,
      admin_user_id: adminId,
      creador_id: adminId,
    })
    .select('id')
    .single()
  if (errRonda) throw errRonda

  const filas = escena.jugadores.map((j, i) => ({
    ronda_id: ronda.id,
    nombre: j.nombre,
    handicap: j.handicap,
    tees: escena.tee,
    is_guest: i > 0,
    user_id: i === 0 ? adminId : null,
    scores: Object.fromEntries(
      j.golpes.map((golpes, idx) => [String(escena.hoyos_jugados[idx]), golpes]),
    ),
  }))
  const { error: errJug } = await sb.from('ronda_libre_jugadores').insert(filas)
  if (errJug) throw errJug

  return { rondaId: ronda.id, courseId, pares, adminId }
}

async function main() {
  const slug = process.argv[2]
  const escena = ESCENAS[slug]
  if (!escena) {
    console.error(`Escena "${slug ?? ''}" no existe. Hay: ${Object.keys(ESCENAS).join(', ')}`)
    process.exit(1)
  }
  const sb = cliente()
  const { rondaId, pares } = await sembrarEscena(sb, escena)
  const hoyo = escena.hoyo_del_gesto
  console.log(`✅ escena "${slug}" sembrada`)
  console.log(`   ronda ${escena.codigo} (${rondaId}) · ${escena.cancha}`)
  console.log(`   ${escena.jugadores.length} jugadores · hoyos ${escena.hoyos_jugados.join(',')} anotados`)
  console.log(`   el gesto es el hoyo ${hoyo} (par ${pares[hoyo]})`)
  console.log(`   scorer: /ronda-libre/${escena.codigo}/score-grupo`)
}

// pathToFileURL y no una plantilla armada a mano: en Windows la ruta del script
// trae espacios y backslashes, así que la comparación cruda no calzaba nunca y
// el script terminaba sin hacer nada ni fallar.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
