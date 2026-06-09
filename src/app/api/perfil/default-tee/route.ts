import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { applyDefaultTeeToRounds } from '@/lib/data/recompute-tee-rounds'
import { extractTeeColor } from '@/golf/courses/tee-resolver'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

// Las 4 opciones que ofrece la pregunta de 1 vez (decisión de producto).
const VALID_COLORS = new Set(['negro', 'azul', 'blanco', 'rojo'])

/**
 * Guarda el color de tee por defecto del usuario (preguntado una sola vez) y
 * recomputa sus tarjetas viejas sin tee con ese color → CR/slope del catálogo +
 * re-índice. Punto 3 de import-hardening.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 })

  let body: { color?: string; genero?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  // Normaliza (blue→azul, Blanca→blanco…) y valida contra las 4 opciones.
  const color = extractTeeColor(body.color)
  if (!color || !VALID_COLORS.has(color)) {
    return NextResponse.json({ error: 'Elegí un color: negro, azul, blanco o rojo.' }, { status: 400 })
  }

  // Género opcional ('M'=varones / 'F'=damas) para desambiguar tees del mismo
  // color por género.
  const generoRaw = (body.genero || '').toString().trim().toUpperCase()
  const genero = generoRaw === 'M' || generoRaw === 'F' ? generoRaw : null

  // 1. Guardar la preferencia.
  const { error: upErr } = await supabase
    .from('profiles')
    .update({ default_tee_color: color, ...(genero ? { genero } : {}) })
    .eq('id', user.id)
  if (upErr) {
    captureError(upErr, { context: 'perfil.default-tee.update' })
    return NextResponse.json({ error: 'No pudimos guardar tu preferencia.' }, { status: 500 })
  }

  // 2. Recomputar las tarjetas viejas sin tee + re-índice (best-effort: si esto
  //    falla, la preferencia ya quedó guardada y las próximas importaciones la usan).
  let recomputed = 0
  try {
    // Género efectivo: el recién fijado o el que ya tenía el perfil.
    const { data: prof } = await supabase.from('profiles').select('genero').eq('id', user.id).single()
    recomputed = await applyDefaultTeeToRounds(supabase, user.id, color, prof?.genero)
    if (recomputed > 0) {
      await supabase.rpc('calcular_indice_golfers', { p_user_id: user.id })
    }
  } catch (e) {
    captureError(e, { context: 'perfil.default-tee.recompute' })
  }

  return NextResponse.json({ ok: true, color, recomputed })
}
