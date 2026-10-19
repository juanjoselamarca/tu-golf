/**
 * Memo por dispositivo del último aviso de cambio de índice ya mostrado, para que
 * FedegolfSync avise UNA vez cada cambio (lo detecte el cron, otro dispositivo o
 * este mismo). El cambio se identifica por la fecha de su fila de historial.
 * Storage no disponible → avisa (mejor un aviso repetido que ninguno).
 */
import { storagePorDefecto } from './vinculo-local'

const clave = (userId: string) => `gp:fedegolf-aviso-visto:${userId}`

export function avisoYaMostrado(userId: string, fecha: string, s = storagePorDefecto()): boolean {
  try {
    return s?.getItem(clave(userId)) === fecha
  } catch {
    return false
  }
}

export function marcarAvisoMostrado(userId: string, fecha: string, s = storagePorDefecto()): void {
  try {
    s?.setItem(clave(userId), fecha)
  } catch {
    // storage bloqueado: a lo más se repite el aviso
  }
}
