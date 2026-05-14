// src/app/api/torneos/draft/[id]/create-tournament/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { upgradeConfig } from '@/lib/draft/upgrade-config'
import { tournamentConfigSchema } from '@/lib/draft/schema'
import { validateGolfRules } from '@/golf/tournament-config-validator'

export const dynamic = 'force-dynamic'

function genSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50) + '-' + Date.now().toString(36)
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Owner-only
  const { data: d, error: dErr } = await supabase
    .from('tournament_drafts')
    .select('owner_id, config, status')
    .eq('id', params.id)
    .single()
  if (dErr || !d) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (d.owner_id !== user.id) return NextResponse.json({ error: 'Solo owner puede crear' }, { status: 403 })
  if (d.status !== 'draft') return NextResponse.json({ error: 'Draft no editable' }, { status: 409 })

  const config = upgradeConfig(d.config)

  // Validacion dura (zod + golf rules)
  const z = tournamentConfigSchema.safeParse(config)
  if (!z.success) return NextResponse.json({ error: 'Config invalido', details: z.error.issues }, { status: 400 })

  const v = validateGolfRules(config)
  if (v.errors.length > 0) return NextResponse.json({ error: 'Reglas de golf', details: v.errors }, { status: 400 })
  if (!v.isReadyToCreate) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  // Lock: status=creating
  await supabase.from('tournament_drafts').update({ status: 'creating' }).eq('id', params.id)

  // Service role para insertar (transaccion simulada con compensacion)
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const slug = genSlug(config.name)
  const code = genCode()
  const firstRound = config.rounds[0]

  // ID del tournament insertado — se setea después del primer insert.
  // Lo necesitamos en el catch para deletear si algún paso posterior falla,
  // y el cascade FK (ON DELETE CASCADE en categories/prizes/rounds/players)
  // limpia los hijos automáticamente. Equivale a un rollback transaccional
  // hasta que el cliente JS de Supabase exponga BEGIN/COMMIT directo.
  let tournamentId: string | null = null

  try {
    const { data: tour, error: tErr } = await service
      .from('tournaments')
      .insert({
        name: config.name,
        slug,
        organizer_id: user.id,
        course_id: firstRound.course_id,
        format: config.format,
        formato_juego: config.format,
        modo_juego: config.modo,
        hole_count: firstRound.hole_count,
        tees: firstRound.tee_assignment_mode === 'per_player' ? 'per_player' : 'mixed',
        use_handicap: config.use_handicap,
        afecta_estadisticas: !config.is_practice,
        codigo: code,
        cover_image_url: config.cover_image_url,
        status: 'draft',
        date_start: config.date_start,
        total_rounds: config.rounds.length,
      })
      .select('id, slug')
      .single()

    if (tErr || !tour) throw new Error(tErr?.message || 'Error creando tournament')
    tournamentId = tour.id

    // Categories — sin throw silencioso. Si esto falla deletea todo.
    const catsToInsert = config.categories.map(c => ({
      tournament_id: tour.id,
      name: c.name,
      handicap_min: c.handicap_min,
      handicap_max: c.handicap_max,
    }))
    if (catsToInsert.length > 0) {
      const { error: cErr } = await service.from('categories').insert(catsToInsert)
      if (cErr) throw new Error(`categories: ${cErr.message}`)
    }

    // Prizes
    const prizesToInsert = config.prizes.map(p => ({
      tournament_id: tour.id,
      type: p.type,
      description: p.description,
      position: p.position,
      hole_number: p.hole_number,
    }))
    if (prizesToInsert.length > 0) {
      const { error: pErr } = await service.from('tournament_prizes').insert(prizesToInsert)
      if (pErr) throw new Error(`prizes: ${pErr.message}`)
    }

    // Rounds (a partir de la 2da, ya que la 1ra está en tournament directo)
    if (config.rounds.length > 1) {
      const extraRounds = config.rounds.slice(1).map(r => ({
        tournament_id: tour.id,
        round_number: r.round_number,
        date: r.date,
        course_id: r.course_id,
      }))
      const { error: rErr } = await service.from('rounds').insert(extraRounds)
      if (rErr) throw new Error(`rounds: ${rErr.message}`)
    }

    // Marca el draft como created — última operación. Si falla, todavía
    // tenemos un tournament válido pero el draft queda en 'creating'.
    // Mejor que crear y tener un draft sucio: si esto fallara, dejamos el
    // draft en 'creating' y el cliente puede reintentar el cierre.
    const { error: uErr } = await service
      .from('tournament_drafts')
      .update({ status: 'created', tournament_id: tour.id })
      .eq('id', params.id)
    if (uErr) throw new Error(`draft status update: ${uErr.message}`)

    return NextResponse.json({ ok: true, tournament_id: tour.id, slug: tour.slug })
  } catch (err: unknown) {
    // Compensación atómica: si insertamos tournament, deletear (cascade
    // limpia categories, prizes, rounds, players por FK ON DELETE CASCADE).
    if (tournamentId) {
      const { error: dErr } = await service
        .from('tournaments')
        .delete()
        .eq('id', tournamentId)
      if (dErr) {
        console.error('[create-tournament] rollback delete falló:', dErr.message,
          'tournamentId huérfano:', tournamentId)
      }
    }
    // Volver el draft a 'draft' para que el organizador pueda reintentar.
    await service
      .from('tournament_drafts')
      .update({ status: 'draft' })
      .eq('id', params.id)
    const msg = err instanceof Error ? err.message : 'Error creando torneo'
    console.error('[create-tournament] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
