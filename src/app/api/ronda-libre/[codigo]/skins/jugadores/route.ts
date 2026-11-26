import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'
import { CODIGO_RONDA_VALIDO } from '@/lib/api-en-vivo'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { MAX_JUGADORES_POR_RONDA } from '@/golf/ronda-libre/plantilla-de-jugadores'
import { jugadorDeRondaSchema } from '@/lib/data/ronda-libre-jugadores-filas'
import { MENSAJE_SKINS_YA_EMPEZO, guardarEdicionDelSkins, leerSkinsAEditar, prepararEdicionDelSkins } from '@/lib/data/skins-editar'

// PUT /api/ronda-libre/[codigo]/skins/jugadores — el creador corrige los jugadores de su Skins ANTES del primer golpe
// (spec docs/specs/formato-skins.md, «Editar antes del primer golpe»). Lista completa en el orden final; un jugador
// que ya estaba trae su `id`. Valida y congela igual que al crear (`prepararEdicionDelSkins`) y graba todo o nada con
// `editar_jugadores_skins` (service_role), que rechaza si ya hubo un golpe.

export const dynamic = 'force-dynamic'

const PRIVADO = HEADERS_PRIVADO_NO_STORE

const MENSAJE_NO_CALZA = 'Los jugadores cambiaron mientras editabas. Cierra Editar y vuelve a abrirlo.'
const MENSAJE_SIN_GUARDAR = 'No pudimos guardar los cambios. Revisa tu señal e intenta de nuevo.'

// El cliente no manda config ni congelado: zod los descarta (los pone el servidor).
const editarSchema = z.object({
  jugadores: z.array(jugadorDeRondaSchema.extend({ id: z.string().uuid().optional() })).min(1).max(MAX_JUGADORES_POR_RONDA),
})

export async function PUT(req: Request, props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params
  if (!CODIGO_RONDA_VALIDO.test(codigo)) return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
  try {
    const supabase = await createClient()
    const { data: sesion } = await supabase.auth.getClaims()
    const userId = sesion?.claims?.sub
    if (!userId) return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401, headers: PRIVADO })

    const rl = checkRateLimit(`skins-editar:${userId}`, 20, 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429, headers: { ...PRIVADO, ...rateLimitHeaders(rl) } })
    }

    const parsed = editarSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Datos inválidos' }, { status: 400, headers: PRIVADO })
    }

    const leida = await leerSkinsAEditar(supabase, codigo)
    if (leida.status === 'not_found') return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
    if (leida.status === 'error') {
      void captureError(leida.error, { context: 'api.ronda-libre.skins-editar.leer', userId, meta: { codigo } })
      return NextResponse.json({ error: MENSAJE_SIN_GUARDAR }, { status: 503, headers: PRIVADO })
    }
    if (leida.ronda.creador_id !== userId) {
      return NextResponse.json({ error: 'Solo quien creó la ronda puede editar el Skins.' }, { status: 403, headers: PRIVADO })
    }

    const edicion = await prepararEdicionDelSkins(supabase, {
      ronda: leida.ronda, jugadoresActuales: leida.jugadores, pedido: parsed.data.jugadores, creadorId: userId,
    })
    if (!edicion.ok) return NextResponse.json({ error: edicion.error }, { status: edicion.status, headers: PRIVADO })

    const guardada = await guardarEdicionDelSkins(createAdminClient(), leida.ronda.id, edicion)
    if (guardada.ok) return NextResponse.json({ ok: true }, { headers: PRIVADO })
    switch (guardada.motivo) {
      case 'empezado': return NextResponse.json({ error: MENSAJE_SKINS_YA_EMPEZO }, { status: 409, headers: PRIVADO })
      case 'no_existe': return NextResponse.json({ error: 'No encontrada' }, { status: 404, headers: PRIVADO })
      case 'no_calza':
        void captureError(guardada.error, { context: 'api.ronda-libre.skins-editar.no-calza', userId, level: 'warning', meta: { codigo } })
        return NextResponse.json({ error: MENSAJE_NO_CALZA }, { status: 409, headers: PRIVADO })
      default:
        void captureError(guardada.error, { context: 'api.ronda-libre.skins-editar.guardar', userId, meta: { codigo } })
        return NextResponse.json({ error: MENSAJE_SIN_GUARDAR }, { status: 503, headers: PRIVADO })
    }
  } catch (err) {
    void captureError(err, { context: 'api.ronda-libre.skins-editar', meta: { codigo } })
    return NextResponse.json({ error: MENSAJE_SIN_GUARDAR }, { status: 503, headers: PRIVADO })
  }
}
