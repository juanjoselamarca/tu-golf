import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { nombreDelDueñoDeTarjetaPublica } from '@/lib/data/tarjeta-nombre-publico'

// Público y sin sesión: el nombre de quien compartió una tarjeta pública
// (`/tarjeta/[id]`). La regla de qué se expone vive en la capa de datos.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const nombre = await nombreDelDueñoDeTarjetaPublica(createAdminClient(), id)
  return NextResponse.json(
    { nombre },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } },
  )
}
