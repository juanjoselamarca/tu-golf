import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const cancha = searchParams.get('cancha')

    let query = supabase
      .from('rondas_libres')
      .select(`
        id, codigo, course_name, tees, holes,
        fecha, estado, hoyo_inicio,
        ronda_libre_jugadores ( id, nombre, user_id, scores )
      `)
      .eq('estado', 'en_curso')
      .order('fecha', { ascending: false })
      .limit(50)

    if (cancha?.trim() && cancha.trim().length >= 2) {
      query = query.ilike('course_name', `%${cancha.trim()}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const rondas = (data ?? []).map((ronda: Record<string, unknown>) => {
      const jugadores = ((ronda.ronda_libre_jugadores ?? []) as Array<{ id: string; nombre: string; user_id: string | null; scores: Record<string, number> }>).map(j => {
        const scores = j.scores ?? {}
        const validos = Object.values(scores).filter(s => s != null && Number(s) > 0)
        return {
          id: j.id,
          nombre: j.nombre ?? 'Jugador',
          holesCompleted: validos.length,
          totalGross: validos.reduce((a, b) => a + Number(b), 0),
        }
      })

      return {
        id: ronda.id,
        codigo: ronda.codigo,
        course_name: (ronda.course_name as string) ?? 'Cancha',
        tees: ronda.tees,
        holes: (ronda.holes as number) ?? 18,
        fecha: ronda.fecha,
        hoyo_inicio: (ronda.hoyo_inicio as number) ?? 1,
        jugadores,
        maxHolesCompleted: jugadores.reduce((m: number, j: { holesCompleted: number }) => Math.max(m, j.holesCompleted), 0),
        totalJugadores: jugadores.length,
      }
    })

    const corsOrigin = process.env.NODE_ENV === 'production'
      ? 'https://tu-golf.vercel.app'
      : 'http://localhost:3000'

    return NextResponse.json({
      rondas,
      total: rondas.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
    })
  } catch (err) {
    console.error('[/api/en-vivo]', err)
    return NextResponse.json({ error: 'Error al obtener rondas' }, { status: 500 })
  }
}
