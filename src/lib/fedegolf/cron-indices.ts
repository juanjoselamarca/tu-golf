/**
 * Cron diario /api/cron/fedegolf-indices: sincroniza el índice oficial de TODOS
 * los vinculados (el índice es público por RUT, no necesita la clave), así el
 * cambio se detecta aunque el usuario no abra la app. Por cada usuario corre el
 * mismo `sincronizarIndice` que la ruta, con `forzar` (sin cooldown ni freno).
 *
 * Orden: los que llevan más tiempo sin sync primero. Si el presupuesto de tiempo
 * se acaba, los que quedaron van primeros mañana.
 */
import type { ResultadoSyncIndice } from './sincronizar-indice'

export interface FilaCron {
  id: string
  user_id: string
  ultimo_sync: string | null
}

export interface DepsCronIndices {
  listarVinculados: () => Promise<FilaCron[]>
  sincronizarUsuario: (userId: string) => Promise<ResultadoSyncIndice>
  reportar: (err: unknown, userId: string) => void
  ahora: () => number
}

export interface OpcionesCronIndices {
  concurrencia?: number
  /** Corte por tiempo (la función tiene maxDuration 300 s; se deja margen para responder). */
  presupuestoMs?: number
  /**
   * Seguidos con FedeGolf caído antes de cortar: si no responde, no tiene sentido
   * martillarlo con el resto de la lista (mañana se reintenta).
   */
  maxCaidasSeguidas?: number
}

export interface ResumenCronIndices {
  total: number
  procesados: number
  cambiados: number
  degradados: number
  fallidos: number
  pendientes: number
  cortado_por_fedegolf: boolean
}

/** ultimo_sync ASC con nunca-sincronizados primero; empate por id (orden total y estable). */
export function ordenarParaCron(filas: FilaCron[]): FilaCron[] {
  const t = (f: FilaCron) => (f.ultimo_sync === null ? -Infinity : new Date(f.ultimo_sync).getTime())
  return [...filas].sort((a, b) => t(a) - t(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export async function correrCronIndices(
  deps: DepsCronIndices,
  { concurrencia = 3, presupuestoMs = 240_000, maxCaidasSeguidas = 5 }: OpcionesCronIndices = {},
): Promise<ResumenCronIndices> {
  const cola = ordenarParaCron(await deps.listarVinculados())
  const inicio = deps.ahora()
  const resumen: ResumenCronIndices = {
    total: cola.length, procesados: 0, cambiados: 0, degradados: 0, fallidos: 0, pendientes: 0,
    cortado_por_fedegolf: false,
  }
  let siguiente = 0
  let caidasSeguidas = 0

  const puedeSeguir = () =>
    !resumen.cortado_por_fedegolf && deps.ahora() - inicio < presupuestoMs

  const trabajador = async () => {
    while (siguiente < cola.length && puedeSeguir()) {
      const { user_id } = cola[siguiente++]
      try {
        const r = await deps.sincronizarUsuario(user_id)
        resumen.procesados++
        if (r.estado === 'sincronizado' && r.cambio) resumen.cambiados++
        if (r.estado === 'degradado') {
          resumen.degradados++
          caidasSeguidas = r.motivo === 'no_disponible' ? caidasSeguidas + 1 : 0
          if (caidasSeguidas >= maxCaidasSeguidas) resumen.cortado_por_fedegolf = true
        } else {
          caidasSeguidas = 0
        }
      } catch (err) {
        // Un usuario con datos rotos no frena al resto.
        resumen.procesados++
        resumen.fallidos++
        deps.reportar(err, user_id)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrencia) }, trabajador))
  resumen.pendientes = cola.length - siguiente
  return resumen
}
