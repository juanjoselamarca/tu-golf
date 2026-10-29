/**
 * Normaliza la URL base configurada. La variable de Vercel quedó guardada con un salto de
 * línea al final (bug de `vercel env add` por stdin en Windows): cada link armado con ella
 * salía como "https://golfersplus.vercel.app\n/torneo/x/unirse" y WhatsApp lo partía en dos
 * (el invitado llegaba al home, no a la inscripción). Se recorta espacios y "/" finales.
 */
export function normalizarSiteUrl(raw: string | undefined): string {
  const limpia = (raw ?? '').trim().replace(/\/+$/, '')
  return limpia || 'https://golfersplus.vercel.app'
}

/** URL base del sitio. Funciona en client y server. Única fuente: no leer la variable a mano. */
export const SITE_URL = normalizarSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)

/** Dominio sin protocolo, para textos de share/branding. */
export const SITE_DOMAIN = 'golfersplus.vercel.app'

/**
 * El link que recibe un JUGADOR para inscribirse al torneo.
 *
 * Sale siempre del sitio público, nunca del origen desde el que el organizador
 * abrió la pantalla: el QR se imprime o se proyecta en el club y el link se
 * manda por WhatsApp, así que viaja fuera del navegador que lo generó. Armado
 * con `window.location.origin`, un organizador que entró por un deploy de
 * preview repartía un QR que pide login de Vercel, y en una toma local, uno que
 * apunta a `localhost`. El jugador no tiene forma de darse cuenta: el QR se ve
 * igual.
 */
export function urlInscripcion(slug: string): string {
  return `${SITE_URL}/torneo/${slug}/unirse`
}

/** El link público del torneo (la portada con el leaderboard). Misma regla. */
export function urlTorneo(slug: string): string {
  return `${SITE_URL}/torneo/${slug}`
}
