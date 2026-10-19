/**
 * Sync del índice oficial de UN usuario contra fedegolf.cl. Lo usan la ruta
 * /api/fedegolf/sync-indice (al abrir la app / botón "Actualizar") y el cron
 * diario /api/cron/fedegolf-indices: una sola lógica de comparar y persistir.
 *
 * El índice es PÚBLICO por RUT (get_indice_rut no necesita sesión, verificado
 * 19-oct-2026): acá no hay login ni se descifra la clave. Por eso un cambio de
 * clave en fedegolf.cl (activo=false) NO frena el índice — solo las tarjetas,
 * que sí necesitan la clave (sync-tarjetas detecta y marca ese caso).
 *
 * FedeGolf caído, lento o respondiendo raro → 'degradado': se devuelve el último
 * índice conocido, no se persiste nada y se reintenta más tarde.
 */
import type { FedegolfIndice } from './types'
import { esFedegolfError, type FedegolfErrorKind } from './http'
import { SYNC_INDICE_COOLDOWN_MS } from './sync-cooldown'

/** Respuesta canónica de "sin cuenta vinculada" (la ruta la emite, useFedegolfRefresh la reconoce). */
export const MENSAJE_NO_VINCULADO = 'No hay cuenta FedeGolf vinculada'

export interface CredencialesFedegolf {
  rut_encrypted: string
  /** false = FedeGolf rechazó la clave guardada: hay que reconectar para ver tarjetas. */
  activo: boolean
  ultimo_sync: string | null
  ultimo_indice: number | null
}

export interface DepsSyncIndice {
  leerCredenciales: () => Promise<CredencialesFedegolf | null>
  /**
   * Freno de reintentos contra fedegolf.cl. Un `degradado` no sella el cooldown
   * (no hubo sync real), así que sin esto un corte de FedeGolf haría que cada
   * usuario vinculado le pegue en cada navegación.
   */
  puedeConsultarFedegolf: () => boolean
  decrypt: (valor: string) => string
  getIndice: (rut: string) => Promise<FedegolfIndice>
  /**
   * Compare-and-set: persiste ultimo_sync/ultimo_indice (y profiles.indice) SOLO
   * si `ultimo_indice` sigue siendo `anterior`. Devuelve si escribió. Así el cron
   * y el usuario sincronizando a la vez no registran el mismo cambio dos veces.
   */
  guardarSync: (indice: number, anterior: number | null) => Promise<boolean>
  /** Inserta el índice nuevo en indice_historial. */
  registrarIndice: (indice: number) => Promise<void>
  reportar: (err: unknown, paso: string) => void
  ahora: () => number
}

export interface OpcionesSyncIndice {
  /** El cron: ignora el cooldown de 24 h y el freno de reintentos. */
  forzar?: boolean
}

type ConVinculo = { reconectar: boolean }

export type ResultadoSyncIndice =
  | { estado: 'no_vinculado' }
  | ({ estado: 'cacheado'; indice: number | null } & ConVinculo)
  | ({ estado: 'degradado'; indice: number | null; motivo: FedegolfErrorKind | 'credenciales_almacenadas' } & ConVinculo)
  | ({ estado: 'sincronizado'; indice: number; indiceAnterior: number | null; cambio: boolean } & ConVinculo)

/**
 * ¿`nuevo` es un índice distinto del último conocido? Predicado ÚNICO de "cambió
 * el índice" (sync, cron y vincular): decide si se registra historial y se avisa.
 */
export function esCambioDeIndice(nuevo: number | null, anterior: number | null): nuevo is number {
  return nuevo !== null && nuevo !== anterior
}

function motivoDe(err: unknown): FedegolfErrorKind {
  return esFedegolfError(err) ? err.kind : 'respuesta_inesperada'
}

export async function sincronizarIndice(
  deps: DepsSyncIndice,
  { forzar = false }: OpcionesSyncIndice = {},
): Promise<ResultadoSyncIndice> {
  const creds = await deps.leerCredenciales()
  if (!creds) return { estado: 'no_vinculado' }

  const reconectar = !creds.activo
  const cacheado = creds.ultimo_indice
  if (!forzar) {
    if (creds.ultimo_sync && deps.ahora() - new Date(creds.ultimo_sync).getTime() < SYNC_INDICE_COOLDOWN_MS) {
      return { estado: 'cacheado', indice: cacheado, reconectar }
    }
    // Freno activo = FedeGolf falló hace poco: es degradado, no "ya está actualizado".
    if (!deps.puedeConsultarFedegolf()) {
      return { estado: 'degradado', indice: cacheado, motivo: 'no_disponible', reconectar }
    }
  }

  let rut: string
  try {
    rut = deps.decrypt(creds.rut_encrypted)
  } catch (err) {
    deps.reportar(err, 'decrypt_credenciales')
    return { estado: 'degradado', indice: cacheado, motivo: 'credenciales_almacenadas', reconectar }
  }

  let indice: number | null
  try {
    indice = (await deps.getIndice(rut)).indice
  } catch (err) {
    deps.reportar(err, 'get_indice')
    return { estado: 'degradado', indice: cacheado, motivo: motivoDe(err), reconectar }
  }

  // Sin índice legible no se persiste nada: ni se pisa el último índice conocido
  // con null ni se sella el cooldown de 24 h. Se reintenta con el freno.
  if (indice === null) {
    deps.reportar(new Error('fedegolf(respuesta_inesperada): get_indice_rut sin índice'), 'get_indice_vacio')
    return { estado: 'degradado', indice: cacheado, motivo: 'respuesta_inesperada', reconectar }
  }

  const escribio = await deps.guardarSync(indice, cacheado)
  // Si otro proceso ya lo escribió (carrera cron/usuario), el cambio es suyo:
  // acá no se registra ni se avisa de nuevo.
  const cambio = escribio && esCambioDeIndice(indice, cacheado)
  if (cambio) await deps.registrarIndice(indice)
  return { estado: 'sincronizado', indice, indiceAnterior: cacheado, cambio, reconectar }
}
