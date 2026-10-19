/**
 * Vincular la cuenta FedeGolf de un usuario: valida la clave contra fedegolf.cl,
 * guarda las credenciales cifradas, trae el índice oficial y completa el perfil.
 * La ruta /api/fedegolf/vincular solo cablea Supabase y traduce a HTTP.
 *
 * El índice se persiste por el MISMO compare-and-set que el sync y el cron
 * (`guardarSync`), así re-vincular con el mismo índice no duplica historial ni
 * dispara un aviso falso de "tu índice cambió".
 */
import type { FedegolfIndice, FedegolfPerfil, FedegolfSession } from './types'
import { esFedegolfError } from './http'
import { esCambioDeIndice, type DepsSyncIndice } from './sincronizar-indice'

export interface DepsVincular extends Pick<DepsSyncIndice, 'leerCredenciales' | 'guardarSync' | 'registrarIndice' | 'reportar'> {
  login: (rut: string, password: string) => Promise<FedegolfSession>
  getIndice: (rut: string) => Promise<FedegolfIndice>
  getUsuario: (session: FedegolfSession, rut: string) => Promise<FedegolfPerfil>
  encrypt: (valor: string) => string
  /**
   * Upsert de la fila con activo=true, ultimo_sync=null y ultimo_sync_tarjetas=null
   * (reconectar trae las tarjetas al tiro, no 24 h después de detectar la clave
   * rota). NO toca ultimo_indice: lo escribe después `guardarSync` (re-vincular
   * sin índice no pisa el último).
   */
  guardarCredenciales: (fila: { rut_encrypted: string; password_encrypted: string }) => Promise<boolean>
  /** fill-if-null de genero/fecha_nacimiento (nunca pisa lo que el usuario eligió). */
  completarPerfil: (datos: { genero: 'M' | 'F' | null; fechaNacimiento: string | null }) => Promise<void>
}

export type ResultadoVincular =
  | { estado: 'credenciales_invalidas' }
  | { estado: 'fedegolf_no_disponible' }
  | { estado: 'error_guardado' }
  | { estado: 'vinculado'; indice: number | null; nombre: string; genero: 'M' | 'F' | null }

export async function vincularFedegolf(
  deps: DepsVincular,
  { rut, password }: { rut: string; password: string },
): Promise<ResultadoVincular> {
  let session: FedegolfSession
  try {
    session = await deps.login(rut, password)
  } catch (err) {
    // Solo un rechazo de la clave es culpa del usuario; caído/lento → 503.
    if (esFedegolfError(err, 'credenciales')) return { estado: 'credenciales_invalidas' }
    deps.reportar(err, 'login_fedegolf')
    return { estado: 'fedegolf_no_disponible' }
  }

  let indice: number | null = null
  try {
    indice = (await deps.getIndice(rut)).indice
  } catch (err) {
    // Se vincula igual: el próximo sync (o el cron) trae el índice.
    deps.reportar(err, 'get_indice')
  }

  // El índice previo se lee ANTES del upsert: es el "anterior" del compare-and-set.
  const previo = (await deps.leerCredenciales())?.ultimo_indice ?? null

  const guardado = await deps.guardarCredenciales({
    rut_encrypted: deps.encrypt(rut),
    password_encrypted: deps.encrypt(password),
  })
  if (!guardado) return { estado: 'error_guardado' }

  if (indice !== null) {
    const escribio = await deps.guardarSync(indice, previo)
    if (escribio && esCambioDeIndice(indice, previo)) await deps.registrarIndice(indice)
  }

  // Enriquecimiento por RUT (fuente pública verificada); best-effort.
  let fechaNacimiento: string | null = null
  try {
    fechaNacimiento = (await deps.getUsuario(session, rut)).fechaNacimiento
  } catch {
    // getUserByRut no disponible: se vincula igual sin la fecha.
  }

  // El género sale del body del login (camino verificado en prod, #266).
  const genero = session.perfil?.genero ?? null
  if (genero || fechaNacimiento) await deps.completarPerfil({ genero, fechaNacimiento })

  return { estado: 'vinculado', indice, nombre: session.perfil?.nombreCompleto ?? '', genero }
}
