// scripts/test-enroll-concurrency.mjs
//
// Blindaje del RPC `enroll_player` (inscripción atómica, PR #260). Corre CONTRA
// PROD con un torneo descartable y limpia todo al final. Verifica las dos
// garantías de CERO FALLOS:
//
//   1. CUPO ATÓMICO: con max_players=1 y N inscripciones SIMULTÁNEAS, entra
//      EXACTAMENTE 1 (las otras reciben tournament_full). El lock FOR UPDATE de
//      la fila del torneo serializa las altas concurrentes.
//   2. SIN JUGADORES A MEDIAS: el ganador queda con su fila en `players` Y su
//      `rounds` (nunca uno sin el otro).
//
// Además hace un escaneo de salud: ¿hay hoy jugadores "a medias" (en players sin
// su rounds) de código viejo? Reporta el conteo (no borra nada).
//
// Uso: node --env-file=.env.local scripts/test-enroll-concurrency.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const N = 6 // inscripciones simultáneas contra un cupo de 1
const TS = Date.now()
let pass = 0, fail = 0
const ok = (m, d = '') => { pass++; console.log(`  ✅ ${m}${d ? ' — ' + d : ''}`) }
const bad = (m, d = '') => { fail++; console.log(`  ❌ ${m}${d ? ' — ' + d : ''}`) }

let tournamentId = null
const createdPlayerIds = []

try {
  // 0) Organizador (cualquier admin) + una cancha cualquiera.
  const { data: admin } = await sb.from('profiles').select('id').eq('role', 'admin').limit(1).single()
  if (!admin) throw new Error('no hay admin para organizador')
  const { data: course } = await sb.from('courses').select('id, nombre').limit(1).single()
  if (!course) throw new Error('no hay ninguna cancha')

  // 1) Torneo descartable: ABIERTO, cupo = 1.
  const { data: t, error: tErr } = await sb.from('tournaments').insert({
    name: `QA CUPO ${TS}`,
    slug: `qa-cupo-${TS}`,
    organizer_id: admin.id,
    status: 'open',
    format: 'stroke_play',
    hole_count: 18,
    course_id: course.id,
    course_name: course.nombre,
    max_players: 1,
    date_start: new Date().toISOString().split('T')[0],
  }).select('id').single()
  if (tErr) throw new Error('crear torneo: ' + tErr.message)
  tournamentId = t.id
  ok('torneo descartable creado', `cupo=1, abierto`)

  // 2) N inscripciones SIMULTÁNEAS (invitados) al mismo cupo de 1.
  const calls = Array.from({ length: N }, (_, i) =>
    sb.rpc('enroll_player', {
      p_tournament_id: tournamentId,
      p_kind: 'guest',
      p_user_id: null,
      p_guest_name: `Concurrente ${i + 1}`,
      p_handicap: 10,
      p_category_id: null,
    })
  )
  const results = await Promise.all(calls)

  const oks = results.filter(r => !r.error && r.data && r.data.ok === true)
  const fulls = results.filter(r => !r.error && r.data && r.data.ok === false && r.data.reason === 'tournament_full')
  const errors = results.filter(r => r.error)

  if (oks.length === 1) ok(`entró EXACTAMENTE 1 de ${N} simultáneas`, `ok=${oks.length}`)
  else bad(`debía entrar 1, entraron ${oks.length}`, JSON.stringify(results.map(r => r.data || r.error)))

  if (fulls.length === N - 1) ok(`las otras ${N - 1} recibieron "cupo lleno"`, `full=${fulls.length}`)
  else bad(`se esperaban ${N - 1} rechazos por cupo, hubo ${fulls.length}`)

  if (errors.length === 0) ok('ninguna inscripción tiró error de servidor')
  else bad(`${errors.length} tiraron error`, JSON.stringify(errors.map(e => e.error?.message)))

  // 3) En la base: EXACTAMENTE 1 jugador aprobado y con su ronda (nadie a medias).
  const { data: players } = await sb.from('players').select('id').eq('tournament_id', tournamentId).eq('status', 'approved')
  ;(players || []).forEach(p => createdPlayerIds.push(p.id))
  if ((players || []).length === 1) ok('quedó 1 solo jugador aprobado en la base')
  else bad(`quedaron ${players?.length ?? 0} jugadores aprobados (debía ser 1)`)

  const { count: roundCount } = await sb.from('rounds').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
  if (roundCount === 1) ok('el jugador quedó con su ronda (no quedó "a medias")')
  else bad(`se esperaba 1 ronda, hay ${roundCount}`)

  // 4) Escaneo de salud (ADVERTENCIA, no falla): jugadores "a medias" que de
  //    verdad importan = torneos INDIVIDUALES no-demo (ahí la ronda ES lo que
  //    puntúa). En torneos por equipos (scramble/foursome/best_ball) el scoring
  //    vive en ronda_equipos, así que un player sin `rounds` es inofensivo.
  const { data: allT } = await sb.from('tournaments').select('id, name, format, formato_juego, es_demo').limit(3000)
  const TEAM = new Set(['scramble', 'foursome', 'best_ball'])
  const indiv = (allT || []).filter(t => !t.es_demo && !TEAM.has(t.formato_juego || t.format || ''))
  let warnOrphans = 0
  const warnList = []
  for (const t of indiv) {
    const { data: ps } = await sb.from('players').select('id').eq('tournament_id', t.id).eq('status', 'approved')
    for (const p of (ps || [])) {
      const { count } = await sb.from('rounds').select('id', { count: 'exact', head: true }).eq('tournament_id', t.id).eq('player_id', p.id)
      if ((count ?? 0) === 0) { warnOrphans++; if (!warnList.includes(t.name)) warnList.push(t.name) }
    }
  }
  if (warnOrphans === 0) ok('salud: cero jugadores "a medias" en torneos individuales reales')
  else console.log(`  ⚠️  ${warnOrphans} jugadores sin ronda en torneos individuales: ${warnList.join(', ')} (revisar si son reales o de prueba — NO cuenta como falla)`)

} catch (e) {
  bad('excepción', e.message)
} finally {
  // Limpieza: borrar rondas, jugadores y torneo descartable.
  if (tournamentId) {
    await sb.from('rounds').delete().eq('tournament_id', tournamentId)
    await sb.from('players').delete().eq('tournament_id', tournamentId)
    await sb.from('tournaments').delete().eq('id', tournamentId)
    console.log('  🧹 torneo descartable + inscripciones borrados')
  }
}

console.log(`\n${fail === 0 ? '✅ TODO OK' : '❌ HAY FALLOS'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
