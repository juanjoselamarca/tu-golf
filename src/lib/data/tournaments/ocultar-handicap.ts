// ─── Privacidad del handicap en el board público ─────────────────────────────
//
// Decisión de producto (08-oct-2026): a un espectador SIN sesión no se le muestra
// el handicap de un jugador con cuenta, porque de ahí se deduce su índice. El
// puntaje (neto, puntos) ya viene calculado con el handicap real; esto sólo
// decide qué VIAJA al cliente. El dato se anula en el servidor: no basta con no
// pintarlo, porque las props de un componente cliente se leen en el HTML.
//
// Los invitados (índice tipeado en la tarjeta) se muestran como siempre.

import type { Player } from '@/lib/golf-data'

/** Ids de jugador (`Player.id`) cuyo handicap no se le muestra a este visor. */
export function idsConHandicapOculto(
  jugadores: ReadonlyArray<{ id: string; handicap_de_perfil?: boolean }>,
  visorConSesion: boolean,
): Set<string> {
  if (visorConSesion) return new Set()
  return new Set(jugadores.filter((j) => j.handicap_de_perfil).map((j) => j.id))
}

/** Copia de `players` con `hcp`/`hcpDisplay` en null para los ids ocultos. */
export function ocultarHandicaps<P extends Player>(players: P[], ocultos: ReadonlySet<string>): Player[] {
  if (ocultos.size === 0) return players
  return players.map((p) => (p.id != null && ocultos.has(p.id) ? { ...p, hcp: null, hcpDisplay: null } : p))
}
