/**
 * Sync de las ~20 tarjetas oficiales que componen el índice del socio. La ruta
 * /api/fedegolf/sync-tarjetas solo cablea Supabase y traduce a HTTP.
 *
 * INDEPENDIENTE del sync de índice (spec D4): cooldown propio
 * (`ultimo_sync_tarjetas`) y fail-soft — si fedegolf.cl cambia y el parseo se
 * rompe, NO tumba el índice ni la app.
 *
 * Es el ÚNICO lugar que marca `activo=false`: las tarjetas son lo único que
 * necesita la clave (el índice es público por RUT). Cuando el login de página
 * falla se confirma con UN login JSON — el único que distingue "clave rechazada"
 * de "FedeGolf caído" — antes de pedirle al usuario que reconecte.
 */
import type { FedegolfSession, FedegolfTarjeta } from './types'
import { esFedegolfError } from './http'

/** Una vez al día: es lo que tarda FedeGolf en reflejar tarjetas nuevas. */
export const SYNC_TARJETAS_COOLDOWN_MS = 24 * 60 * 60 * 1000

export interface CredencialesTarjetas {
  rut_encrypted: string
  password_encrypted: string
  activo: boolean
  ultimo_sync_tarjetas: string | null
}

export interface DepsSyncTarjetas {
  leerCredenciales: () => Promise<CredencialesTarjetas | null>
  decrypt: (valor: string) => string
  /** Se sella ANTES de pegarle a fedegolf.cl: un fallo no re-dispara logins en cada navegación. */
  sellarCooldown: () => Promise<void>
  pageLogin: (rut: string, password: string) => Promise<FedegolfSession>
  /** Login JSON: lanza FedegolfError('credenciales') solo si FedeGolf rechazó la clave. */
  verificarClave: (rut: string, password: string) => Promise<unknown>
  /**
   * activo=false SOLO si la clave guardada sigue siendo `passwordEncrypted`: si el
   * usuario re-vinculó mientras tanto, la clave nueva no se marca como rota.
   */
  marcarClaveRechazada: (passwordEncrypted: string) => Promise<void>
  getTarjetas: (session: FedegolfSession) => Promise<FedegolfTarjeta[]>
  capturar: (tarjetas: FedegolfTarjeta[]) => Promise<number>
  reportar: (err: unknown, paso: string) => void
  ahora: () => number
}

export type ResultadoSyncTarjetas =
  | { estado: 'no_vinculado' }
  | { estado: 'requiere_reconexion' }
  | { estado: 'cacheado' }
  | { estado: 'credenciales_almacenadas' }
  | { estado: 'login_fallido' }
  | { estado: 'capturadas'; total: number }

export async function sincronizarTarjetas(deps: DepsSyncTarjetas): Promise<ResultadoSyncTarjetas> {
  const creds = await deps.leerCredenciales()
  if (!creds) return { estado: 'no_vinculado' }
  // Clave rechazada antes: no se reintenta hasta que el usuario reconecte.
  if (!creds.activo) return { estado: 'requiere_reconexion' }

  if (creds.ultimo_sync_tarjetas
    && deps.ahora() - new Date(creds.ultimo_sync_tarjetas).getTime() < SYNC_TARJETAS_COOLDOWN_MS) {
    return { estado: 'cacheado' }
  }

  let rut: string
  let password: string
  try {
    rut = deps.decrypt(creds.rut_encrypted)
    password = deps.decrypt(creds.password_encrypted)
  } catch (err) {
    deps.reportar(err, 'decrypt_credenciales')
    return { estado: 'credenciales_almacenadas' }
  }

  await deps.sellarCooldown()

  // Login de página o listado fallido (una sesión de página no autenticada
  // vuelve con el formulario de login): ninguno de los dos sabe POR QUÉ falló.
  let tarjetas: FedegolfTarjeta[]
  try {
    tarjetas = await deps.getTarjetas(await deps.pageLogin(rut, password))
  } catch (errPagina) {
    try {
      await deps.verificarClave(rut, password)
    } catch (errJson) {
      if (esFedegolfError(errJson, 'credenciales')) {
        await deps.marcarClaveRechazada(creds.password_encrypted)
        return { estado: 'requiere_reconexion' }
      }
    }
    // La clave sirve (o FedeGolf está caído): el problema es la página.
    deps.reportar(errPagina, 'pagina_tarjetas')
    return { estado: 'login_fallido' }
  }

  return { estado: 'capturadas', total: await deps.capturar(tarjetas) }
}
