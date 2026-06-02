// Smoke end-to-end del productor de equipos (PR #90) contra datos reales.
//
// Toma un torneo scramble de prueba que ya tiene grupos+rondas pero 0 equipos,
// le crea los ronda_equipos con la MISMA lógica del productor
// (computeStoredTeamHandicap), y luego corre las funciones REALES del consumidor
// (fetchScrambleTeams + computeScrambleStandings) para confirmar que el
// leaderboard se enciende con esos datos. Idempotente (no duplica equipos).
//
// Uso: node --env-file=.env.local --import tsx scripts/smoke-team-producer.ts <tournamentId>

import { createClient } from '@supabase/supabase-js'
import { computeStoredTeamHandicap } from '../src/lib/data/tournaments/teamRounds'
import { fetchScrambleTeams } from '../src/lib/data/tournaments/teamLeaderboard'
import { computeScrambleStandings } from '../src/golf/leaderboard/team-standings'

const tournamentId = process.argv[2] || '138eb381-484d-4733-91f2-0e6a081f8bb1'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

function log(...a: unknown[]) { console.log('[smoke-team-producer]', ...a) }

async function main() {
  log('torneo:', tournamentId)

  // 1) Grupos del torneo con su ronda.
  const { data: groups, error: gErr } = await supabase
    .from('tournament_groups')
    .select('id, name, ronda_libre_id, sort_order')
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  if (gErr) throw gErr
  const groupsConRonda = (groups ?? []).filter((g) => g.ronda_libre_id)
  log(`grupos con ronda: ${groupsConRonda.length}`)

  // 2) Por cada grupo: crear ronda_equipos + miembros (lógica del productor).
  for (const g of groupsConRonda) {
    const { data: yaHay } = await supabase
      .from('ronda_equipos').select('id').eq('ronda_id', g.ronda_libre_id)
    if (yaHay && yaHay.length > 0) { log(`  ${g.name}: ya tiene equipo, skip`); continue }

    const { data: rlj } = await supabase
      .from('ronda_libre_jugadores')
      .select('id, user_id, handicap, nombre')
      .eq('ronda_id', g.ronda_libre_id)
    const jugadores = rlj ?? []
    const userIds = jugadores.map((j) => j.user_id).filter((x): x is string => !!x)
    const { data: profs } = userIds.length
      ? await supabase.from('profiles').select('id, indice').in('id', userIds)
      : { data: [] as Array<{ id: string; indice: number | null }> }
    const indiceByUser = new Map((profs ?? []).map((p) => [p.id, p.indice ?? null]))

    const handicaps = jugadores.map((j) =>
      (j.user_id ? indiceByUser.get(j.user_id) : null) ?? (j.handicap as number | null) ?? 0,
    )
    const handicapEquipo = computeStoredTeamHandicap('scramble', handicaps)

    const { data: eq, error: eErr } = await supabase
      .from('ronda_equipos')
      .insert({ ronda_id: g.ronda_libre_id, nombre: g.name, handicap_equipo: handicapEquipo, scores: {} })
      .select('id').single()
    if (eErr) throw eErr
    const members = jugadores.map((j, idx) => ({ equipo_id: eq!.id, jugador_id: j.id, orden: idx }))
    const { error: mErr } = await supabase.from('ronda_equipo_jugadores').insert(members)
    if (mErr) throw mErr
    log(`  ${g.name}: equipo creado (hcp=${handicapEquipo}, ${members.length} miembros)`)
  }

  // 3) Consumidor REAL: fetchScrambleTeams + standings.
  const { teams, memberNames } = await fetchScrambleTeams(supabase, tournamentId)
  log(`fetchScrambleTeams → ${teams.length} equipos`)
  for (const t of teams) {
    log(`  • ${t.nombre} | teamHandicap=${t.teamHandicap} | hcps=[${t.handicaps.join(',')}] | jugadores=[${(memberNames[t.id] ?? []).join(', ')}]`)
  }

  const holes = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
  const standings = computeScrambleStandings(teams, holes, 72, 'stroke_play', 'gross')
  log(`computeScrambleStandings → ${standings.length} filas (pipe corre sin error)`)
  standings.forEach((s, i) => log(`  #${i + 1} ${s.teamNombre} | hcp=${s.teamHandicap} | jugados=${s.holesPlayed}`))

  const ok = teams.length === groupsConRonda.length && teams.length > 0
  log(ok ? '✅ PASS — productor→consumidor encendido con datos reales' : '❌ FAIL — equipos no coinciden con grupos')
  if (!ok) process.exit(1)
}

main().catch((e) => { console.error('[smoke-team-producer] ERROR', e); process.exit(1) })
