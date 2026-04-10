import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfLogin, fedegolfGetIndice } from '@/lib/fedegolf/client'
import { encrypt } from '@/lib/fedegolf/crypto'

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
      console.error('Error guardando credenciales FedeGolf:', upsertError)
      return NextResponse.json(
        { error: 'Error guardando credenciales' },
        { status: 500 }
      )
    }

    // Actualizar índice en perfil si lo tenemos
    if (indice !== null) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ indice })
        .eq('id', user.id)

      if (profileError) {
        console.error('Error actualizando índice en perfil:', profileError)
      }

      // Registrar en historial
      const { error: historialError } = await supabase
        .from('indice_historial')
        .insert({
          user_id: user.id,
          indice,
          fuente: 'fedegolf_sync',
        })

      if (historialError) {
        console.error('Error registrando historial de índice:', historialError)
      }
    }

    return NextResponse.json({
      ok: true,
      indice,
      nombre,
    })
  } catch (err) {
    console.error('Error en POST /api/fedegolf/vincular:', err)
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
      console.error('Error desvinculando FedeGolf:', error)
      return NextResponse.json(
        { error: 'Error al desvincular cuenta' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en DELETE /api/fedegolf/vincular:', err)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
