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
  /** Push al teléfono por un cambio de índice. true = llegó a algún dispositivo. */
  avisarCambio: (userId: string, nuevo: number, anterior: number | null) => Promise<boolean>
  reportar: (err: unknown, userId: string) => void
  /** Un push que falla no es un sync fallido: se reporta aparte. */
  reportarAviso: (err: unknown, userId: string) => void
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
  /** Cambios que llegaron como push a algún dispositivo del usuario. */
  avisados: number
  degradados: number
  /** FedeGolf respondió "sin índice": respuesta válida, no cuenta como falla. */
  sin_indice: number
  fallidos: number
  pendientes: number
  cortado_por_fedegolf: boolean
}

/**
 * ¿Falló la mayoría? Entonces cambió FedeGolf (endpoint movido, WAF, formato) o
 * la red, no un RUT suelto: los reportes por usuario van como info y esto es lo
 * único que lo hace visible. Con menos de 5 procesados la proporción no dice
 * nada, así que ahí solo cuenta que respondieran mal TODOS.
 */
export function esFallaMasiva(r: ResumenCronIndices): boolean {
  const fallas = r.degradados + r.fallidos
  if (r.procesados === 0) return false
  if (r.procesados < 5) {
    // N chico: solo cuenta que TODOS respondieran mal. Todos "sin índice" exige 2+
    // (el único vinculado puede no tener índice de verdad, sin alarma diaria).
    const consultados = r.procesados - r.sin_indice
    return (consultados > 0 && fallas === consultados) || (r.procesados >= 2 && r.sin_indice === r.procesados)
  }
  // Quien vincula FedeGolf es federado: "sin índice" en masa también es FedeGolf
  // cambiando (p. ej. 100.0 para todos), así que suma con las fallas.
  return (fallas + r.sin_indice) / r.procesados >= 0.5
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
    total: cola.length, procesados: 0, cambiados: 0, avisados: 0, degradados: 0, sin_indice: 0, fallidos: 0, pendientes: 0,
    cortado_por_fedegolf: false,
  }
  let siguiente = 0
  let caidasSeguidas = 0

  const puedeSeguir = () =>
    !resumen.cortado_por_fedegolf && deps.ahora() - inicio < presupuestoMs

  const trabajador = async () => {
    while (siguiente < cola.length && puedeSeguir()) {
      const { user_id } = cola[siguiente++]
      let r: ResultadoSyncIndice
      try {
        r = await deps.sincronizarUsuario(user_id)
        resumen.procesados++
        if (r.estado === 'sin_indice') resumen.sin_indice++
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
        continue
      }
      if (r.estado === 'sincronizado' && r.cambio) {
        resumen.cambiados++
        try {
          if (await deps.avisarCambio(user_id, r.indice, r.indiceAnterior)) resumen.avisados++
        } catch (err) {
          deps.reportarAviso(err, user_id)
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrencia) }, trabajador))
  resumen.pendientes = cola.length - siguiente
  return resumen
}
