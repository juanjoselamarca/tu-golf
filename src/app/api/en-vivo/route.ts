import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularScoreRonda } from '@/golf/core/round-score'

export const dynamic = 'force-dynamic'

type RondaRow = {
  id: string
  codigo: string
  course_name: string | null
  course_id: string | null
  tees: string | null
  holes: number | null
  fecha: string
  hoyo_inicio: number | null
  ronda_libre_jugadores: Array<{
    id: string
    nombre: string | null
    user_id: string | null
    scores: Record<string, number> | null
  }> | null
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const cancha = searchParams.get('cancha')

    let query = supabase
      .from('rondas_libres')
      .select(`
        id, codigo, course_name, course_id, tees, holes,
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

    const rondasRaw = (data ?? []) as unknown as RondaRow[]

    // Batch fetch course_holes for every ronda que tenga course_id (1 query)
    const courseIds = Array.from(
      new Set(rondasRaw.map(r => r.course_id).filter((id): id is string => !!id))
    )

    const parMapByCourse = new Map<string, Record<number, number>>()
    if (courseIds.length > 0) {
      const { data: holesData } = await supabase
        .from('course_holes')
        .select('course_id, numero, par')
        .in('course_id', courseIds)

      for (const row of (holesData ?? []) as Array<{ course_id: string; numero: number; par: number }>) {
        const map = parMapByCourse.get(row.course_id) ?? {}
        map[row.numero] = row.par
        parMapByCourse.set(row.course_id, map)
      }
    }

    const rondas = rondasRaw.map(ronda => {
      const totalHoles = ronda.holes ?? 18
      // parMap: si el curso no tiene datos cargados, fallback par 4 por hoyo
      const parMap: Record<number, number> =
        (ronda.course_id && parMapByCourse.get(ronda.course_id)) || {}
      if (Object.keys(parMap).length === 0) {
        for (let i = 1; i <= totalHoles; i++) parMap[i] = 4
      }

      const jugadores = (ronda.ronda_libre_jugadores ?? []).map(j => {
        const scores = (j.scores ?? {}) as Record<string, number>
        const { gross, vsPar, holesPlayed } = calcularScoreRonda({
          scores,
          roundHoles: totalHoles,
          parMap,
        })
        return {
          id: j.id,
          nombre: j.nombre ?? 'Jugador',
          holesCompleted: holesPlayed,
          totalGross: gross,
          vsPar,
          totalHoles,
        }
      })

      return {
        id: ronda.id,
        codigo: ronda.codigo,
        course_name: ronda.course_name ?? 'Cancha',
        tees: ronda.tees,
        holes: totalHoles,
        fecha: ronda.fecha,
        hoyo_inicio: ronda.hoyo_inicio ?? 1,
        jugadores,
        maxHolesCompleted: jugadores.reduce((m, j) => Math.max(m, j.holesCompleted), 0),
        totalJugadores: jugadores.length,
      }
    })

    const corsOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://golfersplus.vercel.app'

    return NextResponse.json({
      rondas,
      total: rondas.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    })
  } catch (err) {
    console.error('[/api/en-vivo]', err)
    return NextResponse.json({ error: 'Error al obtener rondas' }, { status: 500 })
  }
}
