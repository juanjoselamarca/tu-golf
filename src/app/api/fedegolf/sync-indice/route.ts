import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfLogin, fedegolfGetIndice } from '@/lib/fedegolf/client'
import { decrypt } from '@/lib/fedegolf/crypto'
import { captureError } from '@/lib/error-tracking'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  MENSAJE_NO_VINCULADO,
  sincronizarIndice,
  type CredencialesFedegolf,
  type ResultadoSyncIndice,
} from '@/lib/fedegolf/sincronizar-indice'

export const dynamic = 'force-dynamic'

// La lógica (cooldown, qué error desvincula y cuál no) vive en
// src/lib/fedegolf/sincronizar-indice.ts; acá solo se cablea Supabase y se
// traduce el resultado a HTTP. Siempre 200 salvo fallas de auth/infra:
// FedegolfSync se monta en el layout raíz y no debe ensuciar la consola.

// Freno de reintentos mientras FedeGolf está caído (un degradado no sella el
// cooldown). En memoria por instancia: suficiente para cortar el martilleo por
// navegación; la versión persistente llega con B7 (Fase 1).
const REINTENTO_FEDEGOLF_MS = 15 * 60 * 1000

function aRespuesta(r: ResultadoSyncIndice) {
  switch (r.estado) {
    case 'no_vinculado':
      return { ok: false, linked: false, error: MENSAJE_NO_VINCULADO }
    case 'requiere_reconexion':
      return {
        ok: false,
        linked: false,
        requiere_reconexion: true,
        error: 'Tu clave de FedeGolf cambió. Vuelve a vincular tu cuenta.',
      }
    case 'cacheado':
      return { ok: true, indice: r.indice, indice_anterior: null, cambio: false, cached: true }
    case 'degradado':
      return { ok: true, indice: r.indice, indice_anterior: null, cambio: false, cached: true, degradado: true }
    case 'sincronizado':
      return {
        ok: true,
        indice: r.indice,
        // El anterior viaja para que el cliente pueda AVISARLE al usuario el cambio
        // concreto ("9.1 → 9.3") en vez de solo saber que hubo uno.
        indice_anterior: r.cambio ? r.indiceAnterior : null,
        cambio: r.cambio,
        cached: false,
      }
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    // captureError escribe en error_logs con varios await: se esperan todos antes
    // de responder, porque Vercel congela la función apenas sale la respuesta.
    const reportes: Promise<unknown>[] = []
    const reportar = (err: unknown, paso: string) => {
      reportes.push(captureError(err, {
        context: 'fedegolf/sync-indice',
        userId: user.id,
        level: paso === 'decrypt_credenciales' ? 'error' : 'warning',
        meta: { paso },
      }))
    }

    const resultado = await sincronizarIndice({
      leerCredenciales: async () => {
        const { data, error } = await supabase
          .from('fedegolf_credentials')
          .select('rut_encrypted, password_encrypted, activo, ultimo_sync, ultimo_indice')
          .eq('user_id', user.id)
          .maybeSingle()
        if (error) throw error
        return (data as CredencialesFedegolf | null) ?? null
      },
      puedeConsultarFedegolf: () =>
        checkRateLimit(`fedegolf-sync-indice:${user.id}`, 1, REINTENTO_FEDEGOLF_MS).allowed,
      decrypt,
      login: fedegolfLogin,
      getIndice: fedegolfGetIndice,
      marcarInactiva: async () => {
        const { error } = await supabase
          .from('fedegolf_credentials')
          .update({ activo: false })
          .eq('user_id', user.id)
        if (error) reportar(error, 'marcar_inactiva')
      },
      guardarSync: async (indice) => {
        const { error: updateError } = await supabase
          .from('fedegolf_credentials')
          .update({ ultimo_sync: new Date().toISOString(), ultimo_indice: indice })
          .eq('user_id', user.id)
        if (updateError) reportar(updateError, 'update_credenciales')

        if (indice !== null) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ indice })
            .eq('id', user.id)
          if (profileError) reportar(profileError, 'update_perfil')
        }
      },
      registrarIndice: async (indice) => {
        const { error } = await supabase
          .from('indice_historial')
          .insert({ user_id: user.id, indice, fuente: 'fedegolf_sync' })
        if (error) reportar(error, 'insert_historial')
      },
      reportar,
      ahora: () => Date.now(),
    })

    await Promise.allSettled(reportes)
    return NextResponse.json(aRespuesta(resultado))
  } catch (err) {
    await captureError(err, { context: 'fedegolf/sync-indice' })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
