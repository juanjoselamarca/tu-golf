// Copias locales del scorer individual: la tarjeta (`ronda_<codigo>_<jugador>`) y el
// respaldo sin sincronizar (`golfers_score_<codigo>_<jugador>`).

import { clearScoresDeRonda } from '@/lib/ronda/score-storage'
import { borrarRespaldosDeRonda } from '@/hooks/useScoreSync'

/**
 * Borra las dos copias de TODOS los jugadores de la ronda en este teléfono. Sólo cuando la
 * ronda se descartó o el servidor confirmó que ya no existe (P0001 / PGRST116); nunca por una
 * lectura sin señal o una sesión vencida. Si quedara el respaldo, el banner
 * "Sincronizando…" seguiría en todas las pantallas sin ronda donde subirlo.
 */
export function limpiarCopiaLocalDeRonda(codigo: string): void {
  clearScoresDeRonda(codigo)
  borrarRespaldosDeRonda(codigo)
}
