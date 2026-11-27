/**
 * Aviso «Vincula tu FedeGolf» al abrir la app: una sola vez por usuario. Reglas puras (sin red).
 *
 * Dónde se guarda que ya se mostró: en `user_metadata` de Supabase Auth (clave
 * `AVISO_VINCULAR_FEDEGOLF_VISTO`), sin migración y válido en todos los dispositivos del usuario.
 * Es una preferencia de UI, no de seguridad: que el usuario pueda editarla no abre nada.
 * Además se recuerda en el dispositivo (localStorage) para no preguntar al server mientras la
 * sesión del cliente todavía no trae el `user_metadata` nuevo.
 */
import { storagePorDefecto } from '@/lib/fedegolf/vinculo-local'

export const AVISO_VINCULAR_FEDEGOLF_VISTO = 'aviso_vincular_fedegolf_visto_at'

export interface SenalesAvisoVincular {
  /** Ya se le mostró (o lo descartó) en cualquier dispositivo. */
  yaVisto: boolean
  /** Tiene fila en fedegolf_credentials (vinculado, o con la clave por reconectar). `null` = no se pudo leer. */
  tieneVinculo: boolean | null
  /** Juega o anota una ronda en curso (libre o de torneo). `null` = no se pudo leer. */
  enRonda: boolean | null
}

/**
 * Fail-closed: ante cualquier duda (`null`), NO se muestra. Mostrarlo de más molesta; no mostrarlo
 * una vez no cuesta nada (se vuelve a evaluar en la próxima apertura). Quien tiene la clave por
 * reconectar tampoco lo recibe: ya vinculó, y /perfil le pide reconectar con su propio copy.
 */
export function debeMostrarAvisoVincular(s: SenalesAvisoVincular): boolean {
  return !s.yaVisto && s.tieneVinculo === false && s.enRonda === false
}

export function avisoVincularYaVisto(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return Boolean(user?.user_metadata?.[AVISO_VINCULAR_FEDEGOLF_VISTO])
}

const clave = (userId: string) => `gp:fedegolf-aviso-vincular-visto:${userId}`

export function recordarAvisoVincularVisto(userId: string, s = storagePorDefecto()): void {
  try {
    s?.setItem(clave(userId), '1')
  } catch {
    // storage bloqueado: el server (user_metadata) igual lo sabe
  }
}

export function avisoVincularVistoEnDispositivo(userId: string, s = storagePorDefecto()): boolean {
  try {
    return s?.getItem(clave(userId)) === '1'
  } catch {
    return false
  }
}
