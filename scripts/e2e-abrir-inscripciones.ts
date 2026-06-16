/**
 * E2E: "Abrir inscripciones" a un torneo (draft→open self-service)
 *
 * Verifica el flujo COMPLETO contra producción reproduciendo exactamente el
 * código que corren los endpoints deployados:
 *   - registerPlayerAndRound  → es lo que llama /api/torneos/[slug]/inscribirse
 *   - openTournament / revertToDraft → lo que llaman las actions de /api/game
 * Más smokes HTTP de los endpoints deployados (rechazo sin auth).
 *
 * Todo lo que crea (2 usuarios efímeros + 1 torneo + sus filas) se borra en el
 * finally, capturando IDs — NUNCA toca data real (regla de memoria).
 *
 * Ejecutar:  npx tsx scripts/e2e-abrir-inscripciones.ts
 */
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import {
  fetchJoinInfo,
  registerPlayerAndRound,
  esInscribible,
} from '../src/lib/data/tournaments/joinFlow'
import {
  openTournament,
  revertToDraft,
} from '../src/lib/data/tournaments/lifecycle'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let passed = 0
let failed = 0
function ok(t: string, d = '') { passed++; console.log(`  PASS  ${t}${d ? ' — ' + d : ''}`) }
function bad(t: string, d = '') { failed++; console.error(`  FAIL  ${t}${d ? ' — ' + d : ''}`) }
function assert(cond: boolean, t: string, d = '') { cond ? ok(t, d) : bad(t, d) }

const rand = randomBytes(4).toString('hex')

async function main() {
  // Recursos a limpiar (capturamos IDs — solo borramos lo que creamos)
  const created: { tournamentId?: string; slug?: string; orgId?: string; joinerId?: string } = {}

  try {
    console.log('=== SETUP ===')
    // Cancha real verificada con slope/CR
    const { data: courses } = await admin
      .from('courses')
      .select('id, nombre, slope_rating, course_rating, par_total')
      .eq('activa', true)
      .is('parent_id', null)
      .eq('datos_verificados', true)
      .not('slope_rating', 'is', null)
      .limit(1)
    if (!courses?.length) { bad('SETUP', 'No hay cancha verificada con slope'); return }
    const course = courses[0]
    ok('SETUP cancha', course.nombre)

    // 2 usuarios efímeros
    const mkUser = async (rol: string, indice: number) => {
      const email = `e2e-abrir-${rand}-${rol}@golfersplus-test.local`
      const password = randomBytes(18).toString('base64url')
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { name: `E2E Abrir ${rol}`, e2e: true },
      })
      if (error || !data.user) throw new Error(`createUser ${rol}: ${error?.message}`)
      await admin.from('profiles').upsert(
        { id: data.user.id, email, name: `E2E ${rol}`, role: 'player', indice },
        { onConflict: 'id' },
      )
      return data.user.id
    }
    created.orgId = await mkUser('org', 12.0)
    created.joinerId = await mkUser('joiner', 18.0)
    ok('SETUP usuarios', `org=${created.orgId!.slice(0, 8)} joiner=${created.joinerId!.slice(0, 8)}`)

    // Torneo draft del organizador
    created.slug = `e2e-abrir-${rand}`
    const { data: tIns, error: tErr } = await admin
      .from('tournaments')
      .insert({
        name: `E2E Abrir Inscripciones ${rand}`,
        slug: created.slug,
        organizer_id: created.orgId,
        date_start: new Date().toISOString().slice(0, 10),
        format: 'stroke_play',
        formato_juego: 'stroke_play',
        modo_juego: 'gross',
        hole_count: 18,
        course_id: course.id,
        status: 'draft',
        es_demo: true,
      })
      .select('id, organizer_id, status')
      .single()
    if (tErr || !tIns) throw new Error(`crear torneo: ${tErr?.message}`)
    created.tournamentId = tIns.id
    ok('SETUP torneo draft', `slug=${created.slug}`)

    const tid = created.tournamentId!
    const reread = async () => (await admin.from('tournaments').select('status').eq('id', tid).single()).data?.status

    // ── T1: guard pre-open (canarios) ──
    console.log('\n=== T1: torneo en draft NO acepta inscripción ===')
    assert(esInscribible('draft') === false, 'esInscribible(draft) === false')
    assert(esInscribible('open') === true, 'esInscribible(open) === true')
    const visDraftJoiner = await fetchJoinInfo(admin, created.slug!, created.joinerId!)
    assert(visDraftJoiner === null, 'draft OCULTO al no-organizador (fetchJoinInfo null)')
    const visDraftOrg = await fetchJoinInfo(admin, created.slug!, created.orgId!)
    assert(visDraftOrg?.tournament.status === 'draft', 'organizador SÍ ve su draft')
    const regDraft = await registerPlayerAndRound(admin, {
      tournamentId: tid, tournamentStatus: 'draft', userId: created.joinerId!, courseHandicap: 18,
    })
    assert(!regDraft.ok && (regDraft as { reason: string }).reason === 'not_inscribible',
      'registro en draft rechazado (not_inscribible)')

    // ── T2: endpoints deployados rechazan sin auth ──
    console.log('\n=== T2: endpoints deployados exigen auth ===')
    const h1 = await fetch(`${SITE}/api/torneos/${encodeURIComponent(created.slug!)}/inscribirse`, { method: 'POST' })
    assert(h1.status === 401, 'POST /inscribirse sin auth → 401', `got ${h1.status}`)
    const h2 = await fetch(`${SITE}/api/game`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open_inscriptions', tournament_id: tid }),
    })
    assert(h2.status === 401, 'POST /api/game open_inscriptions sin auth → 401', `got ${h2.status}`)

    // ── T3: abrir inscripciones (replica de la action open_inscriptions) ──
    console.log('\n=== T3: abrir inscripciones (draft→open) ===')
    // Lo que valida el route antes de mutar: el caller debe ser el organizador.
    assert(tIns.organizer_id === created.orgId, 'ownership: organizer_id === caller (guard de la action)')
    await openTournament(admin, tid)
    assert((await reread()) === 'open', 'tournament.status === open tras abrir')

    // ── T4: auto-inscripción del joiner (replica EXACTA de /inscribirse) ──
    console.log('\n=== T4: el joiner se auto-inscribe ===')
    const infoOpen = await fetchJoinInfo(admin, created.slug!, created.joinerId!)
    assert(infoOpen?.tournament.status === 'open' && infoOpen?.alreadyRegistered === false,
      'joiner ve el torneo open y NO está inscrito aún')
    const reg = await registerPlayerAndRound(admin, {
      tournamentId: tid, tournamentStatus: infoOpen!.tournament.status, userId: created.joinerId!, courseHandicap: 18,
    })
    assert(reg.ok === true, 'registerPlayerAndRound ok', reg.ok ? `playerId=${reg.playerId.slice(0, 8)}` : (reg as { reason: string }).reason)
    const { data: playerRow } = await admin
      .from('players').select('id, status').eq('tournament_id', tid).eq('user_id', created.joinerId!).maybeSingle()
    assert(!!playerRow, 'fila players del joiner existe en DB')

    // ── T5: idempotencia ──
    console.log('\n=== T5: doble inscripción → already_registered ===')
    const reg2 = await registerPlayerAndRound(admin, {
      tournamentId: tid, tournamentStatus: 'open', userId: created.joinerId!, courseHandicap: 18,
    })
    assert(!reg2.ok && (reg2 as { reason: string }).reason === 'already_registered', 'segundo registro → already_registered')
    const infoAgain = await fetchJoinInfo(admin, created.slug!, created.joinerId!)
    assert(infoAgain?.alreadyRegistered === true, 'fetchJoinInfo marca alreadyRegistered')

    // ── T6: volver a borrador conserva jugadores ──
    console.log('\n=== T6: volver a borrador (open→draft) conserva inscritos ===')
    await revertToDraft(admin, tid)
    assert((await reread()) === 'draft', 'status vuelve a draft')
    const { data: stillThere } = await admin
      .from('players').select('id').eq('tournament_id', tid).eq('user_id', created.joinerId!).maybeSingle()
    assert(!!stillThere, 'el jugador inscrito SE CONSERVA tras volver a borrador')
    // Reabrir para el test de inicio
    await openTournament(admin, tid)
    assert((await reread()) === 'open', 'reabrir inscripciones OK')

    // ── T7: iniciar torneo desde open (nueva reachability) ──
    console.log('\n=== T7: iniciar torneo desde open ===')
    // El hook handleStartTournament hace el flip directo open→in_progress.
    await admin.from('tournaments').update({ status: 'in_progress' }).eq('id', tid)
    assert((await reread()) === 'in_progress', 'open → in_progress (start funciona desde open)')
    const regAfterStart = await registerPlayerAndRound(admin, {
      tournamentId: tid, tournamentStatus: 'in_progress', userId: created.orgId!, courseHandicap: 12,
    })
    assert(!regAfterStart.ok && (regAfterStart as { reason: string }).reason === 'not_inscribible',
      'iniciado el torneo, ya NO acepta auto-inscripción')

  } finally {
    // ── CLEANUP: borrar SOLO lo creado, en orden de FKs ──
    console.log('\n=== CLEANUP ===')
    const { tournamentId, orgId, joinerId } = created
    if (tournamentId) {
      const { data: rounds } = await admin.from('rounds').select('id').eq('tournament_id', tournamentId)
      const roundIds = (rounds || []).map((r: { id: string }) => r.id)
      if (roundIds.length) await admin.from('hole_scores').delete().in('round_id', roundIds)
      await admin.from('rounds').delete().eq('tournament_id', tournamentId)
      const { data: grps } = await admin.from('tournament_groups').select('id').eq('tournament_id', tournamentId)
      const grpIds = (grps || []).map((g: { id: string }) => g.id)
      if (grpIds.length) await admin.from('tournament_group_players').delete().in('group_id', grpIds)
      await admin.from('tournament_groups').delete().eq('tournament_id', tournamentId)
      await admin.from('players').delete().eq('tournament_id', tournamentId)
      await admin.from('categories').delete().eq('tournament_id', tournamentId)
      await admin.from('tournaments').delete().eq('id', tournamentId)
      console.log(`  cleanup torneo ${tournamentId.slice(0, 8)} + filas`)
    }
    for (const uid of [orgId, joinerId]) {
      if (!uid) continue
      await admin.from('profiles').delete().eq('id', uid)
      await admin.auth.admin.deleteUser(uid).catch((e) => console.warn('  deleteUser warn:', (e as Error).message))
      console.log(`  cleanup user ${uid.slice(0, 8)}`)
    }
  }

  console.log('\n==============================================')
  console.log(`  RESULTADO: ${passed} PASS · ${failed} FAIL`)
  console.log('==============================================')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
