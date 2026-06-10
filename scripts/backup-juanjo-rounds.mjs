// Backup COMPLETO (todas las columnas, todas las filas) de las rondas de un
// usuario a un archivo JSON fuera del repo. Red de seguridad antes de mutar.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const USER_ID = process.argv[2] || '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const OUT = process.argv[3] || 'C:/Users/juanj/AppData/Local/Temp/indice-fix-backup-juanjo-rounds.json'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await sb
  .from('historical_rounds')
  .select('*')
  .eq('user_id', USER_ID)
  .order('created_at', { ascending: true })

if (error) { console.error('ERROR backup:', error); process.exit(1) }

const profile = await sb.from('profiles').select('*').eq('id', USER_ID).single()

const payload = {
  backed_up_for: 'indice-engine-fix',
  user_id: USER_ID,
  rounds_count: data.length,
  rounds: data,
  profile: profile.data,
}
writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
console.log(`✓ Backup completo: ${data.length} rondas + perfil → ${OUT}`)
