import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getTeePromptStatus } from '@/lib/data/tee-prompt'

export const dynamic = 'force-dynamic'

/**
 * Estado del banner de tee por defecto para el usuario actual. Lo consume
 * `DefaultTeeBanner` (cliente) para decidir si mostrarse, sin acoplar la UI a
 * Supabase directo. Ante cualquier error → no mostrar (fail-closed, nunca rompe
 * la página que lo embebe).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ show: false, recoverableRounds: 0 })

    const status = await getTeePromptStatus(supabase, user.id)
    return NextResponse.json(status)
  } catch {
    return NextResponse.json({ show: false, recoverableRounds: 0 })
  }
}
