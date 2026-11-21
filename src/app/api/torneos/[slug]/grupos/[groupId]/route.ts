// src/app/api/torneos/[slug]/grupos/[groupId]/route.ts
//
// DELETE — Con el torneo EN JUEGO, el organizador borra un grupo vacío: sin inscritos (tampoco WD/DQ ni sin
// aprobar), sin filas en su tarjeta y sin golpes. Se van el grupo y su tarjeta (#814 · PR4). La regla la aplica la
// RPC `borrar_grupo_en_juego` bajo lock.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { borrarGrupoEnJuego } from '@/lib/data/tournaments/grupoEnJuego'
import { respuestaDeGrupo, torneoDelOrganizador } from '@/lib/api/gestion-en-juego'
import { createClient as createServerClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; groupId: string }> },
) {
  const { slug, groupId } = await params
  if (!z.string().uuid().safeParse(groupId).success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })

  const acceso = await torneoDelOrganizador(slug, user)
  if (!acceso.ok) return acceso.respuesta

  return respuestaDeGrupo(await borrarGrupoEnJuego(acceso.svc, acceso.torneo, groupId), 200)
}
