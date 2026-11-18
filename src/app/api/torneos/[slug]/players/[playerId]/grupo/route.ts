// src/app/api/torneos/[slug]/players/[playerId]/grupo/route.ts
//
// PUT — Con el torneo EN JUEGO, el organizador asigna a un inscrito a un grupo (agregar) o lo cambia de grupo (mover)
// (#814 · PR3, decisiones D1-D14). Un inscrito sin aprobar queda aprobado al asignarlo (D12).
// Body: `{ groupId, desde, confirmado? }`:
//   · `groupId`    el grupo destino;
//   · `desde`      el grupo en que el organizador lo vio (null = sin grupo): si ya no está ahí, 409 sin escribir;
//   · `confirmado` el organizador confirmó una acción que toca golpes (D2, D4, D9). Sin él, 409 `requiere-confirmacion`
//                  con los hoyos que lleva cada uno.
// La regla la evalúa `colocarInscrito` (respuesta rápida) y la RPC `colocar_inscrito_en_grupo` bajo lock (autoridad).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { colocarInscrito } from '@/lib/data/tournaments/colocarInscrito'
import { respuestaDeColocar, torneoDelOrganizador } from '@/lib/api/gestion-en-juego'
import { createClient as createServerClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  groupId: z.string().uuid(),
  desde: z.string().uuid().nullable(),
  confirmado: z.boolean().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; playerId: string }> },
) {
  const { slug, playerId } = await params
  if (!z.string().uuid().safeParse(playerId).success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const body = bodySchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })

  const acceso = await torneoDelOrganizador(slug, user)
  if (!acceso.ok) return acceso.respuesta

  const res = await colocarInscrito(acceso.svc, acceso.torneo, playerId, body.data.groupId, {
    desde: body.data.desde,
    confirmado: body.data.confirmado === true,
  })
  return respuestaDeColocar(res)
}
