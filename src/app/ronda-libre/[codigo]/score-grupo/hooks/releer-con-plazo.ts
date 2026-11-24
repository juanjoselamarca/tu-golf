import { addToast } from '@/hooks/useToast'
import { MENSAJE_EQUIPOS_TARDAN } from '@/lib/data/ronda-libre-anotador'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'
import { conTimeout, TiempoAgotadoError } from '@/lib/red/con-timeout'

/**
 * FUENTE ÚNICA de «releer quién anota qué, con plazo» en el scorer de grupo: tras reclamar, liberar o dejar un equipo
 * (`useAnotadorDeEquipo`) y cuando Finalizar encuentra que los equipos cambiaron (`useFinalizeGrupo`).
 *
 * Espera a lo más `PLAZO_CARGA_SCORER_MS`: quien llama tiene la tarjeta congelada (`enCurso`, `finalizing`) mientras
 * espera, y una relectura colgada (mala señal) la dejaba congelada hasta recargar. Si vence, la lectura sigue en
 * segundo plano y pone la lista al día cuando termine, y se avisa (`MENSAJE_EQUIPOS_TARDAN`): sin aviso, la lista
 * vieja parecía la respuesta. `avisarDemora: false` cuando ya se mostró un mensaje de error, para no apilar otro.
 * Un error que no es el plazo se propaga.
 */
export async function releerConPlazo(
  recargar: () => Promise<void>,
  { avisarDemora = true }: { avisarDemora?: boolean } = {},
): Promise<void> {
  try {
    await conTimeout(recargar(), PLAZO_CARGA_SCORER_MS)
  } catch (e) {
    if (!(e instanceof TiempoAgotadoError)) throw e
    if (avisarDemora) addToast({ type: 'info', title: MENSAJE_EQUIPOS_TARDAN, duration: 5000 })
  }
}
