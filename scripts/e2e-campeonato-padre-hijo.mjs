/**
 * E2E en vivo — ciclo del campeonato "Padre e Hijo" (scramble · neto · 9h).
 * Ejecutar: node --env-file=.env.local scripts/e2e-campeonato-padre-hijo.mjs
 *
 * Siembra un torneo DESCARTABLE (slug qa-padre-hijo-<ts>) sobre el child 9h
 * "Norte" con un EMPATE diseñado entre 2 parejas, y verifica CONTRA PROD:
 *  - P2-1: el desempate USGA ordena la pareja ganadora del empate primero.
 *  - P2-2: la vista de resultados muestra el PODIO DE PAREJAS (no el individual).
 *  - #252/#245: el board de equipos 9h no viene vacío (net computado).
 *  - P0-1: la RPC de scoring de equipos rechaza editar tras cerrar (congelado).
 * Limpia TODO al final por IDs rastreados (torneos reales intactos).
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'
if (!URL || !KEY) { console.error('Faltan SUPABASE vars en .env.local'); process.exit(1) }
const sb = createClient(URL, KEY)

// Child 9h "Norte" (Brisas de Santo Domingo) — SI limpio 1..9, par-9 real.
const COURSE_ID = '78c9b8d2-0608-46fa-8085-c7a652601ce8'
const TS = Date.now()
const SLUG = `qa-padre-hijo-${TS}`

let passed = 0, failed = 0
const pass = (t, d = '') => { passed++; console.log(`  ✅ ${t}${d ? ' — ' + d : ''}`) }
const fail = (t, d = '') => { failed++; console.error(`  ❌ ${t}${d ? ' — ' + d : ''}`) }

// Empate diseñado: A y B mismo total (35), A mejor en los últimos 6 (back-6) →
// A debe quedar 1°. C claramente 3° (45). handicap_equipo=0 → neto = gross.
const TEAMS = [
  { key: 'A', nombre: `Aguilas QA ${TS}`,  hcp: 0, scores: [4,4,4,4,4,4,3,4,4], jugadores: [`Juan A ${TS}`, `Pedro A ${TS}`] }, // 35, back6=23
  { key: 'B', nombre: `Condores QA ${TS}`, hcp: 0, scores: [3,4,4,4,4,4,4,4,4], jugadores: [`Ana B ${TS}`,  `Luis B ${TS}`]  }, // 35, back6=24
  { key: 'C', nombre: `Halcones QA ${TS}`, hcp: 0, scores: [5,5,5,5,5,5,5,5,5], jugadores: [`Nico C ${TS}`, `Tomas C ${TS}`] }, // 45
]
const scoresObj = (arr) => Object.fromEntries(arr.map((v, i) => [String(i + 1), v]))

const ids = { tournament: null, groups: [], equipos: [], jugadores: [], links: [], rondas: [] }

async function cleanup() {
  console.log('\n── Limpieza ──')
  try {
    if (ids.links.length)     await sb.from('ronda_equipo_jugadores').delete().in('id', ids.links)
    if (ids.equipos.length)   await sb.from('ronda_equipos').delete().in('id', ids.equipos)
    if (ids.jugadores.length) await sb.from('ronda_libre_jugadores').delete().in('id', ids.jugadores)
    if (ids.groups.length)    await sb.from('tournament_groups').delete().in('id', ids.groups)
    if (ids.rondas.length)    await sb.from('rondas_libres').delete().in('id', ids.rondas)
    if (ids.tournament)       await sb.from('tournaments').delete().eq('id', ids.tournament)
    // Verificar que el torneo ya no existe.
    const { data } = await sb.from('tournaments').select('id').eq('slug', SLUG)
    if (!data || data.length === 0) pass('cleanup: torneo qa- eliminado')
    else fail('cleanup: quedó el torneo', SLUG)
  } catch (e) { fail('cleanup', e.message) }
}

async function main() {
  console.log(`\n══ E2E campeonato Padre e Hijo — ${SLUG} ══`)

  // 0) Organizador (admin cualquiera) + nombre del course.
  const { data: admin } = await sb.from('profiles').select('id').eq('role', 'admin').limit(1).single()
  if (!admin) throw new Error('no hay admin')
  const { data: course } = await sb.from('courses').select('nombre').eq('id', COURSE_ID).single()
  if (!course) throw new Error('course child-Norte no existe: ' + COURSE_ID)

  // 1) Torneo cerrado, scramble·neto·9h, sobre el child 9h "Norte".
  const { data: t, error: tErr } = await sb.from('tournaments').insert({
    name: `QA Padre e Hijo ${TS}`, slug: SLUG, organizer_id: admin.id,
    status: 'closed', format: 'stroke_play', formato_juego: 'scramble', modo_juego: 'neto',
    hole_count: 9, course_id: COURSE_ID, course_name: course.nombre,
    date_start: new Date().toISOString().split('T')[0],
  }).select('id').single()
  if (tErr) throw new Error('tournament insert: ' + tErr.message)
  ids.tournament = t.id
  pass('torneo sembrado', `status=closed scramble/neto/9h`)

  // 2) Por equipo: ronda_libre + ronda_equipos + jugadores + link + group.
  for (const team of TEAMS) {
    const { data: r, error: rErr } = await sb.from('rondas_libres').insert({
      codigo: `QA${team.key}${String(TS).slice(-6)}`, course_id: COURSE_ID, course_name: course.nombre,
      tees: 'azul', holes: 9, modo_juego: 'neto', formato_juego: 'scramble',
      creador_id: admin.id, admin_user_id: admin.id, fecha: new Date().toISOString().split('T')[0],
      estado: 'finalizada', es_demo: true,
    }).select('id, codigo').single()
    if (rErr) throw new Error('ronda ' + team.key + ': ' + rErr.message)
    ids.rondas.push(r.id); team.rondaId = r.id; team.codigo = r.codigo

    const { data: eq, error: eErr } = await sb.from('ronda_equipos').insert({
      ronda_id: r.id, nombre: team.nombre, handicap_equipo: team.hcp, scores: scoresObj(team.scores),
    }).select('id').single()
    if (eErr) throw new Error('equipo ' + team.key + ': ' + eErr.message)
    ids.equipos.push(eq.id); team.equipoId = eq.id

    for (let p = 0; p < team.jugadores.length; p++) {
      const { data: j } = await sb.from('ronda_libre_jugadores').insert({
        ronda_id: r.id, nombre: team.jugadores[p], scores: {}, handicap: 10, is_guest: true,
      }).select('id').single()
      ids.jugadores.push(j.id)
      const { data: l } = await sb.from('ronda_equipo_jugadores').insert({
        equipo_id: eq.id, jugador_id: j.id, orden: p + 1,
      }).select('id').single()
      ids.links.push(l.id)
    }

    const { data: g } = await sb.from('tournament_groups').insert({
      tournament_id: t.id, name: team.nombre, ronda_libre_id: r.id, sort_order: 0,
    }).select('id').single()
    ids.groups.push(g.id)
  }
  pass('3 parejas sembradas', 'A/B empate (35), C 3° (45)')

  // 3) Verificación en vivo del board + podio (SSR compute path desplegado).
  console.log('\n── Verificación en vivo (prod) ──')
  const res = await fetch(`${SITE}/torneo/${SLUG}`, { redirect: 'manual', cache: 'no-store' })
  res.status === 200 ? pass('GET /torneo/<slug>', '200') : fail('GET /torneo/<slug>', 'status ' + res.status)
  const html = await res.text()

  const iA = html.indexOf(TEAMS[0].nombre)
  const iB = html.indexOf(TEAMS[1].nombre)
  const iC = html.indexOf(TEAMS[2].nombre)
  ;(iA >= 0 && iB >= 0 && iC >= 0)
    ? pass('board no vacío', 'las 3 parejas aparecen (net computado)')
    : fail('board vacío o parejas faltantes', `iA=${iA} iB=${iB} iC=${iC}`)

  // P2-1: desempate USGA → A (mejor back-6) antes que B; C último.
  ;(iA >= 0 && iB >= 0 && iA < iB)
    ? pass('P2-1 desempate', 'A (back-6 mejor) ordena antes que B en el empate')
    : fail('P2-1 desempate', `A debía ir antes que B (iA=${iA} iB=${iB})`)
  ;(iB >= 0 && iC >= 0 && iB < iC)
    ? pass('orden ranking', 'C (peor neto) queda último')
    : fail('orden ranking', `C debía ir último (iB=${iB} iC=${iC})`)

  // P2-2: la vista de resultados muestra el podio de PAREJAS.
  html.includes('Podio de parejas')
    ? pass('P2-2 podio de parejas', 'render de equipos (no individual)')
    : fail('P2-2 podio de parejas', 'no se encontró el label "Podio de parejas"')

  // 4) P0-1 congelado: la RPC rechaza editar un equipo de ronda 'finalizada'.
  console.log('\n── Congelado post-cierre (P0-1) ──')
  const teamA = TEAMS[0]
  const { error: rpcErr } = await sb.rpc('upsert_ronda_equipos_scores', {
    p_equipo_id: teamA.equipoId, p_codigo: teamA.codigo, p_delta: { '1': 3 },
  })
  if (rpcErr && /RONDA_FINALIZED|P0002/.test(`${rpcErr.message} ${rpcErr.code}`)) {
    pass('P0-1 congelado', 'RPC rechaza editar score tras cerrar (RONDA_FINALIZED)')
  } else if (rpcErr) {
    fail('P0-1 congelado', 'error inesperado: ' + rpcErr.message + ' / ' + rpcErr.code)
  } else {
    fail('P0-1 congelado', 'la RPC ACEPTÓ una edición tras cerrar (no congeló)')
  }

  // Control: una ronda 'en_curso' SÍ acepta (el guard es específico, no siempre-rechaza).
  await sb.from('rondas_libres').update({ estado: 'en_curso' }).eq('id', teamA.rondaId)
  const { error: ctrlErr } = await sb.rpc('upsert_ronda_equipos_scores', {
    p_equipo_id: teamA.equipoId, p_codigo: teamA.codigo, p_delta: { '1': 4 },
  })
  await sb.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', teamA.rondaId)
  ctrlErr
    ? fail('control en_curso', 'una ronda en curso debía aceptar: ' + ctrlErr.message)
    : pass('control en_curso', 'ronda en curso acepta la edición (guard específico)')
}

main()
  .catch((e) => fail('EXCEPCIÓN', e.message))
  .finally(async () => {
    await cleanup()
    console.log(`\n══ Resultado: ${passed} PASS · ${failed} FAIL ══`)
    process.exit(failed > 0 ? 1 : 0)
  })
