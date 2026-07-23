import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { decrypt } from '@/lib/fedegolf/crypto'
import { fedegolfPageLogin } from '@/lib/fedegolf/page-login'
import { fedegolfGetTarjetasIndice, resumenIndiceOficial } from '@/lib/fedegolf/tarjetas'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

/**
 * Lectura EN VIVO de las ~20 tarjetas que componen el índice oficial del socio,
 * para la vista "Tu índice oficial, explicado" (Fase 2).
 *
 * Es LIVE (login de página + fetch a fedegolf.cl) a propósito: el flag `cuenta`
 * (`selected-row`) que decide cuáles de las 20 entran al índice lo resuelve la
 * fede, no nosotros — así el promedio queda cuadrado al decimal con fedegolf.cl
 * (spec: re-derivar del fetch, no de un campo guardado). El índice oficial en sí
 * lo tiene ya el cliente (`profiles.indice`); acá NO se lee `profiles`.
 *
 * Read-only y fail-soft (D4): no escribe nada y cualquier cambio de fedegolf.cl
 * responde `{ ok:false }` sin 500 — la captura/persistencia es de sync-tarjetas.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Debes iniciar sesión' }, { status: 401 })
    }

    const { data: creds, error: credsError } = await supabase
      .from('fedegolf_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Sin cuenta vinculada = estado válido (200), no error (igual que sync-*).
    if (credsError || !creds || !creds.activo) {
      return NextResponse.json({ ok: false, linked: false }, { status: 200 })
    }

    let rut: string
    let password: string
    try {
      rut = decrypt(creds.rut_encrypted)
      password = decrypt(creds.password_encrypted)
    } catch {
      return NextResponse.json({ ok: false, linked: true, error: 'credenciales' }, { status: 200 })
    }

    let session
    try {
      session = await fedegolfPageLogin(rut, password)
    } catch {
      return NextResponse.json({ ok: false, linked: true, error: 'login-pagina' }, { status: 200 })
    }

    const tarjetas = await fedegolfGetTarjetasIndice(session)
    const resumen = resumenIndiceOficial(tarjetas)

    return NextResponse.json({
      ok: true,
      linked: true,
      tarjetas: resumen.tarjetas,
      promedio: resumen.promedio,
      diferencialesQueCuentan: resumen.diferencialesQueCuentan,
      slotsVentana: resumen.slotsVentana,
      rondasQueCuentan: resumen.rondasQueCuentan,
    })
  } catch (err) {
    // Fail-soft total: nunca 500 hacia una vista informativa.
    await captureError(err, { context: 'fedegolf/tarjetas' })
    return NextResponse.json({ ok: false, error: 'tarjetas' }, { status: 200 })
  }
}
