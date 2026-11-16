// ─── Retiros de Timba libre confirmados en este teléfono ─────────────────────
//
// Un retiro que el servidor ya guardó se recuerda acá hasta que llega una vista de `GET /juego` que lo trae
// (`retirosQueFaltanEnLaVista`). Así, sin señal o con la recarga caída, el scorer sigue sabiendo quién se
// retiró y no le pone par al pasar de hoyo. Se borra con la copia del grupo (`borrarCopiaDelGrupo`).

import { RETIROS_TIMBA_KEY } from './score-storage'
import type { RetirosConfirmados } from '@/golf/ronda-libre/retiros-de-la-timba'

export function leerRetirosConfirmados(codigo: string): Record<string, number | null> {
  try {
    const crudo: unknown = JSON.parse(localStorage.getItem(RETIROS_TIMBA_KEY(codigo)) ?? '{}')
    if (!crudo || typeof crudo !== 'object') return {}
    return Object.fromEntries(
      Object.entries(crudo as Record<string, unknown>).filter(([, v]) => v === null || (typeof v === 'number' && Number.isInteger(v))),
    ) as Record<string, number | null>
  } catch {
    return {}
  }
}

export function escribirRetirosConfirmados(codigo: string, retiros: RetirosConfirmados): void {
  try {
    if (Object.keys(retiros).length === 0) localStorage.removeItem(RETIROS_TIMBA_KEY(codigo))
    else localStorage.setItem(RETIROS_TIMBA_KEY(codigo), JSON.stringify(retiros))
  } catch {
    // Sin almacenamiento: queda en memoria (el hook) hasta la próxima vista.
  }
}

/** Anota un retiro (o, con `null`, que se deshizo) que el servidor acaba de confirmar. */
export function guardarRetiroConfirmado(codigo: string, jugadorId: string, desde: number | null): Record<string, number | null> {
  const siguiente = { ...leerRetirosConfirmados(codigo), [jugadorId]: desde }
  escribirRetirosConfirmados(codigo, siguiente)
  return siguiente
}
