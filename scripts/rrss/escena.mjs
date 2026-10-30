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
import { ESCENAS, teeDeJugador, nombreDelProtagonista } from './escenas.mjs'
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

/**
 * La cancha de la escena, creada en la base de pruebas si no está.
 *
 * Las piezas se graban sobre un club FICTICIO (ver el comentario de
 * `escenas.mjs`): una pieza publicitaria con el nombre de un club real insinúa
 * una relación que no existe. Un club ficticio no está en el catálogo, así que
 * la escena tiene que crearlo, y lo crea desde el MISMO bloque `catalogo` que
 * declara —par, stroke index y los ratings de cada tee— que es el que el test
 * del motor usa para verificar que el gesto cambia al líder. Una sola fuente: si
 * mañana se mueve un stroke index, se mueve en los tres lados a la vez.
 *
 * Solo crea si la escena declara `catalogo.ficticia`. Con un club real, que la
 * cancha no esté en la base es un error que hay que ver —inventarle ratings
 * sería publicar un dato falso sobre la cancha de alguien—, y entonces el que
 * reclama es `canchaPorNombre`.
 *
 * Si la cancha ya existe no la toca: `verificarCatalogo` decide después si los
 * datos siguen siendo los que la escena declara. Así una corrida que encuentra
 * la cancha editada a mano aborta en vez de grabar con otros netos.
 */
async function asegurarCancha(sb, escena) {
  const cat = escena.catalogo
  if (!cat) throw new Error(`la escena "${escena.codigo}" no declara catalogo`)

  const { data: existe, error: errBuscar } = await sb
    .from('courses')
    .select('id')
    .eq('nombre', escena.cancha)
    .limit(1)
  if (errBuscar) throw errBuscar
  if (existe?.length) return
  if (!cat.ficticia) return // club real: lo reclama canchaPorNombre

  // El par de la cancha sale de los hoyos que la escena declara y de ningún otro
  // lado. Acá había un `cat.tees[escena.tee]?.par ?? 72`: la pieza 3 no declara
  // `tee` —no hay jugadores, solo se crea el torneo— así que sembraba 72 de
  // fábrica, y una escena de 9 hoyos o con otro par lo hubiera sembrado igual,
  // sin ruido. El motor calcula el neto contra el par de la base, así que el
  // error se vería recién en el reel publicado, que es el único lugar donde no se
  // puede arreglar. `verificarCatalogo` vuelve a comparar esta suma contra la
  // fila de `courses` antes de cada toma, también cuando la cancha ya existía.
  const sinPar = cat.hoyos.findIndex((h) => typeof h?.par !== 'number')
  if (sinPar !== -1)
    throw new Error(
      `la escena "${escena.codigo}" declara el hoyo ${sinPar + 1} sin par: ` +
        'el par de la cancha se suma de los hoyos y no se puede inventar',
    )
  const parDeLaCancha = cat.hoyos.reduce((total, h) => total + h.par, 0)

  const { data: cancha, error: errCancha } = await sb
    .from('courses')
    .insert({
      nombre: escena.cancha,
      ciudad: cat.ciudad ?? null,
      pais: cat.pais ?? 'Chile',
      par_total: parDeLaCancha,
      course_rating: cat.course_rating ?? null,
      slope_rating: cat.slope_rating ?? null,
      tipo_recorrido: `${cat.hoyos.length}h`,
      activa: true,
      // `fuente` queda marcada para que nadie confunda esta fila con una cancha
      // del catálogo real si se la encuentra mirando la base de pruebas.
      fuente: 'rrss-escena',
      datos_verificados: false,
    })
    .select('id')
    .single()
  if (errCancha) throw errCancha

  const { error: errHoyos } = await sb.from('course_holes').insert(
    cat.hoyos.map((h, i) => ({
      course_id: cancha.id,
      numero: i + 1,
      par: h.par,
      stroke_index: h.si,
      recorrido: 'default',
    })),
  )
  if (errHoyos) throw errHoyos

  const { error: errTees } = await sb.from('course_tees').insert(
    Object.entries(cat.tees).map(([nombre, t]) => ({
      course_id: cancha.id,
      nombre,
      genero: t.genero,
      rating: t.rating,
      slope: t.slope,
      par_total: t.par,
      fuente: 'rrss-escena',
    })),
  )
  if (errTees) throw errTees

  console.log(`   cancha ficticia "${escena.cancha}" creada en la base de pruebas`)
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

  // El par de la FILA de la cancha, que es el que la app muestra como par del
  // recorrido, contra la suma de sus propios hoyos. Una cancha sembrada con un
  // par de fábrica pasaba todas las comparaciones de arriba —hoyo por hoyo
  // calzaba— y el reel salía con un par que no era el de la cancha.
  const { data: fila, error: errPar } = await sb
    .from('courses')
    .select('par_total')
    .eq('id', courseId)
    .single()
  if (errPar) throw errPar
  const sumaDeHoyos = hoyos.reduce((total, h) => total + h.par, 0)
  if (Number(fila.par_total) !== sumaDeHoyos)
    malo.push(
      `la cancha dice par ${fila.par_total} y sus ${hoyos.length} hoyos suman ${sumaDeHoyos}`,
    )

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

/**
 * El avatar de la navbar dice las iniciales del usuario logueado, y el usuario
 * logueado es el primer jugador de la escena (`user_id: adminId` en la fila de
 * `ronda_libre_jugadores`). Con la cuenta de pruebas tal cual, la toma mostraba
 * «ET» arriba a la derecha mientras la tabla decía «Juan Pérez»: la misma
 * persona con dos nombres en el mismo fotograma, y un avatar que delata que
 * atrás hay una cuenta de test.
 *
 * La navbar lo saca de `user_metadata.name` (`Navbar.tsx`), así que se escribe
 * ahí, en la base de PRUEBAS —`clienteDePruebas()` ya abortó si la URL es la de
 * producción— y desde `escena.jugadores[0].nombre`, que es la única fuente del
 * nombre del anotador: cambiarlo en la escena mueve la tabla y el avatar juntos.
 */
async function nombrarAlUsuarioDeLaToma(sb, adminId, escena) {
  const nombre = nombreDelProtagonista(escena)
  const { error } = await sb.auth.admin.updateUserById(adminId, {
    user_metadata: { name: nombre },
  })
  if (error) throw error
}

/**
 * Borra el torneo que la toma va a crear, si quedó de una corrida anterior.
 *
 * La pieza 3 crea el torneo EN CÁMARA, así que la segunda corrida se encontraría
 * con "Copa de Primavera" ya creada: el nombre repetido pasa igual (la app no lo
 * impide) y la toma terminaría en el torneo equivocado, o con un slug
 * "copa-de-primavera-2" en el link de invitación que se graba. Se borra por
 * nombre y organizador, que es lo que la toma crea; el cascade FK limpia los
 * hijos (`publishDraft.compensate` hace exactamente lo mismo al revertir).
 */
async function limpiarTorneoDeLaToma(sb, escena, adminId) {
  const { data, error } = await sb
    .from('tournaments')
    .delete()
    .eq('name', escena.torneo.nombre)
    .eq('organizer_id', adminId)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

export async function sembrarEscena(sb, escena) {
  const adminId = await usuarioDeLaToma(sb)
  await nombrarAlUsuarioDeLaToma(sb, adminId, escena)
  await asegurarCancha(sb, escena)
  const courseId = await canchaPorNombre(sb, escena.cancha)
  await verificarCatalogo(sb, escena, courseId)
  // Escena de torneo: no hay ronda que sembrar porque el torneo lo crea la toma.
  // Lo único que queda por preparar es que no haya quedado el de la corrida
  // anterior; la cancha y el nombre del organizador ya están puestos arriba.
  if (escena.siembra === 'cancha')
    return { courseId, adminId, torneosBorrados: await limpiarTorneoDeLaToma(sb, escena, adminId) }
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
      // La escena manda: una vuelta terminada se siembra 'finalizada' para que
      // la pantalla no diga "EN VIVO" con los cuatro jugadores en F.
      estado: escena.estado ?? 'en_curso',
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
  const sembrado = await sembrarEscena(sb, escena)
  console.log(`✅ escena "${slug}" sembrada`)
  if (escena.siembra === 'cancha') {
    console.log(`   cancha lista: ${escena.cancha} (${sembrado.courseId})`)
    console.log(
      `   el torneo lo crea la toma: "${escena.torneo.nombre}" · ${escena.torneo.fecha} ` +
        `(borrados de corridas anteriores: ${sembrado.torneosBorrados})`,
    )
    console.log('   arranca en: /organizador/nuevo')
    return
  }
  console.log(`   ronda ${escena.codigo} (${sembrado.rondaId}) · ${escena.cancha}`)
  console.log(`   ${escena.jugadores.length} jugadores · ${escena.hoyos_jugados.length} hoyos anotados`)
  // El gesto de la pieza 1 es anotar un golpe; el de la pieza 2, abrir tarjetas.
  // La escena declara uno de los dos, así que se imprime el que traiga.
  const hoyo = escena.hoyo_del_gesto
  if (hoyo) console.log(`   el gesto es el hoyo ${hoyo} (par ${sembrado.pares[hoyo]})`)
  if (escena.tarjetas_del_gesto)
    console.log(`   el gesto abre las tarjetas de ${escena.tarjetas_del_gesto.join(' y ')}`)
  console.log(`   scorer: /ronda-libre/${escena.codigo}/score-grupo`)
  console.log(`   marcador: /ronda-libre/${escena.codigo}`)
}

// pathToFileURL y no una plantilla armada a mano: en Windows la ruta del script
// trae espacios y backslashes, así que la comparación cruda no calzaba nunca y
// el script terminaba sin hacer nada ni fallar.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
