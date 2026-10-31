// Estado del job mientras /api/import/confirm guarda. Si la conexión se corta y el usuario reintenta, el
// reintento llega con el primer confirm todavía guardando: sin el reclamo, los dos insertaban el mismo lote
// (las rondas sin cancha no tienen índice único que lo frene).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportJob } from '@/lib/import-types'
import type { TarjetasGuardadas } from '@/lib/import/confirmar'
import { captureError } from '@/lib/error-tracking'

const CONFIRMANDO: ImportJob['status'] = 'confirming'

/** Más que el maxDuration del confirm (300 s): pasado esto, el confirm que lo tenía murió sin soltarlo. */
export const PLAZO_RECLAMO_CONFIRM_MS = 360_000
/** Cuánto espera un reintento a que termine el confirm en curso. Si lo suelta, deja margen para guardar dentro del maxDuration. */
export const ESPERA_CONFIRM_EN_CURSO_MS = 200_000
const INTERVALO_ESPERA_MS = 2_000

export async function fetchJobImport(supabase: SupabaseClient, jobId: string, userId: string): Promise<ImportJob | null> {
  const { data } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single()
  return (data as ImportJob | null) ?? null
}

/**
 * Toma el job para guardar. Un solo UPDATE condicional: de dos confirms simultáneos, Postgres deja pasar a uno.
 * No toma un job completado ni uno que otro confirm está guardando (salvo que el reclamo haya vencido).
 */
export async function reclamarJobImport(supabase: SupabaseClient, jobId: string, userId: string): Promise<boolean> {
  const ahora = Date.now()
  const vencido = new Date(ahora - PLAZO_RECLAMO_CONFIRM_MS).toISOString()
  const { data, error } = await supabase
    .from('import_jobs')
    .update({ status: CONFIRMANDO, updated_at: new Date(ahora).toISOString() })
    .eq('id', jobId)
    .eq('user_id', userId)
    .neq('status', 'completed')
    .or(`status.neq.${CONFIRMANDO},updated_at.lt.${vencido}`)
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

export type TomaDelJob = { tomado: true } | { tomado: false; completado: ImportJob | null }

/**
 * Reclama el job; si otro confirm lo tiene, espera a que termine. `completado` trae el job si ese otro
 * confirm lo completó; null si se agotó la espera.
 */
export async function tomarJobImport(supabase: SupabaseClient, jobId: string, userId: string): Promise<TomaDelJob> {
  const limite = Date.now() + ESPERA_CONFIRM_EN_CURSO_MS
  while (!(await reclamarJobImport(supabase, jobId, userId))) {
    const job = await fetchJobImport(supabase, jobId, userId)
    if (job?.status === 'completed') return { tomado: false, completado: job }
    if (Date.now() >= limite) return { tomado: false, completado: null }
    await new Promise(resolve => setTimeout(resolve, INTERVALO_ESPERA_MS))
  }
  return { tomado: true }
}

/** Devuelve el job a revisión sin completarlo: no se guardó nada y el usuario puede corregir y reintentar. */
export async function soltarJobImport(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase
    .from('import_jobs')
    .update({ status: 'review_required', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', CONFIRMANDO)
  // Si falla, el reclamo vence solo (PLAZO_RECLAMO_CONFIRM_MS).
  if (error) void captureError(error, { context: 'import.confirm.soltar-job', meta: { jobId } })
}

/** false si no pudo escribirlo: el confirm lo suelta y el reintento vuelve a guardar sin duplicar (`guardarTarjetasImportadas`). */
export async function completarJobImport(supabase: SupabaseClient, jobId: string, guardadas: TarjetasGuardadas): Promise<boolean> {
  const ahora = new Date().toISOString()
  const { error } = await supabase
    .from('import_jobs')
    .update({
      status: 'completed',
      // Misma definición que la respuesta: solo nuevas (las re-escritas van aparte).
      total_imported: guardadas.insertedIds.length,
      total_updated: guardadas.updatedIds.length,
      unsaved_rounds: { errors: guardadas.errors, duplicates: guardadas.duplicates },
      completed_at: ahora,
      updated_at: ahora,
    })
    .eq('id', jobId)
  if (error) void captureError(error, { context: 'import.confirm.completar-job', meta: { jobId } })
  return !error
}
