import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfLogin, fedegolfGetIndice } from '@/lib/fedegolf/client'
import { decrypt } from '@/lib/fedegolf/crypto'
import { captureError } from '@/lib/error-tracking'
import { SYNC_INDICE_COOLDOWN_MS } from '@/lib/fedegolf/sync-cooldown'

export const dynamic = 'force-dynamic'

// Cooldown y su texto para el usuario viven en src/lib/fedegolf/sync-cooldown.ts
// (fuente única — antes el route decía 24h y /perfil le decía "4 horas" al usuario).

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    // Buscar credenciales vinculadas
    const { data: creds, error: credsError } = await supabase
      .from('fedegolf_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (credsError || !creds) {
      // 200, no 404: "sin cuenta FedeGolf vinculada" es un estado VÁLIDO, no un
      // error de recurso. FedegolfSync se monta en el layout raíz y dispara este
      // POST en CADA página para todo usuario logueado; con 404 ensuciaba la
      // consola (Failed to load resource 404) en cada carga para la mayoría de
      // usuarios (los no vinculados). El body conserva `error` para que /perfil
      // siga mostrando "Vinculá tu cuenta FedeGolf primero" (matchea por string).
      return NextResponse.json(
        { ok: false, linked: false, error: 'No hay cuenta FedeGolf vinculada' },
        { status: 200 }
      )
    }

    if (!creds.activo) {
      return NextResponse.json(
        { error: 'La vinculación con FedeGolf está desactivada' },
        { status: 404 }
      )
    }

    // Rate limit: si el último sync fue hace menos de SYNC_INDICE_COOLDOWN_MS, devolver cacheado
    if (creds.ultimo_sync) {
      const lastSync = new Date(creds.ultimo_sync).getTime()
      const now = Date.now()
      if (now - lastSync < SYNC_INDICE_COOLDOWN_MS) {
        return NextResponse.json({
          ok: true,
          indice: creds.ultimo_indice,
          indice_anterior: null,
          cambio: false,
          cached: true,
        })
      }
    }

    // Desencriptar credenciales
    let rut: string
    let password: string
    try {
      rut = decrypt(creds.rut_encrypted)
      password = decrypt(creds.password_encrypted)
    } catch (err) {
      await captureError(err, {
        context: 'fedegolf/sync-indice',
        userId: user.id,
        meta: { paso: 'decrypt_credenciales' },
      })
      return NextResponse.json(
        { error: 'Error con las credenciales almacenadas' },
        { status: 500 }
      )
    }

    // Login en fedegolf.cl
    let session
    try {
      session = await fedegolfLogin(rut, password)
    } catch (err) {
      await captureError(err, {
        context: 'fedegolf/sync-indice',
        userId: user.id,
        level: 'warning',
        meta: { paso: 'login_fedegolf', accion: 'vinculacion_desactivada' },
      })
      // Marcar como inactivo si las credenciales ya no funcionan
      await supabase
        .from('fedegolf_credentials')
        .update({ activo: false })
        .eq('user_id', user.id)

      return NextResponse.json(
        { error: 'Las credenciales de FedeGolf ya no son válidas. Revincula tu cuenta.' },
        { status: 401 }
      )
    }

    // Obtener índice actual
    const resultado = await fedegolfGetIndice(session, rut)
    const nuevoIndice = resultado.indice
    const indiceAnterior = creds.ultimo_indice
    const cambio = nuevoIndice !== indiceAnterior

    // Actualizar credenciales con último sync e índice
    const { error: updateError } = await supabase
      .from('fedegolf_credentials')
      .update({
        ultimo_sync: new Date().toISOString(),
        ultimo_indice: nuevoIndice,
      })
      .eq('user_id', user.id)

    if (updateError) {
      await captureError(updateError, {
        context: 'fedegolf/sync-indice',
        userId: user.id,
        meta: { paso: 'update_credenciales' },
      })
    }

    // Actualizar perfil
    if (nuevoIndice !== null) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ indice: nuevoIndice })
        .eq('id', user.id)

      if (profileError) {
        await captureError(profileError, {
          context: 'fedegolf/sync-indice',
          userId: user.id,
          meta: { paso: 'update_perfil', indice: nuevoIndice },
        })
      }
    }

    // Si cambió el índice, registrar en historial
    if (cambio && nuevoIndice !== null) {
      const { error: historialError } = await supabase
        .from('indice_historial')
        .insert({
          user_id: user.id,
          indice: nuevoIndice,
          fuente: 'fedegolf_sync',
        })

      if (historialError) {
        await captureError(historialError, {
          context: 'fedegolf/sync-indice',
          userId: user.id,
          meta: { paso: 'insert_historial', indice: nuevoIndice, anterior: indiceAnterior },
        })
      }
    }

    return NextResponse.json({
      ok: true,
      indice: nuevoIndice,
      // El anterior viaja para que el cliente pueda AVISARLE al usuario el cambio
      // concreto ("9.1 → 9.3") en vez de solo saber que hubo uno. Sin esto, el
      // dato existía en el server y se perdía en el camino.
      indice_anterior: cambio ? indiceAnterior : null,
      cambio,
      cached: false,
    })
  } catch (err) {
    await captureError(err, { context: 'fedegolf/sync-indice' })
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
