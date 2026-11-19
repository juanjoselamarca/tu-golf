// src/app/api/torneos/[slug]/grupos/route.ts
//
// POST — Con el torneo EN JUEGO, el organizador crea un grupo con su tarjeta, vacío, para colocar jugadores ahí
// (#814 · PR4, D5). Body (todo opcional, no ambos):
//   · `nombre`   el del grupo nuevo; sin él, el que sigue ("Grupo N" / "Equipo N");
//   · `groupId`  un grupo vacío que el inicio no armó (sin tarjeta): recibe la suya y conserva su nombre.
// Responde 201 con `{ ok, groupId, rondaLibreId, nombre }`. La regla la aplica la RPC `crear_grupo_en_juego`.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { crearGrupoEnJuego, LARGO_MAX_NOMBRE_GRUPO } from '@/lib/data/tournaments/grupoEnJuego'
import { respuestaDeGrupo, torneoDelOrganizador } from '@/lib/api/gestion-en-juego'
import { createClient as createServerClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    nombre: z.string().trim().min(1).max(LARGO_MAX_NOMBRE_GRUPO).optional(),
    groupId: z.string().uuid().optional(),
  })
  .strict()
  .refine((b) => !(b.nombre && b.groupId), { message: 'nombre o groupId, no ambos' })

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let raw: unknown = {}
  try {
    const texto = await request.text()
    if (texto.trim()) raw = JSON.parse(texto)
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

  const res = await crearGrupoEnJuego(acceso.svc, acceso.torneo, {
    nombre: body.data.nombre ?? null,
    groupId: body.data.groupId ?? null,
    creatorId: acceso.userId,
  })
  return respuestaDeGrupo(res, 201)
}
