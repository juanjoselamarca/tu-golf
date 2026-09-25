// src/lib/data/tournaments/publishDraft.ts
//
// Publicar un draft = materializar un `TournamentConfig` en las tablas del
// torneo: `tournaments` + `categories` + `tournament_prizes` +
// `tournament_rounds` (rondas 2..N). Es la única función que conoce el orden
// de los inserts y la compensación si alguno falla.
//
// Antes vivía inline en `api/torneos/draft/[id]/create-tournament/route.ts`
// (regla "el que toca, ordena": el handler queda delgado — auth, gates,
// respuesta — y la orquestación de datos vive acá, testeable con un cliente
// falso).
//
// Transacción simulada con compensación: si un insert posterior al de
// `tournaments` falla, se borra el torneo y el cascade FK (ON DELETE CASCADE
// en categories / tournament_prizes / tournament_rounds / players / rounds)
// limpia los hijos. Equivale a un rollback hasta que el cliente JS exponga
// BEGIN/COMMIT.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TournamentConfig } from '@/lib/draft/types'
import { captureError } from '@/lib/error-tracking'
import { mapCategoryForInsert } from './categories'
import { genTournamentCode, genTournamentSlug, mapTournamentForInsert } from './createTournament'
import { mapPrizeForInsert } from './prizes'
import { mapTournamentRoundsForInsert } from './rounds'

/** Cliente con permisos de escritura sobre las tablas del torneo (service role). */
type WriterClient = Pick<SupabaseClient, 'from'>

export interface PublishDraftResult {
  tournamentId: string
  slug: string
}

export interface PublishDraftMeta {
  organizerId: string
  /** Inyectables para tests; en producción salen de los generadores. */
  slug?: string
  code?: string
}

/**
 * Inserta el torneo y sus hijos. Lanza `Error` con el paso que falló
 * (`categories: ...`, `tournament_rounds: ...`) después de compensar.
 */
export async function publishTournamentFromConfig(
  service: WriterClient,
  config: TournamentConfig,
  meta: PublishDraftMeta,
): Promise<PublishDraftResult> {
  const slug = meta.slug ?? genTournamentSlug(config.name)
  const code = meta.code ?? genTournamentCode()

  const { data: tour, error: tErr } = await service
    .from('tournaments')
    .insert(mapTournamentForInsert(config, { organizerId: meta.organizerId, slug, code }))
    .select('id, slug')
    .single()

  if (tErr || !tour) throw new Error(tErr?.message || 'Error creando tournament')
  const tournamentId = (tour as { id: string; slug: string }).id
  const tournamentSlug = (tour as { id: string; slug: string }).slug

  try {
    // Categorías — mapeo centralizado: gender + default_tee_color ya no se
    // pierden entre el wizard y la tabla.
    const cats = config.categories.map((c) => mapCategoryForInsert(c, tournamentId))
    if (cats.length > 0) {
      const { error } = await service.from('categories').insert(cats)
      if (error) throw new Error(`categories: ${error.message}`)
    }

    const prizes = config.prizes.map((p) => mapPrizeForInsert(p, tournamentId, config.format))
    if (prizes.length > 0) {
      const { error } = await service.from('tournament_prizes').insert(prizes)
      if (error) throw new Error(`prizes: ${error.message}`)
    }

    // Rondas 2..N: cancha/fecha/hoyos PROPIOS de cada ronda. La ronda 1 ya
    // viajó en la fila de `tournaments`. (Antes esto iba a `rounds`, la tabla
    // de tarjetas por jugador, que no tiene esas columnas — bug P0 652707d2.)
    const extraRounds = mapTournamentRoundsForInsert(config, tournamentId)
    if (extraRounds.length > 0) {
      const { error } = await service.from('tournament_rounds').insert(extraRounds)
      if (error) throw new Error(`tournament_rounds: ${error.message}`)
    }
  } catch (err) {
    await compensate(service, tournamentId)
    throw err
  }

  return { tournamentId, slug: tournamentSlug }
}

/** Borra el torneo recién creado; el cascade FK limpia los hijos. */
async function compensate(service: WriterClient, tournamentId: string): Promise<void> {
  const { error } = await service.from('tournaments').delete().eq('id', tournamentId)
  if (error) {
    void captureError(error, {
      context: 'publishDraft.rollback',
      level: 'error',
      meta: { tournamentId, nota: 'torneo huérfano: el delete de compensación falló' },
    })
  }
}
