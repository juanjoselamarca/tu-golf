/**
 * Capa de datos del dashboard (Mi Golf). Acceso RLS-safe vía el cliente
 * autenticado del request — NO service_role. Sin lógica de golf acá: solo trae
 * filas y las normaliza al shape de `@/lib/mi-golf/types`.
 *
 * Diseño para streaming: las queries están agrupadas por TAB (Competencia /
 * Identidad) para que cada sección streamee independiente. El query de
 * `historical_rounds` es SLIM (sin `scores`/`par_per_hole`) porque esas
 * columnas JSONB pesadas solo las consume `UltimaRondaHero` para UNA ronda —
 * ver `loadUltimaRondaDetalle`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tournament, RondaLibre, HistoricalRound } from '@/lib/mi-golf/types'
import { parPerHoleArray, type ParPerHoleInput } from '@/golf/core/holes'
import { normalizeScores } from '@/lib/data/focus'

// Campos slim de historical_rounds: lo necesario para stats/tendencia/listado.
// `scores`/`par_per_hole` se omiten a propósito (se traen aparte solo para la
// última ronda del día vía loadUltimaRondaDetalle).
const HISTORICO_SLIM_COLS = 'id, total_gross, course_name, played_at, diferencial, holes_played'

function mapHistoricoSlim(rows: unknown): HistoricalRound[] {
  return ((rows as Array<Record<string, unknown>>) || []).map((row) => ({
    id: row.id as string,
    total_gross: (row.total_gross as number | null) ?? null,
    course_name: (row.course_name as string | null) ?? null,
    played_at: (row.played_at as string | null) ?? null,
    diferencial: (row.diferencial as number | null) ?? null,
    holes_played: (row.holes_played as number | null) ?? null,
    scores: null,
    parPerHole: null,
  }))
}

// ─────────────────────────── COMPETENCIA ───────────────────────────

export type CompetenciaData = {
  organizedTournaments: Tournament[]
  playedTournaments: Tournament[]
  activeTournaments: Tournament[]
  rondasLibres: RondaLibre[]
  historico: HistoricalRound[]
  indiceGolfers: number | null
}

export async function loadCompetenciaData(
  supabase: SupabaseClient,
  userId: string,
): Promise<CompetenciaData> {
  const [
    { data: organizedRaw },
    { data: playedRaw },
    { data: activeRaw },
    { data: rondasRaw },
    { data: historicoRaw },
    { data: profile },
  ] = await Promise.all([
    supabase.from('tournaments').select('id, name, slug, status, date_start, courses(nombre)').eq('organizer_id', userId).order('created_at', { ascending: false }),
    supabase.from('players').select('tournaments(id, name, slug, status, date_start, courses(nombre))').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('players').select('tournaments!inner(id, name, slug, status, date_start, courses(nombre))').eq('user_id', userId).in('tournaments.status', ['open', 'in_progress']),
    supabase.from('rondas_libres').select('id, codigo, course_name, fecha, estado').eq('creador_id', userId).order('created_at', { ascending: false }).limit(5),
    supabase.from('historical_rounds').select(HISTORICO_SLIM_COLS).eq('user_id', userId).order('played_at', { ascending: false }).limit(50),
    supabase.from('profiles').select('indice_golfers').eq('id', userId).single(),
  ])

  return {
    organizedTournaments: (organizedRaw as unknown as Tournament[]) || [],
    playedTournaments: ((playedRaw || []).map((p) => (p as unknown as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[],
    activeTournaments: ((activeRaw || []).map((p) => (p as unknown as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[],
    rondasLibres: (rondasRaw as RondaLibre[]) || [],
    historico: mapHistoricoSlim(historicoRaw),
    indiceGolfers: (profile?.indice_golfers as number | null) ?? null,
  }
}

// Detalle hoyo-por-hoyo de UNA ronda (la última del día). Se trae por `id` de
// la fila histórica EXACTA que ya matcheó la lista slim — no por
// (course_name, played_at), que no es único (ver cancha duplicada) y podría
// devolver otra fila: el Hero mostraría gross de una ronda y barra de otra.
export type UltimaRondaDetalle = { scores: number[] | null; parPerHole: number[] | null }

export async function loadUltimaRondaDetalle(
  supabase: SupabaseClient,
  roundId: string,
): Promise<UltimaRondaDetalle | null> {
  const { data: row } = await supabase
    .from('historical_rounds')
    .select('scores, par_per_hole')
    .eq('id', roundId)
    .single()
  if (!row) return null
  return {
    scores: (normalizeScores((row as Record<string, unknown>).scores) as number[] | null) ?? null,
    parPerHole: parPerHoleArray((row as Record<string, unknown>).par_per_hole as ParPerHoleInput),
  }
}

// ─────────────────────────── IDENTIDAD ───────────────────────────

export type IdentidadData = {
  indiceGolfers: number | null
  totalRounds: number
  rondasConDiferencial: number
  taigerSessionCount: number
  historico: HistoricalRound[]
}

export async function loadIdentidadData(
  supabase: SupabaseClient,
  userId: string,
): Promise<IdentidadData> {
  const [
    { data: profile },
    { count: totalRounds },
    { count: rondasConDiferencial },
    { count: taigerSessionCount },
    { data: historicoRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('indice_golfers').eq('id', userId).single(),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('diferencial', 'is', null),
    supabase.from('taiger_sessions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('historical_rounds').select(HISTORICO_SLIM_COLS).eq('user_id', userId).order('played_at', { ascending: false }).limit(50),
  ])

  return {
    indiceGolfers: (profile?.indice_golfers as number | null) ?? null,
    totalRounds: totalRounds ?? 0,
    rondasConDiferencial: rondasConDiferencial ?? 0,
    taigerSessionCount: taigerSessionCount ?? 0,
    historico: mapHistoricoSlim(historicoRaw),
  }
}
