import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { importRound } from '@/lib/import-round'
import type { ImportSource } from '@/lib/import-round'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      courseName,
      courseId,
      teeColor,
      playedAt,
      scores,
      totalGross,
      notes,
      privacy,
      source,
      metadata,
    } = body as {
      courseName: string
      courseId?: string
      teeColor?: string
      playedAt: string
      scores: number[]
      totalGross?: number
      notes?: string
      privacy?: 'public' | 'private'
      source?: ImportSource
      metadata?: Record<string, unknown>
    }

    // Validation
    if (!courseName || !playedAt || !scores || !Array.isArray(scores)) {
      return NextResponse.json(
        { error: 'Faltan datos: courseName, playedAt y scores son requeridos' },
        { status: 400 }
      )
    }

    const result = await importRound(supabase, {
      userId: user.id,
      courseName,
      courseId: courseId || null,
      teeColor: teeColor || null,
      playedAt,
      scores,
      totalGross: totalGross || null,
      notes: notes || null,
      privacy: privacy || 'private',
      source: source || 'manual',
      metadata: metadata || undefined,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.warnings[0] || 'Error al importar', warnings: result.warnings },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      roundId: result.roundId,
      totalGross: result.totalGross,
      totalNeto: result.totalNeto,
      totalStableford: result.totalStableford,
      warnings: result.warnings,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
