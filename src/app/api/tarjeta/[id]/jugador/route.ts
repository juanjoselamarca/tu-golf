import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { leerNombreDelDueñoDeTarjetaPublica } from '@/lib/data/tarjeta-nombre-publico'

// Público y sin sesión: el nombre de quien compartió una tarjeta pública
// (`/tarjeta/[id]`). La regla de qué se expone vive en la capa de datos.
// Un error de la base no se cachea: si no, la tarjeta quedaría sin nombre minutos.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await leerNombreDelDueñoDeTarjetaPublica(createAdminClient(), id)
  if ('error' in r) {
    return NextResponse.json({ nombre: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json(
    { nombre: r.nombre },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
  )
}
