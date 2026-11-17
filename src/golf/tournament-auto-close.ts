/**
 * Cierre automático de torneos — motor PURO (sin base, sin red). Decide qué hacer con un torneo que el
 * organizador no cerró; el cron (PR2) solo ejecuta la decisión y el cierre real es siempre `closeTournament`.
 *
 * Tiempos (torneo del sábado, GRACE_DIAS_TORNEO = 2): el lunes (día de cierre − 1) se avisa "se cierra mañana";
 * desde el martes (`diaDeCierreDelTorneo`, la misma fuente con que `estadoDelTorneo` ya lo muestra finalizado)
 * se cierra, si el aviso tiene al menos HORAS_MINIMAS_DE_AVISO y nadie anotó en HORAS_SIN_ANOTAR_PARA_CERRAR.
 * Todo con "≥": si el cron falla un día, el siguiente avisa y el subsiguiente cierra. NUNCA se cierra sin aviso.
 *
 * Reglas, en orden:
 *  1. No acepta scores (open, draft, cerrado…), demo, excluido (`cierre_automatico = false`) o sin fecha → nada.
 *  2. Hoy (Chile) antes del día de aviso → nada.
 *  3. Alguien anotó en las últimas 24 h (o la fecha de la anotación es futura o ilegible) → aplazar.
 *  4. Aviso no vigente: nunca se envió, o se envió antes del día de aviso actual (la fecha se movió al futuro
 *     después de avisar) → avisar, aunque ya sea el día de cierre.
 *  5. Día de cierre o después y aviso con ≥ 20 h → cerrar.
 *  6. Si no → esperar el aviso.
 */
import { diaDeCierreDelTorneo, diasHastaFecha, fechaHoyChile, sumarDias, type TorneoConFechas } from './tournament-live-status'
import { torneoAceptaScores } from './tournament-status'

export const DIAS_AVISO_ANTES_DEL_CIERRE = 1
export const HORAS_MINIMAS_DE_AVISO = 20
export const HORAS_SIN_ANOTAR_PARA_CERRAR = 24

export type DecisionDeCierre = 'nada' | 'avisar' | 'esperar_aviso' | 'aplazar_por_actividad' | 'cerrar'

export type TorneoParaCierre = TorneoConFechas & {
  aviso_cierre_enviado_at: string | null
  cierre_automatico: boolean
  es_demo?: boolean | null
}

const HORA_MS = 3_600_000

/** Día de cierre si el torneo se cierra solo; null si no aplica (regla 1). */
function diaDeCierreSiAplica(t: TorneoParaCierre): string | null {
  if (!torneoAceptaScores(t.status) || t.es_demo || !t.cierre_automatico) return null
  return diaDeCierreDelTorneo(t)
}

/**
 * Qué hacer hoy con el torneo. `ultimaAnotacion` = el golpe más reciente del torneo (individual o de equipos,
 * ISO); null si nadie anotó nunca.
 */
export function decisionDeCierre(t: TorneoParaCierre, ultimaAnotacion: string | null, ahora: Date): DecisionDeCierre {
  const diaDeCierre = diaDeCierreSiAplica(t)
  if (!diaDeCierre) return 'nada'

  const hoy = fechaHoyChile(ahora)
  const diaDeAviso = sumarDias(diaDeCierre, -DIAS_AVISO_ANTES_DEL_CIERRE)
  if (hoy < diaDeAviso) return 'nada'

  if (ultimaAnotacion !== null) {
    const desdeAnotacion = ahora.getTime() - Date.parse(ultimaAnotacion)
    // NaN (ilegible) o negativo (futura) caen acá: ante la duda no se cierra.
    if (!(desdeAnotacion >= HORAS_SIN_ANOTAR_PARA_CERRAR * HORA_MS)) return 'aplazar_por_actividad'
  }

  const avisoMs = t.aviso_cierre_enviado_at ? Date.parse(t.aviso_cierre_enviado_at) : NaN
  if (Number.isNaN(avisoMs) || fechaHoyChile(new Date(avisoMs)) < diaDeAviso) return 'avisar'

  if (hoy >= diaDeCierre && ahora.getTime() - avisoMs >= HORAS_MINIMAS_DE_AVISO * HORA_MS) return 'cerrar'
  return 'esperar_aviso'
}

/**
 * Cuándo se cerraría solo, para mostrarlo ("Se cierra solo mañana"). `diasFaltan` en días de Chile (0 = hoy,
 * negativo = ya pasó el día y espera el aviso o una pausa por actividad). null si el torneo no se cierra solo.
 */
export function cierrePrevisto(t: TorneoParaCierre, ahora: Date): { dia: string; diasFaltan: number } | null {
  const dia = diaDeCierreSiAplica(t)
  if (!dia) return null
  return { dia, diasFaltan: diasHastaFecha(dia, ahora) ?? 0 }
}
