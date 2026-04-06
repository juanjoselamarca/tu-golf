import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: rounds, count } = await supabase
    .from('historical_rounds')
    .select('total_gross, played_at, holes_played', { count: 'exact' })
    .eq('user_id', user.id)
    .order('played_at', { ascending: false })
    .limit(20)

  if (!rounds || rounds.length === 0) {
    return NextResponse.json({ gwi: 0, total_rounds: 0, level: 'sin_datos' })
  }

  // Normalizar a over/under par por ronda (respetando 9 vs 18 hoyos)
  const overUnders = rounds.map(r => {
    const par = (r.holes_played ?? 18) <= 9 ? 36 : 72
    return (r.total_gross ?? par) - par
  })
  const avgOverUnder = overUnders.reduce((a, b) => a + b, 0) / overUnders.length
  const avg = rounds.reduce((a, b) => a + (b.total_gross ?? 0), 0) / rounds.length
  const gwi = Math.max(0, Math.min(100, Math.round(100 - avgOverUnder * 2)))

  return NextResponse.json({
    gwi,
    total_rounds: count ?? rounds.length,
    avg_gross: Math.round(avg * 10) / 10,
    level: gwi >= 80 ? 'elite' : gwi >= 60 ? 'avanzado' : gwi >= 40 ? 'intermedio' : 'basico'
  })
}
