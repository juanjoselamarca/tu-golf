import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import { captureError } from '@/lib/error-tracking'
import { CLAVES_PREFERENCIA, preferenciasDeFila, type ClavePreferencia } from '@/lib/push/preferencias'
export const dynamic = 'force-dynamic'

const preferencesSchema = z.object(
  Object.fromEntries(CLAVES_PREFERENCIA.map(k => [k, z.boolean().optional()])) as Record<ClavePreferencia, z.ZodOptional<z.ZodBoolean>>,
).strict()

const COLUMNAS = CLAVES_PREFERENCIA.join(', ')

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('notification_preferences')
    .select(COLUMNAS)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    await captureError(error, { context: 'push/preferences.get', userId: user.id, level: 'warning' })
    return NextResponse.json({ error: 'No pudimos cargar tus preferencias' }, { status: 500 })
  }

  // Solo las preferencias (sin id/user_id/timestamps): el cliente las devuelve tal cual en el PUT.
  return NextResponse.json(preferenciasDeFila(data as Record<string, unknown> | null))
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const raw = await request.json().catch(() => null)
  const parsed = preferencesSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  // Solo las claves que vinieron: cambiar un interruptor no resetea los demás a su
  // default. En una fila nueva, las que faltan toman el DEFAULT de la columna.
  const cambios = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: user.id, ...cambios, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

  if (error) {
    await captureError(error, { context: 'push/preferences.put', userId: user.id, level: 'warning' })
    return NextResponse.json({ error: 'No pudimos guardar tus preferencias' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
