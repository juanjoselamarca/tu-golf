import { gruposFijos } from '@/golf/tournament-status'

interface DesinscribirArgs {
  playerId: string
  /** `tournaments.status` al momento del clic. */
  status: string | null | undefined
  grupos: ReadonlyArray<{ ronda_libre_id?: string | null }>
  /** Retira (WD) o elimina la inscripción. `false` = el organizador canceló o falló: no se sigue. */
  retirar: (playerId: string) => Promise<boolean>
  /** Saca al jugador de su grupo y reacomoda los grupos que quedaron chicos. */
  rebalancear: (playerId: string) => Promise<unknown>
}

/**
 * Sacar a un jugador del torneo desde el panel del organizador (#810).
 *
 * - Antes del inicio: se elimina la inscripción y se rearman los grupos, como siempre.
 * - Con los grupos fijos (`gruposFijos`: torneo en juego o grupo con tarjeta): el WD solo cambia su estado.
 *   El retirado se queda en su grupo y no se mueve a nadie: mover rompe el enlace con la tarjeta y borrar el
 *   grupo saca del board todos sus golpes.
 * - Si el retiro se canceló o falló, no se toca nada.
 */
export async function desinscribir({ playerId, status, grupos, retirar, rebalancear }: DesinscribirArgs): Promise<void> {
  const retirado = await retirar(playerId)
  if (!retirado) return
  if (grupos.length === 0 || gruposFijos(status, grupos)) return
  await rebalancear(playerId)
}
