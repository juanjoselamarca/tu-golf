import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { gwiDeTorneo } from '@/lib/data/gwi-torneo'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// La respuesta depende de quién pregunta (participante vs espectador): NUNCA en
// el CDN. Igual, el GWI se calcula aquí y al cliente sólo viaja el resultado
// público (`GWIResponse`): historial y patrones de cada jugador no salen del server.
const PRIVADO = HEADERS_PRIVADO_NO_STORE

export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  try {
    const supabase = await createClient()
    const gwi = await gwiDeTorneo(supabase, slug)
    if (!gwi) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: PRIVADO })
    return NextResponse.json(gwi, { headers: PRIVADO })
  } catch (err) {
    void captureError(err, { context: 'api.gwi.torneo', meta: { slug } })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500, headers: PRIVADO })
  }
}
