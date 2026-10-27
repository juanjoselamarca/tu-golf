import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { gwiDeRondaLibre } from '@/lib/data/gwi-ronda-libre'
import { indicesDePerfil } from '@/lib/data/indices-de-perfil'
import { captureError } from '@/lib/error-tracking'
import { HEADERS_PRIVADO_NO_STORE } from '@/lib/api-response'

// force-dynamic necesario porque createClient() usa cookies().
export const dynamic = 'force-dynamic'

// La respuesta depende de quién pregunta (participante vs espectador): NUNCA en
// el CDN. Igual, el GWI se calcula aquí y al cliente sólo viaja el resultado
// público (`GWIResponse`): historial y patrones de cada jugador no salen del server.
const PRIVADO = HEADERS_PRIVADO_NO_STORE

export async function GET(_req: Request, props: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await props.params
  try {
    const supabase = await createClient()
    // Quien pregunta (anónimo = null): decide qué filas ve completas (la suya)
    // y cuáles enmascaradas (máscara por visor, `publicarResultadoGWI`).
    const { data: { user } } = await supabase.auth.getUser()
    // Índices de perfil con el lector de servicio (#511): con el cliente del request,
    // un anónimo leía 0 filas de `profiles` y el GWI modelaba a esos jugadores con 0.
    const gwi = await gwiDeRondaLibre(supabase, codigo, user?.id ?? null, indicesDePerfil)
    if (!gwi) return NextResponse.json({ error: 'No encontrado' }, { status: 404, headers: PRIVADO })
    return NextResponse.json(gwi, { headers: PRIVADO })
  } catch (err) {
    void captureError(err, { context: 'api.gwi.ronda-libre', meta: { codigo } })
    return NextResponse.json({ error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500, headers: PRIVADO })
  }
}
