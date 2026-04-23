import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function main() {
  for (const table of ['courses', 'course_tees', 'course_holes']) {
    const { data, error } = await supabase.from(table).select('*').limit(1)
    if (error) {
      console.log(`${table}: ERROR ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      console.log(`${table}: TABLA VACÍA`)
      continue
    }
    console.log(`${table} (columnas): ${Object.keys(data[0]).join(', ')}`)
  }
}

main().catch(console.error)
