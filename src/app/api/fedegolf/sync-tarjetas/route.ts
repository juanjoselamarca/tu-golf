import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { decrypt } from '@/lib/fedegolf/crypto'
import { fedegolfPageLogin } from '@/lib/fedegolf/page-login'
import { fedegolfGetTarjetasIndice } from '@/lib/fedegolf/tarjetas'
import { capturarTarjetas } from '@/lib/fedegolf/capturar-tarjetas'

export const dynamic = 'force-dynamic'

/**
 * Sync de las ~20 tarjetas oficiales que componen el índice del socio.
 *
 * INDEPENDIENTE del sync de índice (spec D4): endpoint propio, cooldown propio
 * (`ultimo_sync_tarjetas`), y todo envuelto en try/catch fail-soft — si
 * fedegolf.cl cambia y el parseo se rompe, NO tumba el sync de índice ni la app.
 * Nunca marca `activo=false` (eso es del sync de índice, estado compartido).
 */
const SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000

export async function POST() {
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

    // Sin cuenta vinculada = estado válido (200), no error (mismo criterio que sync-indice).
    if (credsError || !creds || !creds.activo) {
      return NextResponse.json({ ok: false, linked: false }, { status: 200 })
    }

    // Cooldown propio.
    if (creds.ultimo_sync_tarjetas) {
      const last = new Date(creds.ultimo_sync_tarjetas).getTime()
      if (Date.now() - last < SYNC_COOLDOWN_MS) {
        return NextResponse.json({ ok: true, cached: true, capturadas: 0 })
      }
    }

    let rut: string
    let password: string
    try {
      rut = decrypt(creds.rut_encrypted)
      password = decrypt(creds.password_encrypted)
    } catch {
      return NextResponse.json({ ok: false, error: 'credenciales' }, { status: 200 })
    }

    // Login de PÁGINA (con lva). Si falla, fail-soft: NO tocamos `activo`
    // (podría seguir sirviendo para el sync de índice vía services.php).
    let session
    try {
      session = await fedegolfPageLogin(rut, password)
    } catch {
      return NextResponse.json({ ok: false, error: 'login-pagina' }, { status: 200 })
    }

    const tarjetas = await fedegolfGetTarjetasIndice(session)
    const { total } = await capturarTarjetas(supabase, user.id, tarjetas)

    await supabase
      .from('fedegolf_credentials')
      .update({ ultimo_sync_tarjetas: new Date().toISOString() })
      .eq('user_id', user.id)

    return NextResponse.json({ ok: true, cached: false, capturadas: total })
  } catch (err) {
    // Fail-soft total: cualquier cambio de fedegolf.cl no debe romper la app.
    console.error('sync-tarjetas fallo (no bloqueante):', err)
    return NextResponse.json({ ok: false, error: 'sync-tarjetas' }, { status: 200 })
  }
}
