/**
 * Publicación de un draft de punta a punta contra la BASE REAL (re-review #421,
 * CR-1): el lock idempotente escribía el UUID reservado en
 * `tournament_drafts.tournament_id`, que tiene FK a tournaments(id) → 23503 en
 * CADA creación. El test unitario (mock) no lo veía. Este sí: crea un draft
 * real de 2 rondas en canchas distintas, lo publica con `lockAndPublish`, y
 * comprueba tournaments + tournament_rounds + el cierre del draft, incluido
 * el reintento idempotente. Limpia todo al final.
 *
 * Skipea sin SUPABASE_SERVICE_ROLE_KEY / E2E_TEST_USER_EMAIL (CI sin secrets).
 *
 * Uso:
 *   node --env-file=.env.local node_modules/vitest/vitest.mjs run src/__tests__/integration/publish-draft.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getTestUserId } from '../../../e2e/helpers/ronda-fixture'
import { findRecoverableTournament, lockAndPublish, type DraftForPublish } from '@/lib/data/tournaments/publishDraft'
import { resolveAllRoundPlayConfigs } from '@/golf/tournament-rounds'
import { fetchTournamentRoundRows } from '@/lib/data/tournaments/rounds'
import type { TournamentConfig } from '@/lib/draft/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const e2eEmail = process.env.E2E_TEST_USER_EMAIL
const skipIfNoEnv = !url || !serviceKey || !e2eEmail

const NOMBRE = `[publish-draft.test] ${Date.now()}`

describe.skipIf(skipIfNoEnv)('publishDraft — draft real de 2 rondas en canchas distintas', () => {
  let admin: SupabaseClient
  let userId: string
  let draftId: string
  let tournamentId: string | null = null
  let canchaA: string
  let canchaB: string

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    userId = await getTestUserId()

    // Dos canchas reales, aptas (rating + 18 hoyos), distintas.
    const { data: canchas, error } = await admin
      .from('courses')
      .select('id, nombre')
      .not('course_rating', 'is', null)
      .ilike('nombre', '%(VARONES)%')
      .order('nombre')
      .limit(2)
    if (error) throw error
    expect(canchas?.length).toBe(2)
    canchaA = canchas![0].id
    canchaB = canchas![1].id

    const config: TournamentConfig = {
      schema_version: 1,
      name: NOMBRE,
      date_start: '2026-11-07',
      cover_image_url: null,
      format: 'stroke_play',
      modo: 'gross',
      use_handicap: false,
      categories: [{ id: 'c1', name: 'Damas', handicap_min: 0, handicap_max: 36, gender: 'female', default_tee_color: 'rojo' }],
      rounds: [
        { round_number: 1, date: '2026-11-07', course_id: canchaA, hole_count: 18, tee_assignment_mode: 'per_player' },
        { round_number: 2, date: '2026-11-08', course_id: canchaB, hole_count: 18, tee_assignment_mode: 'per_player' },
      ],
      registration: { mode: 'open_with_code' },
      prizes: [],
      is_practice: true,
      pending_confirmations: [],
    }
    const { data: d, error: dErr } = await admin
      .from('tournament_drafts')
      .insert({ owner_id: userId, name: NOMBRE, config, status: 'draft', version: 1 })
      .select('id')
      .single()
    if (dErr) throw dErr
    draftId = d!.id
  }, 60_000)

  afterAll(async () => {
    // Orden: el draft referencia al torneo (ON DELETE SET NULL); el torneo
    // borra en cascada categories/tournament_rounds.
    if (tournamentId) await admin.from('tournaments').delete().eq('id', tournamentId)
    if (draftId) await admin.from('tournament_drafts').delete().eq('id', draftId)
  })

  async function leerDraft(): Promise<DraftForPublish & { config: TournamentConfig }> {
    const { data, error } = await admin
      .from('tournament_drafts')
      .select('id, status, tournament_id, pending_tournament_id, updated_at, config')
      .eq('id', draftId)
      .single()
    if (error) throw error
    return data as unknown as DraftForPublish & { config: TournamentConfig }
  }

  it('publica: torneo + categoría con género/tee + tournament_rounds con la cancha de la ronda 2; draft created', async () => {
    const draft = await leerDraft()
    const out = await lockAndPublish(admin, draft, draft.config, userId)
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    tournamentId = out.tournamentId

    const { data: t } = await admin
      .from('tournaments')
      .select('id, name, course_id, hole_count, date_start, date_end, total_rounds')
      .eq('id', tournamentId)
      .single()
    expect(t).toMatchObject({ name: NOMBRE, course_id: canchaA, total_rounds: 2, date_start: '2026-11-07', date_end: '2026-11-08' })

    const rows = await fetchTournamentRoundRows(admin, tournamentId)
    expect(rows).toEqual([{ round_number: 2, course_id: canchaB, hole_count: 18, date: '2026-11-08' }])
    // La MISMA fuente que usa el motor resuelve cada ronda con su cancha.
    const rondas = resolveAllRoundPlayConfigs({ course_id: canchaA, hole_count: 18, date_start: '2026-11-07', total_rounds: 2 }, rows)
    expect(rondas.map((r) => r.courseId)).toEqual([canchaA, canchaB])

    const { data: cats } = await admin.from('categories').select('name, gender, default_tee_color').eq('tournament_id', tournamentId)
    expect(cats).toEqual([{ name: 'Damas', gender: 'F', default_tee_color: 'rojo' }])

    const cerrado = await leerDraft()
    expect(cerrado.status).toBe('created')
    expect(cerrado.tournament_id).toBe(tournamentId)
    expect(cerrado.pending_tournament_id).toBeNull()
  }, 60_000)

  it('dos intentos SIMULTÁNEOS sobre un draft nuevo: exactamente uno publica, el otro pierde el lock, un solo torneo', async () => {
    const nombre = `${NOMBRE} · carrera`
    const draft0 = await leerDraft()
    const config = { ...draft0.config, name: nombre }
    const { data: d2, error } = await admin
      .from('tournament_drafts')
      .insert({ owner_id: userId, name: nombre, config, status: 'draft', version: 1 })
      .select('id, status, tournament_id, pending_tournament_id, updated_at')
      .single()
    if (error) throw error
    const draft2 = d2 as unknown as DraftForPublish
    let creado: string | null = null
    try {
      const [a, b] = await Promise.all([
        lockAndPublish(admin, draft2, config, userId),
        lockAndPublish(admin, draft2, config, userId),
      ])
      const oks = [a, b].filter((o) => o.kind === 'ok')
      const perdidos = [a, b].filter((o) => o.kind === 'lock_lost')
      expect(oks).toHaveLength(1)
      expect(perdidos).toHaveLength(1)
      creado = oks[0].kind === 'ok' ? oks[0].tournamentId : null

      const { count } = await admin.from('tournaments').select('id', { count: 'exact', head: true }).eq('name', nombre)
      expect(count).toBe(1)
    } finally {
      if (creado) await admin.from('tournaments').delete().eq('id', creado)
      await admin.from('tournament_drafts').delete().eq('id', draft2.id)
    }
  }, 60_000)

  it('reintento: el draft ya publicado devuelve el MISMO torneo sin crear otro', async () => {
    const draft = await leerDraft()
    const recovered = await findRecoverableTournament(admin, draft)
    expect(recovered?.tournamentId).toBe(tournamentId)

    const otra = await lockAndPublish(admin, draft, draft.config, userId)
    expect(otra).toEqual({ kind: 'not_draft' })

    const { count } = await admin.from('tournaments').select('id', { count: 'exact', head: true }).eq('name', NOMBRE)
    expect(count).toBe(1)
  }, 60_000)
})
