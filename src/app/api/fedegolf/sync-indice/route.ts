import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfGetIndice } from '@/lib/fedegolf/client'
import { decrypt } from '@/lib/fedegolf/crypto'
import { captureError } from '@/lib/error-tracking'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  MENSAJE_NO_VINCULADO,
  sincronizarIndice,
  type ResultadoSyncIndice,
} from '@/lib/fedegolf/sincronizar-indice'
import { persistenciaIndice, leerUltimoCambio, type CambioIndice } from '@/lib/fedegolf/persistencia-indice'

export const dynamic = 'force-dynamic'

// La lógica (cooldown, qué se persiste y cuándo) vive en
// src/lib/fedegolf/sincronizar-indice.ts — la misma que usa el cron diario.
// Acá solo se cablea Supabase y se traduce el resultado a HTTP. Siempre 200 salvo
// fallas de auth/infra: FedegolfSync se monta en el layout raíz y no debe ensuciar
// la consola.

// Freno de reintentos mientras FedeGolf está caído (un degradado no sella el
// cooldown). En memoria por instancia: suficiente para cortar el martilleo por
// navegación; la versión persistente llega con B7 (PR 1b).
const REINTENTO_FEDEGOLF_MS = 15 * 60 * 1000

function aRespuesta(r: ResultadoSyncIndice, ultimoCambio: CambioIndice | null) {
  if (r.estado === 'no_vinculado') return { ok: false, linked: false, error: MENSAJE_NO_VINCULADO }

  // Vinculado (aunque la clave haya cambiado: el índice es por RUT y sigue).
  const comun = {
    ok: true,
    linked: true,
    requiere_reconexion: r.reconectar,
    // El cambio más reciente (de este request, del cron o de otro dispositivo):
    // FedegolfSync lo avisa una sola vez por dispositivo.
    ultimo_cambio: ultimoCambio,
  }
  switch (r.estado) {
    case 'cacheado':
      return { ...comun, indice: r.indice, indice_anterior: null, cambio: false, cached: true }
    case 'sin_indice':
      return { ...comun, indice: r.indice, indice_anterior: null, cambio: false, cached: false, sin_indice: true }
    case 'degradado':
      return { ...comun, indice: r.indice, indice_anterior: null, cambio: false, cached: true, degradado: true }
    case 'sincronizado':
      return {
        ...comun,
        indice: r.indice,
        // El anterior viaja para que el botón "Actualizar" narre el cambio concreto
        // ("9.1 → 9.3") en vez de solo saber que hubo uno.
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
      ...persistenciaIndice(supabase, user.id, reportar),
      puedeConsultarFedegolf: () =>
        checkRateLimit(`fedegolf-sync-indice:${user.id}`, 1, REINTENTO_FEDEGOLF_MS).allowed,
      decrypt,
      getIndice: fedegolfGetIndice,
      reportar,
      ahora: () => Date.now(),
    })

    let ultimoCambio: CambioIndice | null = null
    if (resultado.estado !== 'no_vinculado') {
      try {
        ultimoCambio = await leerUltimoCambio(supabase, user.id, Date.now())
      } catch (err) {
        reportar(err, 'leer_ultimo_cambio')
      }
    }

    await Promise.allSettled(reportes)
    return NextResponse.json(aRespuesta(resultado, ultimoCambio))
  } catch (err) {
    await captureError(err, { context: 'fedegolf/sync-indice' })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
