import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const FORMATOS = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome'] as const
const MODOS = ['gross', 'neto'] as const

const createSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()),
  course_id: z.string().uuid(),
  format: z.enum(FORMATOS),
  modo: z.enum(MODOS),
  hole_count: z.number().int().refine(n => [9, 18].includes(n)),
  tees: z.string().min(1).max(50),
  use_handicap: z.boolean(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  cover_image_url: z.string().url().max(500).optional().nullable(),
  custom_si: z.record(z.string(), z.number().int().min(1).max(18)).optional(),
  suggest_si: z.boolean().optional(),
})

/** Sanitize cover image URL — only allow https from known CDNs */
function sanitizeCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    // Only allow HTTPS (blocks javascript:, data:, http:, etc.)
    if (u.protocol !== 'https:') return null
    return trimmed
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    const rawBody = await req.json()
    const parsed = createSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({
        error: parsed.error.issues[0]?.message || 'Datos inválidos',
        details: parsed.error.issues,
      }, { status: 400 })
    }

    const body = parsed.data

    // B5: Server-side format/mode rules
    const modoFinal = (body.format === 'match_play' || body.format === 'stableford')
      ? 'neto' : body.modo

    // Generate slug
    const slug = body.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50) + '-' + Date.now().toString(36)

    // Generate crypto-safe tournament code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    const codigo = Array.from(bytes).map(b => chars[b % chars.length]).join('')

    // B4: Sanitize cover URL
    const coverUrl = sanitizeCoverUrl(body.cover_image_url)

    // Promote user to organizer
    await supabase.from('profiles').update({ role: 'organizer' }).eq('id', user.id)

    // Insert tournament
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({
        name: body.name,
        slug,
        organizer_id: user.id,
        course_id: body.course_id,
        format: body.format,
        formato_juego: body.format,
        modo_juego: modoFinal,
        hole_count: body.hole_count,
        tees: body.tees,
        use_handicap: body.use_handicap,
        afecta_estadisticas: true,
        codigo,
        cover_image_url: coverUrl,
        status: 'draft',
        date_start: body.date_start,
        total_rounds: 1,
      })
      .select('id, slug')
      .single()

    if (tErr || !tournament) {
      const msg = (tErr?.message || '').toLowerCase()
      if (msg.includes('slug') || msg.includes('unique') || msg.includes('duplicate')) {
        return NextResponse.json({ error: 'Ya existe un torneo con ese nombre. Agrega el año o un identificador.' }, { status: 409 })
      }
      console.error('[create-torneo] Error:', tErr)
      return NextResponse.json({ error: tErr?.message || 'Error al crear el torneo' }, { status: 500 })
    }

    // Default category
    await supabase.from('categories').insert({
      tournament_id: tournament.id,
      name: 'General',
      handicap_min: 0,
      handicap_max: 54,
    })

    // Course snapshot (non-blocking)
    try {
      const { saveCourseSnapshot } = await import('@/lib/save-course-snapshot')
      const siOverride = body.custom_si && Object.keys(body.custom_si).length > 0 ? body.custom_si : null
      await saveCourseSnapshot(supabase, 'tournaments', tournament.id, body.course_id, siOverride, body.tees)

      // Community SI proposal
      if (body.suggest_si && siOverride) {
        await supabase.from('course_si_proposals').insert({
          course_id: body.course_id,
          proposed_by: user.id,
          stroke_index: siOverride,
        })
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({
      ok: true,
      tournament_id: tournament.id,
      slug: tournament.slug,
    })
  } catch (err) {
    console.error('[create-torneo] Error interno:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
