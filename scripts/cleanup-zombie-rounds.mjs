#!/usr/bin/env node
/**
 * Limpia rondas "en_curso" que llevan >48h sin actividad.
 * Las marca como "finalizada" — no las borra.
 * Safe: no toca rondas demo (es_demo=true).
 *
 * Uso: node --env-file=.env.local scripts/cleanup-zombie-rounds.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const HORAS_LIMITE = 48

async function main() {
  const cutoff = new Date(Date.now() - HORAS_LIMITE * 3600000).toISOString()

  const { data: zombies, error } = await supabase
    .from('rondas_libres')
    .select('id, codigo, course_name, created_at')
    .eq('estado', 'en_curso')
    .eq('es_demo', false)
    .lt('created_at', cutoff)

  if (error) { console.error('Error fetching zombies:', error.message); process.exit(1) }
  if (!zombies?.length) { console.log('No zombie rounds found.'); return }

  console.log(`Found ${zombies.length} zombie rounds:`)
  for (const z of zombies) {
    console.log(`  ${z.codigo} — ${z.course_name} — created ${z.created_at}`)
  }

  const ids = zombies.map(z => z.id)
  const { error: updateError } = await supabase
    .from('rondas_libres')
    .update({ estado: 'finalizada' })
    .in('id', ids)

  if (updateError) { console.error('Error updating:', updateError.message); process.exit(1) }

  console.log(`✅ ${ids.length} zombie rounds finalized.`)
}

main()
