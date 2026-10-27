// Gate de plan sobre el MODO de scoring (gross / neto) de una ronda o torneo.
//
// FUENTE ÚNICA de la regla de producto (decisión de Juanjo, PM):
//   - Gross se juega en cualquier formato y con cualquier plan.
//   - Neto de Match Play, Best Ball y Stableford es del plan Pro
//     (`NETO_FEATURE_BY_FORMAT`): quality gate, el neto de esos formatos
//     depende del stroke index de la cancha.
//
// La usan el cliente (asistente de ronda libre, wizard del organizador) para
// no dejar nunca un valor bloqueado seleccionado, y el servidor
// (`checkModoAccess`) en TODO camino que crea una ronda o un torneo. No hay
// formato que "se juegue solo neto": Match Play gross existe y es free.

import { NETO_FEATURE_BY_FORMAT, type NetoFeature } from './plans'

export type ModoDeScoring = 'gross' | 'neto'

/** Feature Pro que exige jugar `formato` en `modo`. `null` = libre para todos. */
export function featureDelModo(formato: string, modo: string): NetoFeature | null {
  if (modo !== 'neto') return null
  // hasOwn y no `[formato]` a secas: 'toString' o 'constructor' devolverían
  // una función del prototipo y se tratarían como feature.
  if (!Object.prototype.hasOwnProperty.call(NETO_FEATURE_BY_FORMAT, formato)) return null
  return NETO_FEATURE_BY_FORMAT[formato] ?? null
}

/**
 * Modo que el plan deja jugar. Si el neto del formato está bloqueado, gross:
 * gross nunca se bloquea, así que siempre hay un modo válido que mostrar
 * activo y que mandar al servidor.
 *
 * `puedeUsar` responde si el usuario tiene la feature. El caller decide qué
 * hacer mientras el plan carga (el cliente no bloquea hasta saber: el
 * servidor es la autoridad).
 */
export function modoPermitidoPorPlan(
  formato: string,
  modo: ModoDeScoring,
  puedeUsar: (feature: NetoFeature) => boolean,
): ModoDeScoring {
  const feature = featureDelModo(formato, modo)
  if (feature && !puedeUsar(feature)) return 'gross'
  return modo
}

/** ¿El botón "Neto" de este formato está bloqueado por plan? */
export function netoBloqueadoPorPlan(
  formato: string,
  puedeUsar: (feature: NetoFeature) => boolean,
): boolean {
  return modoPermitidoPorPlan(formato, 'neto', puedeUsar) !== 'neto'
}

/** Copy del rechazo (cliente y servidor muestran el mismo). Español chileno, tú. */
export const MENSAJE_NETO_PRO =
  'El modo Neto de este formato es del plan Pro. Cámbialo a Gross o revisa los planes.'

/** Copy del 403 de una función Pro (cupo, admins, asistente…) cuando la ruta no trae uno propio. */
export const MENSAJE_FUNCION_PRO =
  'Esta función es del plan Pro. Revisa los planes para activarla.'

/** Copy del 503 cuando el servidor no pudo leer el plan (reintentable). */
export const MENSAJE_PLAN_NO_VERIFICADO =
  'No pudimos verificar tu plan. Intenta de nuevo en unos segundos.'

/** Copy del 503 cuando el plan que no se pudo leer es el del organizador (invitados). */
export const MENSAJE_PLAN_ORGANIZADOR_NO_VERIFICADO =
  'No pudimos verificar el plan del organizador. Intenta de nuevo en unos segundos.'
