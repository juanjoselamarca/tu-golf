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
import { ESCENAS, teeDeJugador } from './escenas.mjs'
import { PROD_REF, projectRefDe } from '../lib/supabase-ref.mjs'

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
  // Se compara el REF, no el texto de la URL: `includes()` lo esquivaba un ref
  // en mayúsculas (https://HOSWF….supabase.co pasaba y entraba a prod con la
  // service-role key). `projectRefDe` lo baja a minúsculas; es la misma fuente
  // que usan run-sql y el resto de los scripts.
  if (projectRefDe(url) === PROD_REF)
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
  if (data.length > 1) throw new Error(`"${nombre}" matchea ${data.length} canchas: afina el nombre`)
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

/**
 * El catálogo que la escena DECLARA tiene que ser el que está en la base.
 *
 * La escena escribe par, stroke index y ratings de tee en `escenas.mjs` para que
 * el test del motor pueda verificar la historia sin base. Si el catálogo cambia
 * —y cambia: se corrigen ratings y se auditan yardajes— el test seguiría verde
 * contra datos viejos y la toma saldría con otros netos. Acá se comparan, y si
 * no calzan la siembra aborta diciendo exactamente qué dato se movió.
 */
async function verificarCatalogo(sb, escena, courseId) {
  const cat = escena.catalogo
  if (!cat) throw new Error(`la escena "${escena.codigo}" no declara catalogo`)
  const malo = []

  const { data: hoyos, error: errH } = await sb
    .from('course_holes')
    .select('numero, par, stroke_index')
    .eq('course_id', courseId)
    .order('numero')
  if (errH) throw errH
  if (hoyos.length !== cat.hoyos.length)
    malo.push(`la cancha tiene ${hoyos.length} hoyos y la escena declara ${cat.hoyos.length}`)
  for (const h of hoyos) {
    const d = cat.hoyos[h.numero - 1]
    if (!d) continue
    if (h.par !== d.par) malo.push(`hoyo ${h.numero}: par ${h.par} en la base, ${d.par} declarado`)
    if (h.stroke_index !== d.si)
      malo.push(`hoyo ${h.numero}: SI ${h.stroke_index} en la base, ${d.si} declarado`)
  }

  const { data: tees, error: errT } = await sb
    .from('course_tees')
    .select('nombre, genero, rating, slope, par_total')
    .eq('course_id', courseId)
  if (errT) throw errT
  for (const [nombre, d] of Object.entries(cat.tees)) {
    // El MISMO predicado que usa el motor para resolver el tee: prefijo y sin
    // distinguir mayúsculas (`resolverCourseData` hace
    // `.ilike('nombre', tee + '%').limit(1)`, src/golf/core/course-handicap.ts).
    // Con igualdad exacta la guarda no veía el caso que tiene que cazar: hoy los
    // nombres son únicos por cancha, pero si mañana se carga un "Blanco Damas",
    // acá habría una sola fila "blanco" y el motor elegiría entre dos sin
    // `order()` —la toma se grabaría con el rating de otro tee.
    const filas = tees.filter((t) => t.nombre.toLowerCase().startsWith(nombre.toLowerCase()))
    if (filas.length > 1) {
      malo.push(
        `el tee "${nombre}" matchea ${filas.length} filas de la cancha (${filas.map((f) => f.nombre).join(', ')}): ` +
          'el motor resuelve por prefijo y se queda con una sin ordenar, así que la escena no puede saber cuál juega',
      )
      continue
    }
    const fila = filas[0]
    if (!fila) {
      malo.push(`el tee "${nombre}" no está en el catálogo de la cancha`)
      continue
    }
    for (const [campo, declarado] of [
      ['genero', d.genero],
      ['rating', d.rating],
      ['slope', d.slope],
      ['par_total', d.par],
    ]) {
      if (Number(fila[campo]) !== Number(declarado) && fila[campo] !== declarado)
        malo.push(`tee ${nombre}: ${campo} ${fila[campo]} en la base, ${declarado} declarado`)
    }
  }

  if (malo.length)
    throw new Error(
      `el catálogo de "${escena.cancha}" ya no es el que declara escenas.mjs:\n   - ` +
        malo.join('\n   - ') +
        '\n   Actualiza escenas.mjs y vuelve a correr el test del motor antes de grabar.',
    )
}

export async function sembrarEscena(sb, escena) {
  const adminId = await usuarioDeLaToma(sb)
  const courseId = await canchaPorNombre(sb, escena.cancha)
  await verificarCatalogo(sb, escena, courseId)
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
      holes: escena.holes,
      hoyo_inicio: 1,
      estado: 'en_curso',
      // es_demo NO: una ronda demo es spectator-only (useRondaGrupoData la manda
      // de vuelta a la vista pública) y la toma es justamente anotar un golpe.
      es_demo: false,
      hcp_pct: escena.hcp_pct,
      modo_juego: escena.modo_juego,
      formato_juego: escena.formato_juego,
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
    // El tee DEL JUGADOR (damas desde el rojo): de ahí salen su rating y su
    // slope, y con eso su course handicap. `courseHandicapsDeRonda` resuelve
    // course data por tee, así que esta columna es la que decide el neto.
    tees: teeDeJugador(escena, j),
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
