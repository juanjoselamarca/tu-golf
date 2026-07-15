import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfLogin, fedegolfGetIndice } from '@/lib/fedegolf/client'
import { encrypt } from '@/lib/fedegolf/crypto'
import { captureError } from '@/lib/error-tracking'
import { createAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

// ─── POST: Vincular cuenta FedeGolf ──────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    const body = await request.json()
    const { rut, password } = body as { rut?: string; password?: string }

    if (!rut || !password) {
      return NextResponse.json(
        { error: 'RUT y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Intentar login en fedegolf.cl
    let session
    try {
      session = await fedegolfLogin(rut, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de autenticación'
      return NextResponse.json(
        { error: `No se pudo vincular: ${message}` },
        { status: 400 }
      )
    }

    // Obtener índice actual
    let indice: number | null = null
    let nombre = ''
    try {
      const resultado = await fedegolfGetIndice(session, rut)
      indice = resultado.indice
    } catch {
      // Índice no disponible, continuar sin él
    }

    // Encriptar credenciales
    const rutEncriptado = encrypt(rut)
    const passwordEncriptado = encrypt(password)

    // Upsert en fedegolf_credentials
    const { error: upsertError } = await supabase
      .from('fedegolf_credentials')
      .upsert(
        {
          user_id: user.id,
          rut_encrypted: rutEncriptado,
          password_encrypted: passwordEncriptado,
          activo: true,
          ultimo_indice: indice,
          ultimo_sync: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      await captureError(upsertError, { context: 'fedegolf/vincular:upsert-credentials', userId: user.id })
      return NextResponse.json(
        { error: 'Error guardando credenciales' },
        { status: 500 }
      )
    }

    // Autocompletar el perfil desde FedeGolf (fuente oficial federada).
    //  - índice: siempre que lo tengamos (cliente autenticado, update incondicional).
    //  - genero: fill-if-null — se guarda SOLO si el usuario aún no lo tiene, para no
    //    pisar su elección. Va en la convención 'M'|'F' que consume el cálculo de
    //    CR/slope por tee (ver DefaultTeeBanner). Se hace con el service-role client
    //    porque el rol autenticado no tiene SELECT sobre `profiles` en este contexto
    //    y el update condicional `.is('genero', null)` necesita leer la columna para
    //    evaluar el filtro. Solo toca la propia fila del usuario (user.id de getUser).
    //  - name: NO se autocompleta — la columna es NOT NULL (nunca está vacía).
    const perfil = session.perfil
    if (perfil?.nombreCompleto) nombre = perfil.nombreCompleto

    if (indice !== null) {
      const { error } = await supabase.from('profiles').update({ indice }).eq('id', user.id)
      if (error) await captureError(error, { context: 'fedegolf/vincular:update-indice', userId: user.id })
    }
    if (perfil?.genero) {
      const admin = createAdminClient()
      const { error } = await admin
        .from('profiles').update({ genero: perfil.genero }).eq('id', user.id).is('genero', null)
      if (error) await captureError(error, { context: 'fedegolf/vincular:fill-genero', userId: user.id })
    }

    // Registrar el índice en el historial solo si vino uno nuevo
    if (indice !== null) {
      const { error: historialError } = await supabase
        .from('indice_historial')
        .insert({
          user_id: user.id,
          indice,
          fuente: 'fedegolf_sync',
        })

      if (historialError) {
        await captureError(historialError, { context: 'fedegolf/vincular:historial', userId: user.id })
      }
    }

    return NextResponse.json({
      ok: true,
      indice,
      nombre,
      genero: perfil?.genero ?? null,
    })
  } catch (err) {
    await captureError(err, { context: 'fedegolf/vincular:POST' })
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// ─── DELETE: Desvincular cuenta FedeGolf ─────────────────────────────

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    const { error } = await supabase
      .from('fedegolf_credentials')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      await captureError(error, { context: 'fedegolf/vincular:DELETE', userId: user.id })
      return NextResponse.json(
        { error: 'Error al desvincular cuenta' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    await captureError(err, { context: 'fedegolf/vincular:DELETE' })
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
