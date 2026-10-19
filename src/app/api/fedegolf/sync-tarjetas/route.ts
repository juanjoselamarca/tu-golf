import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { decrypt } from '@/lib/fedegolf/crypto'
import { fedegolfPageLogin } from '@/lib/fedegolf/page-login'
import { fedegolfLogin } from '@/lib/fedegolf/client'
import { fedegolfGetTarjetasIndice } from '@/lib/fedegolf/tarjetas'
import { capturarTarjetas } from '@/lib/fedegolf/capturar-tarjetas'
import { captureError } from '@/lib/error-tracking'
import { sincronizarTarjetas, type ResultadoSyncTarjetas } from '@/lib/fedegolf/sincronizar-tarjetas'

export const dynamic = 'force-dynamic'

// La lógica (cooldown, detección de clave cambiada) vive en
// src/lib/fedegolf/sincronizar-tarjetas.ts. Siempre 200 salvo auth: FedegolfSync
// la dispara en segundo plano y nunca debe ensuciar la consola.

function aRespuesta(r: ResultadoSyncTarjetas) {
  switch (r.estado) {
    case 'no_vinculado':
      return { ok: false, linked: false }
    case 'requiere_reconexion':
      return { ok: false, linked: true, requiere_reconexion: true }
    case 'cacheado':
      return { ok: true, cached: true, capturadas: 0 }
    case 'credenciales_almacenadas':
      return { ok: false, error: 'credenciales' }
    case 'login_fallido':
      return { ok: false, error: 'login-pagina' }
    case 'capturadas':
      return { ok: true, cached: false, capturadas: r.total }
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Debes iniciar sesión' }, { status: 401 })
    }

    const reportes: Promise<unknown>[] = []
    const reportar = (err: unknown, paso: string) => {
      reportes.push(captureError(err, {
        context: 'fedegolf/sync-tarjetas',
        userId: user.id,
        level: paso === 'decrypt_credenciales' ? 'error' : 'warning',
        meta: { paso },
      }))
    }
    const credenciales = () => supabase.from('fedegolf_credentials')

    const resultado = await sincronizarTarjetas({
      leerCredenciales: async () => {
        const { data, error } = await credenciales()
          .select('rut_encrypted, password_encrypted, activo, ultimo_sync_tarjetas')
          .eq('user_id', user.id)
          .maybeSingle()
        if (error) throw error
        return data
      },
      decrypt,
      sellarCooldown: async () => {
        const { error } = await credenciales()
          .update({ ultimo_sync_tarjetas: new Date().toISOString() })
          .eq('user_id', user.id)
        if (error) reportar(error, 'sellar_cooldown')
      },
      pageLogin: fedegolfPageLogin,
      verificarClave: fedegolfLogin,
      marcarClaveRechazada: async (passwordEncrypted) => {
        const { error } = await credenciales()
          .update({ activo: false })
          .eq('user_id', user.id)
          .eq('password_encrypted', passwordEncrypted)
        if (error) reportar(error, 'marcar_clave_rechazada')
      },
      getTarjetas: async (session) => (await fedegolfGetTarjetasIndice(session)).tarjetas,
      capturar: async (tarjetas) => (await capturarTarjetas(supabase, user.id, tarjetas)).total,
      reportar,
      ahora: () => Date.now(),
    })

    await Promise.allSettled(reportes)
    return NextResponse.json(aRespuesta(resultado))
  } catch (err) {
    // Fail-soft total: cualquier cambio de fedegolf.cl no debe romper la app.
    await captureError(err, { context: 'fedegolf/sync-tarjetas' })
    return NextResponse.json({ ok: false, error: 'sync-tarjetas' }, { status: 200 })
  }
}
