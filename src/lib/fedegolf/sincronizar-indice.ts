/**
 * Sync del índice oficial de UN usuario contra fedegolf.cl. Vive fuera de la
 * ruta (regla "el que toca, ordena") y con dependencias inyectadas para testearlo.
 *
 * Regla central: solo un rechazo EXPLÍCITO de credenciales (FedegolfError
 * 'credenciales', que emite únicamente el login JSON ante su 400) desactiva la
 * vinculación. FedeGolf caído, lento, respondiendo raro o un problema de NUESTRA
 * clave de cifrado → 'degradado': se devuelve el último índice conocido y se
 * reintenta en la próxima visita. Antes cualquier throw desvinculaba (B1).
 */
import type { FedegolfIndice, FedegolfSession } from './types'
import { esFedegolfError, type FedegolfErrorKind } from './http'
import { SYNC_INDICE_COOLDOWN_MS } from './sync-cooldown'

export interface CredencialesFedegolf {
  rut_encrypted: string
  password_encrypted: string
  activo: boolean
  ultimo_sync: string | null
  ultimo_indice: number | null
}

export interface DepsSyncIndice {
  leerCredenciales: () => Promise<CredencialesFedegolf | null>
  decrypt: (valor: string) => string
  login: (rut: string, password: string) => Promise<FedegolfSession>
  getIndice: (session: FedegolfSession, rut: string) => Promise<FedegolfIndice>
  marcarInactiva: () => Promise<void>
  /** Persiste ultimo_sync/ultimo_indice y, si no es null, profiles.indice. */
  guardarSync: (indice: number | null) => Promise<void>
  /** Inserta el índice nuevo en indice_historial. */
  registrarIndice: (indice: number) => Promise<void>
  reportar: (err: unknown, paso: string) => void
  ahora: () => number
}

export type ResultadoSyncIndice =
  | { estado: 'no_vinculado' }
  | { estado: 'requiere_reconexion' }
  | { estado: 'cacheado'; indice: number | null }
  | { estado: 'degradado'; indice: number | null; motivo: FedegolfErrorKind | 'credenciales_almacenadas' }
  | { estado: 'sincronizado'; indice: number | null; indiceAnterior: number | null; cambio: boolean }

function motivoDe(err: unknown): FedegolfErrorKind {
  return esFedegolfError(err) ? err.kind : 'respuesta_inesperada'
}

export async function sincronizarIndice(deps: DepsSyncIndice): Promise<ResultadoSyncIndice> {
  const creds = await deps.leerCredenciales()
  if (!creds) return { estado: 'no_vinculado' }
  if (!creds.activo) return { estado: 'requiere_reconexion' }

  const cacheado = creds.ultimo_indice
  if (creds.ultimo_sync && deps.ahora() - new Date(creds.ultimo_sync).getTime() < SYNC_INDICE_COOLDOWN_MS) {
    return { estado: 'cacheado', indice: cacheado }
  }

  let rut: string
  let password: string
  try {
    rut = deps.decrypt(creds.rut_encrypted)
    password = deps.decrypt(creds.password_encrypted)
  } catch (err) {
    deps.reportar(err, 'decrypt_credenciales')
    return { estado: 'degradado', indice: cacheado, motivo: 'credenciales_almacenadas' }
  }

  let session: FedegolfSession
  try {
    session = await deps.login(rut, password)
  } catch (err) {
    if (esFedegolfError(err, 'credenciales')) {
      deps.reportar(err, 'login_credenciales_rechazadas')
      await deps.marcarInactiva()
      return { estado: 'requiere_reconexion' }
    }
    deps.reportar(err, 'login_fedegolf')
    return { estado: 'degradado', indice: cacheado, motivo: motivoDe(err) }
  }

  let indice: number | null
  try {
    indice = (await deps.getIndice(session, rut)).indice
  } catch (err) {
    deps.reportar(err, 'get_indice')
    return { estado: 'degradado', indice: cacheado, motivo: motivoDe(err) }
  }

  const cambio = indice !== cacheado
  await deps.guardarSync(indice)
  if (cambio && indice !== null) await deps.registrarIndice(indice)
  return { estado: 'sincronizado', indice, indiceAnterior: cacheado, cambio }
}
