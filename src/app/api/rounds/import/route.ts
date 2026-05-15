import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { importRound } from '@/lib/import-round'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const importRoundSchema = z.object({
  courseName: z.string().min(2).max(200),
  courseId: z.string().uuid().optional(),
  teeColor: z.string().max(50).optional(),
  playedAt: z.string().min(8).max(30),
  scores: z.array(z.number().int().min(1).max(20)).min(1).max(18),
  totalGross: z.number().int().min(18).max(200).optional(),
  notes: z.string().max(1000).optional(),
  privacy: z.enum(['public', 'private']).optional(),
  source: z.enum(['manual', 'ronda_libre', 'photo_scan', 'garmin', 'csv', 'import']).optional(),
  parPerHole: z.record(z.string(), z.number().int().min(3).max(6)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const rawBody = await request.json()
    const parsed = importRoundSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.issues[0]?.message },
        { status: 400 }
      )
    }

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
      parPerHole,
      metadata,
    } = parsed.data

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
      parPerHole: parPerHole ?? null,
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
