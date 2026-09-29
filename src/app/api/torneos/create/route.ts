// src/app/api/torneos/create/route.ts
//
// Camino LEGACY de creación (un solo POST con los campos básicos, sin draft).
// Crea SIEMPRE un torneo de una ronda: la cancha/fecha/hoyos van en
// `tournaments` (que es donde vive la ronda 1 — ver `@/golf/tournament-rounds`).
//
// Comparte con el wizard las fuentes únicas: formatos (`KNOWN_FORMAT_KEYS`),
// slug y código (`createTournament.ts`), fechas (`tournament-fechas`) y el
// guardarrail de cancha (`canchasNoAptasParaTorneo`).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import { canchasNoAptasParaTorneo } from '@/lib/data/course-aptitud'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { validarFechaTorneo, mensajeFechaInvalida } from '@/golf/tournament-fechas'
import { genTournamentCode, genTournamentSlug } from '@/lib/data/tournaments/createTournament'

export const dynamic = 'force-dynamic'

const MODOS = ['gross', 'neto'] as const

const createSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()),
  course_id: z.string().uuid(),
  // Lista canónica del registry de formatos (antes una copia local que podía
  // quedar desfasada del motor).
  format: z.string().refine((f) => KNOWN_FORMAT_KEYS.includes(f), 'Formato desconocido'),
  modo: z.enum(MODOS),
  hole_count: z.number().int().refine(n => [9, 18].includes(n)),
  tees: z.string().min(1).max(50),
  use_handicap: z.boolean(),
  date_start: z.string().superRefine((d, ctx) => {
    // La MISMA regla que el wizard: formato real + margen pasado/futuro.
    const motivo = validarFechaTorneo(d, new Date())
    if (motivo) ctx.addIssue({ code: 'custom', message: mensajeFechaInvalida(motivo, new Date()) })
  }),
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

    // Rate limit: 5 per minute (tournament creation)
    const rl = checkRateLimit(`create-torneo:${user.id}`, 5, 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
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

    // Guardarrail de datos de cancha — mismo gate que el wizard
    // (`draft/[id]/create-tournament`). Este camino legacy no puede quedar
    // como puerta trasera para crear un torneo sobre una cancha cuyo rating
    // miente. Va DESPUÉS de `modoFinal`: match_play y stableford fuerzan neto,
    // así que necesitan rating aunque el body diga gross.
    const noAptas = await canchasNoAptasParaTorneo(
      supabase,
      [{ round_number: 1, course_id: body.course_id, hole_count: body.hole_count }],
      { modo: modoFinal, use_handicap: body.use_handicap },
    )
    if (noAptas.length > 0) {
      return NextResponse.json({ error: noAptas[0].mensaje, details: noAptas }, { status: 400 })
    }

    const slug = genTournamentSlug(body.name)
    const codigo = genTournamentCode()

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
        // Una sola ronda: empieza y termina el mismo día.
        date_end: body.date_start,
        total_rounds: 1,
      })
      .select('id, slug')
      .single()

    if (tErr || !tournament) {
      const msg = (tErr?.message || '').toLowerCase()
      if (msg.includes('slug') || msg.includes('unique') || msg.includes('duplicate')) {
        return NextResponse.json({ error: 'Ya existe un torneo con ese nombre. Agrega el año o un identificador.' }, { status: 409 })
      }
      void captureError(tErr ?? new Error('tournament insert sin fila'), {
        context: 'api.torneos.create.insert',
        level: 'error',
        meta: { userId: user.id },
      })
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
    void captureError(err, { context: 'api.torneos.create', level: 'error' })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
