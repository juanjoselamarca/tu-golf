import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { eliminarCuenta, mensajeDeBloqueo } from '@/lib/data/eliminar-cuenta'

export const dynamic = 'force-dynamic'

/**
 * Elimina la cuenta del usuario de la sesión. Todo o nada: la RPC `eliminar_cuenta` borra en una
 * transacción (src/lib/data/eliminar-cuenta.ts). Si borrarla destruiría tarjetas de otras personas,
 * responde 409 sin tocar nada.
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
  }

  // Rate limit: 3 requests per hour (irreversible operation)
  const rl = checkRateLimit(`delete-account:${user.id}`, 3, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let resultado: Awaited<ReturnType<typeof eliminarCuenta>>
  try {
    resultado = await eliminarCuenta(createAdminClient(), user.id)
  } catch (error) {
    // Sin service role configurado o la red se cortó: la RPC no corrió, así que no se borró nada.
    resultado = { estado: 'error', error }
  }

  if (resultado.estado === 'bloqueada') {
    return NextResponse.json(
      { error: mensajeDeBloqueo(resultado.bloqueos), bloqueos: resultado.bloqueos },
      { status: 409 },
    )
  }

  if (resultado.estado === 'error') {
    void captureError(resultado.error, { context: 'profile.delete-account', userId: user.id })
    return NextResponse.json(
      { error: 'No pudimos eliminar tu cuenta y no se borró nada. Intenta de nuevo o escríbenos a soporte.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, message: 'Cuenta eliminada correctamente' })
}
