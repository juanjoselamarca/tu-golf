/** Parámetro con el que el aviso "Inicia sesión para guardar" vuelve del login a ESA tarjeta. */
export const PARAM_JUGADOR = 'jugador'

/**
 * Jugador pedido explícitamente por el link (`?jugador=<id>`), sólo si está en el roster.
 * Gana sobre la auto-selección del invitado: es la tarjeta con golpes pendientes en el teléfono.
 */
export function jugadorDelLink(search: string, roster: ReadonlyArray<{ id: string }>): string | null {
  const id = new URLSearchParams(search).get(PARAM_JUGADOR)
  return id && roster.some(p => p.id === id) ? id : null
}

/** La URL sin `?jugador=`: usado una vez, no vuelve a forzar la tarjeta al recargar el roster. */
export function urlSinJugador(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(PARAM_JUGADOR)
  return url.pathname + url.search + url.hash
}

/**
 * Tarjeta que se abre sola al cargar el roster: primero la del link (vuelta del login, con golpes
 * pendientes), y sólo sin link la del invitado de este teléfono. Sin ninguna, el jugador elige.
 */
export async function elegirJugadorInicial(args: {
  search: string
  roster: ReadonlyArray<{ id: string }>
  buscarInvitado: (() => Promise<string | null>) | null
}): Promise<{ id: string; desdeLink: boolean } | null> {
  const delLink = jugadorDelLink(args.search, args.roster)
  if (delLink) return { id: delLink, desdeLink: true }
  if (!args.buscarInvitado) return null
  const invitado = await args.buscarInvitado()
  return invitado && args.roster.some(p => p.id === invitado) ? { id: invitado, desdeLink: false } : null
}
