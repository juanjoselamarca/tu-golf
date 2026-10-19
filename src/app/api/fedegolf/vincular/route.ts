import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfLogin, fedegolfGetIndice, fedegolfGetUsuario } from '@/lib/fedegolf/client'
import { encrypt } from '@/lib/fedegolf/crypto'
import { vincularFedegolf } from '@/lib/fedegolf/vincular'
import { persistenciaIndice } from '@/lib/fedegolf/persistencia-indice'
import { captureError } from '@/lib/error-tracking'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ─── POST: Vincular cuenta FedeGolf ──────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 })
    }

    // Rate limit: 5 intentos por hora (previene brute-force de credenciales FedeGolf)
    const rl = checkRateLimit(`fedegolf-vincular:${user.id}`, 5, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos de vinculación. Intenta de nuevo más tarde.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const body = await request.json()
    const { rut, password } = body as { rut?: string; password?: string }

    if (!rut || !password || typeof rut !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'RUT y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Validar formato RUT chileno (1-8 dígitos, guión, dígito verificador o K)
    const RUT_RE = /^\d{1,8}-[\dkK]$/
    if (!RUT_RE.test(rut) || password.length > 128) {
      return NextResponse.json(
        { error: 'RUT o contraseña con formato inválido' },
        { status: 400 }
      )
    }

    // captureError se espera antes de responder (Vercel congela la función al salir).
    const reportes: Promise<unknown>[] = []
    const reportar = (err: unknown, paso: string) => {
      reportes.push(captureError(err, {
        context: 'fedegolf/vincular',
        userId: user.id,
        level: paso === 'upsert_credenciales' ? 'error' : 'warning',
        meta: { paso },
      }))
    }

    const resultado = await vincularFedegolf(
      {
        ...persistenciaIndice(supabase, user.id, reportar),
        login: fedegolfLogin,
        getIndice: fedegolfGetIndice,
        getUsuario: fedegolfGetUsuario,
        encrypt,
        reportar,
        guardarCredenciales: async (fila) => {
          const { error } = await supabase
            .from('fedegolf_credentials')
            .upsert({ user_id: user.id, ...fila, activo: true, ultimo_sync: null }, { onConflict: 'user_id' })
          if (error) reportar(error, 'upsert_credenciales')
          return !error
        },
        // fill-if-null con service role: el rol autenticado no tiene SELECT sobre
        // profiles y el filtro `.is(col, null)` necesita leer la columna. Solo toca
        // la fila del propio usuario (user.id de getUser).
        completarPerfil: async ({ genero, fechaNacimiento }) => {
          const admin = createAdminClient()
          if (genero) {
            const { error } = await admin
              .from('profiles').update({ genero }).eq('id', user.id).is('genero', null)
            if (error) reportar(error, 'fill_genero')
          }
          if (fechaNacimiento) {
            const { error } = await admin
              .from('profiles').update({ fecha_nacimiento: fechaNacimiento }).eq('id', user.id).is('fecha_nacimiento', null)
            if (error) reportar(error, 'fill_nacimiento')
          }
        },
      },
      { rut, password },
    )
    await Promise.allSettled(reportes)

    switch (resultado.estado) {
      case 'credenciales_invalidas':
        // useFedegolfVincular muestra copy propio para el 400.
        return NextResponse.json({ error: 'RUT o clave incorrectos en FedeGolf' }, { status: 400 })
      case 'fedegolf_no_disponible':
        return NextResponse.json(
          { error: 'FedeGolf no está respondiendo. Intenta de nuevo en unos minutos.' },
          { status: 503 },
        )
      case 'error_guardado':
        return NextResponse.json({ error: 'Error guardando credenciales' }, { status: 500 })
      case 'vinculado':
        return NextResponse.json({
          ok: true,
          indice: resultado.indice,
          nombre: resultado.nombre,
          genero: resultado.genero,
        })
    }
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

    // Rate limit: compartido con POST (previene toggle rápido vincular/desvincular)
    const rl = checkRateLimit(`fedegolf-vincular:${user.id}`, 5, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo más tarde.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
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
