import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Writer de trazas del examen. Solo se usa en el examen LIVE (build-time/CI con
 * service-role), nunca en runtime de prod. Una fila por caso por corrida.
 */
export interface ExamTraceRow {
  run_id: string
  case_id: string
  tags: string[]
  coach_model: string
  user_message: string
  final_text: string
  tools_used: string[]
  correctness_pass: boolean
  correctness_reasons: string[]
  six_pieces_applicable: boolean
  six_pieces_score: number | null
  six_pieces_missing: string[]
}

export async function writeExamTraces(client: SupabaseClient, rows: ExamTraceRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await client.from('coach_eval_traces').insert(rows)
  if (error) throw new Error(`No se pudieron escribir las trazas del examen: ${error.message}`)
}
