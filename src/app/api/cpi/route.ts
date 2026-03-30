import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularCPI } from '@/golf/stats/cpi'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rondas, error } = await supabase
    .from('historical_rounds')
    .select('played_at, total_gross, course_rating, slope_rating')
    .eq('user_id', user.id)
    .order('played_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Map to CPI input format - holes_played may not exist yet
  const rondasCPI = (rondas ?? []).map(r => ({
    played_at: r.played_at,
    total_gross: r.total_gross,
    course_rating: r.course_rating ?? null,
    slope_rating: r.slope_rating ?? null,
  }))

  const resultado = calcularCPI(rondasCPI)

  // Save cache in profiles (columns may not exist until migration runs)
  try {
    await supabase.from('profiles').update({
      cpi_score: resultado.score,
      cpi_updated_at: new Date().toISOString(),
      cpi_trend: resultado.trend,
      cpi_status: resultado.status,
    }).eq('id', user.id)
  } catch (error) { console.error('[CPI]', error) }

  return NextResponse.json({ ...resultado, updatedAt: new Date().toISOString() })
}
