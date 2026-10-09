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
