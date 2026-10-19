import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { esCronAutorizado } from '@/lib/secrets'
import { fedegolfGetIndice } from '@/lib/fedegolf/client'
import { decrypt } from '@/lib/fedegolf/crypto'
import { esFedegolfError } from '@/lib/fedegolf/http'
import { sincronizarIndice } from '@/lib/fedegolf/sincronizar-indice'
import { persistenciaIndice } from '@/lib/fedegolf/persistencia-indice'
import { correrCronIndices, type FilaCron } from '@/lib/fedegolf/cron-indices'
import { ventanaActiva } from '../../../../../scripts/ci/evento-en-vivo.mjs'
import eventosEnVivo from '../../../../../config/eventos-en-vivo.json'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Cron diario (vercel.json, 09:00 UTC = 06:00 Chile): índice oficial de todos los
// vinculados. La lógica vive en src/lib/fedegolf/cron-indices.ts.

// Bajo el db-max-rows de PostgREST (1.000): si coincidieran, una página recortada
// se confundiría con la última y el resto de los vinculados nunca se sincronizaría.
const PAGINA = 500

// El cron corre todos los días: un RUT que FedeGolf ya no reconoce (400) se
// reportaría a diario como warning y taparía señales reales. Va como info; una
// clave de cifrado rota sí es error (afecta a todos y hay que verlo).
function nivelDeReporte(err: unknown, paso: string): 'error' | 'warning' | 'info' {
  if (paso === 'decrypt_credenciales') return 'error'
  if (paso === 'get_indice' && esFedegolfError(err, 'respuesta_inesperada')) return 'info'
  return 'warning'
}

export async function GET(request: NextRequest) {
  if (!esCronAutorizado(request.headers.get('Authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 401 })
  }

  // Evento en vivo = prod congelada (CLAUDE.md regla 6): no se le suma carga a la
  // base mientras hay gente jugando un torneo agendado. Mañana corre de nuevo.
  const evento = ventanaActiva(eventosEnVivo.ventanas, Date.now())
  if (evento) return NextResponse.json({ omitido: 'evento_en_vivo', motivo: evento.motivo ?? null })

  const admin = createAdminClient()
  const reportes: Promise<unknown>[] = []

  try {
    const resumen = await correrCronIndices({
      // PostgREST corta filas sin avisar: keyset por id.
      listarVinculados: async () => {
        const filas: FilaCron[] = []
        let desde: string | null = null
        for (;;) {
          let q = admin.from('fedegolf_credentials').select('id, user_id, ultimo_sync').order('id').limit(PAGINA)
          if (desde) q = q.gt('id', desde)
          const { data, error } = await q
          if (error) throw error
          filas.push(...(data as FilaCron[]))
          if (!data || data.length < PAGINA) return filas
          desde = (data[data.length - 1] as FilaCron).id
        }
      },
      sincronizarUsuario: (userId) => {
        const reportar = (err: unknown, paso: string) => {
          reportes.push(captureError(err, {
            context: 'cron/fedegolf-indices',
            userId,
            level: nivelDeReporte(err, paso),
            meta: { paso },
          }))
        }
        return sincronizarIndice(
          {
            ...persistenciaIndice(admin, userId, reportar),
            puedeConsultarFedegolf: () => true,
            decrypt,
            getIndice: fedegolfGetIndice,
            reportar,
            ahora: () => Date.now(),
          },
          { forzar: true },
        )
      },
      reportar: (err, userId) => {
        reportes.push(captureError(err, { context: 'cron/fedegolf-indices', userId, meta: { paso: 'usuario' } }))
      },
      ahora: () => Date.now(),
    })

    await Promise.allSettled(reportes)
    return NextResponse.json(resumen)
  } catch (err) {
    await Promise.allSettled(reportes)
    await captureError(err, { context: 'cron/fedegolf-indices' })
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
