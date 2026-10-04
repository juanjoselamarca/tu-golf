import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { gwiDeRondaLibre } from '@/lib/data/gwi-ronda-libre'
import { captureError } from '@/lib/error-tracking'

// force-dynamic necesario porque createClient() usa cookies().
export const dynamic = 'force-dynamic'

// La respuesta depende de quién pregunta (participante vs espectador): NUNCA en
// el CDN. Igual, el GWI se calcula aquí y al cliente sólo viaja el resultado
// público (`GWIResponse`): historial y patrones de cada jugador no salen del server.
const PRIVADO = { 'Cache-Control': 'private, no-store' }

export async function GET(_req: Request, props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params
  try {
    const supabase = await createClient()
    const gwi = await gwiDeRondaLibre(supabase, codigo)
    if (!gwi) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: PRIVADO })
    return NextResponse.json(gwi, { headers: PRIVADO })
  } catch (err) {
    void captureError(err, { context: 'api.gwi.ronda-libre', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500, headers: PRIVADO })
  }
}
