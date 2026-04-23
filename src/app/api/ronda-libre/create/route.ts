import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const LATAM_FORMATOS = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome'] as const
const MODOS = ['gross', 'neto'] as const

const playerSchema = z.object({
  nombre: z.string().min(1).max(100),
  user_id: z.string().uuid().nullable(),
  handicap: z.number().min(-10).max(54).nullable(),
  tees: z.string().max(50).nullable(),
  is_guest: z.boolean().optional(),
  telefono_invitado: z.string().max(30).optional(),
  nombre_invitado: z.string().max(100).optional(),
})

const equipoSchema = z.object({
  nombre: z.string().min(1).max(50),
  jugadorIndices: z.array(z.number().int().min(0)),
})

const createSchema = z.object({
  course_id: z.string().uuid().nullable(),
  course_name: z.string().min(1).max(200),
  tees: z.string().min(1).max(50),
  holes: z.number().int().refine(n => [9, 18, 27].includes(n), 'Holes must be 9, 18, or 27'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  hoyo_inicio: z.number().int().min(1).max(18),
  formato_juego: z.enum(LATAM_FORMATOS),
  modo_juego: z.enum(MODOS),
  admin_mode: z.boolean(),
  recorridos: z.array(z.string()).optional(),
  jugadores: z.array(playerSchema).min(1).max(4),
  equipos: z.array(equipoSchema).optional(),
})

/** Generate a crypto-safe 6-char code and verify uniqueness */
async function generarCodigoUnico(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const bytes = new Uint8Array(4)
    crypto.getRandomValues(bytes)
    const codigo = Array.from(bytes).map(b => b.toString(36)).join('').substring(0, 6).toUpperCase()
    const { data } = await supabase.from('rondas_libres').select('id').eq('codigo', codigo).maybeSingle()
    if (!data) return codigo
  }
  // Fallback: UUID prefix
  return crypto.randomUUID().substring(0, 8).toUpperCase()
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
      const msg = parsed.error.issues[0]?.message || 'Datos inválidos'
      return NextResponse.json({ error: msg, details: parsed.error.issues }, { status: 400 })
    }

    const body = parsed.data

    // B5: Server-side validation of format/mode rules
    if (body.formato_juego === 'match_play' && body.jugadores.length !== 2) {
      return NextResponse.json({ error: 'Match Play requiere exactamente 2 jugadores' }, { status: 400 })
    }

    // Neto modes require handicap on all players
    if (body.modo_juego === 'neto') {
      const sinHcp = body.jugadores.filter(j => j.handicap == null)
      if (sinHcp.length > 0) {
        const nombres = sinHcp.map(j => j.nombre).join(', ')
        return NextResponse.json({
          error: `Faltan handicap: ${nombres}. Modo neto requiere HCP para todos.`,
        }, { status: 400 })
      }
    }

    // Team formats require min players and equipos
    const isTeamFormat = ['best_ball', 'scramble', 'foursome'].includes(body.formato_juego)
    if (isTeamFormat) {
      if (body.jugadores.length < 4) {
        return NextResponse.json({ error: 'Formatos de equipo requieren al menos 4 jugadores' }, { status: 400 })
      }
      if (!body.equipos || body.equipos.length < 2) {
        return NextResponse.json({ error: 'Formatos de equipo requieren al menos 2 equipos' }, { status: 400 })
      }
    }

    // Generate unique code
    const codigo = await generarCodigoUnico(supabase)

    // B1: Atomic insert — ronda + jugadores in one transaction-like flow
    // Supabase JS doesn't support real transactions, but we can:
    // 1. Insert ronda
    // 2. Batch-insert all players at once (not one-by-one)
    // 3. If players fail, delete the ronda (compensating transaction)

    const rondaData: Record<string, unknown> = {
      codigo,
      creador_id: user.id,
      course_id: body.course_id,
      course_name: body.course_name,
      tees: body.tees,
      holes: body.holes,
      fecha: body.fecha,
      estado: 'en_curso',
      hoyo_inicio: body.hoyo_inicio,
      modo_juego: body.modo_juego,
      formato_juego: body.formato_juego,
    }

    if (body.admin_mode) {
      rondaData.admin_mode = true
      rondaData.admin_user_id = user.id
    }

    if (body.recorridos && body.recorridos.length > 0) {
      rondaData.recorridos = body.recorridos
    }

    const { data: ronda, error: rondaErr } = await supabase
      .from('rondas_libres')
      .insert(rondaData)
      .select('id')
      .single()

    if (rondaErr || !ronda) {
      console.error('[create-ronda] Error insert ronda:', rondaErr)
      return NextResponse.json({
        error: rondaErr?.message || 'Error al crear la ronda',
      }, { status: 500 })
    }

    // Batch insert all players at once (atomic per Supabase)
    const playerRows = body.jugadores.map((j, i) => ({
      ronda_id: ronda.id,
      nombre: j.nombre.trim(),
      user_id: i === 0 ? user.id : j.user_id,
      scores: {},
      handicap: j.handicap,
      tees: j.tees || body.tees,
      is_guest: j.is_guest || false,
      telefono_invitado: j.telefono_invitado || null,
      nombre_invitado: j.nombre_invitado || null,
    }))

    const { data: insertedPlayers, error: playersErr } = await supabase
      .from('ronda_libre_jugadores')
      .insert(playerRows)
      .select('id, nombre')

    if (playersErr || !insertedPlayers) {
      // Compensating transaction: delete the ronda since players failed
      console.error('[create-ronda] Error insert players, rolling back:', playersErr)
      await supabase.from('rondas_libres').delete().eq('id', ronda.id)
      return NextResponse.json({
        error: 'Error al registrar jugadores. La ronda no fue creada.',
      }, { status: 500 })
    }

    // Team format: insert equipos + members
    if (isTeamFormat && body.equipos && body.equipos.length > 0) {
      for (const equipo of body.equipos) {
        const jugadoresEquipo = equipo.jugadorIndices.map(idx => ({
          dbRecord: insertedPlayers[idx],
          handicap: body.jugadores[idx]?.handicap ?? 0,
        }))

        let handicapEquipo: number | null = null
        if (body.formato_juego === 'scramble') {
          const handicaps = jugadoresEquipo.map(j => j.handicap)
          // Scramble: 35% lowest + 15% highest (simplified)
          const sorted = [...handicaps].sort((a, b) => (a ?? 0) - (b ?? 0))
          handicapEquipo = Math.round(sorted[0] * 0.35 + sorted[sorted.length - 1] * 0.15)
        } else if (body.formato_juego === 'foursome') {
          const h = jugadoresEquipo.map(j => j.handicap)
          handicapEquipo = Math.round(((h[0] ?? 0) + (h[1] ?? 0)) / 2)
        }

        const { data: equipoDB } = await supabase
          .from('ronda_equipos')
          .insert({
            ronda_id: ronda.id,
            nombre: equipo.nombre,
            handicap_equipo: handicapEquipo,
            scores: {},
          })
          .select('id')
          .single()

        if (equipoDB) {
          const members = jugadoresEquipo.map((j, idx) => ({
            equipo_id: equipoDB.id,
            jugador_id: j.dbRecord.id,
            orden: idx,
          }))
          await supabase.from('ronda_equipo_jugadores').insert(members)
        }
      }
    }

    // Course snapshot (non-blocking)
    if (body.course_id && ronda.id) {
      try {
        const { saveCourseSnapshot } = await import('@/lib/save-course-snapshot')
        await saveCourseSnapshot(supabase, 'rondas_libres', ronda.id, body.course_id, null, body.tees)
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      ok: true,
      ronda_id: ronda.id,
      codigo,
    })
  } catch (err) {
    console.error('[create-ronda] Error interno:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
