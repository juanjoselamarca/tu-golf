import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { detectAndSavePatterns } from '@/golf/coach/detect-and-save-patterns'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para continuar' }, { status: 401 })

    const result = await detectAndSavePatterns(supabase, user.id)

    if (result.total_rounds < 5) {
      return NextResponse.json({
        message: 'Insuficientes rondas para detectar patrones (mínimo 5)',
        patterns: [],
      })
    }

    return NextResponse.json({
      patterns: result.patterns,
      message: `${result.detected} patrón(es) detectado(s) de ${result.total_rounds} rondas`,
    })
  } catch {
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 })
  }
}
