/** Imprime el contextString que el coach recibe para Nico — para auditar el índice. */
import { createClient } from '@supabase/supabase-js'
import { buildPlayerContext } from '@/golf/coach/context'
import { buildContextString } from '@/golf/coach/prompts'

const NICO_ID = 'a6e0df09-e259-4229-bdb0-f1cb0558e98b'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const ctx = await buildPlayerContext(supabase, NICO_ID)
  console.log('=== ctx object (claves de índice) ===')
  console.log(JSON.stringify(ctx, null, 2).slice(0, 3000))
  console.log('\n=== contextString (lo que ve el LLM) ===')
  console.log(buildContextString(ctx))
}
main().catch((e) => { console.error(e); process.exit(1) })
