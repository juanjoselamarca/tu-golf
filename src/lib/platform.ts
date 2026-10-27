/**
 * Sistema operativo del teléfono — fuente única de la detección por user agent.
 *
 * Antes la regex `/iPad|iPhone|iPod/` estaba copiada en `push-notifications`,
 * `InstallAppCard` y `PWAInstallBanner`. Todo lo que necesite saber "¿iPhone o
 * Android?" (instrucciones de instalar la app, avisos push, "No molestar") pasa
 * por aquí.
 *
 * La función pura (`sistemaMovilDeUA`) es la que se testea; `detectarSistemaMovil`
 * sólo lee `navigator` y nunca lanza (en SSR o con un navegador raro responde
 * 'desconocido').
 */

export type SistemaMovil = 'ios' | 'android' | 'desconocido'

/**
 * @param ua        `navigator.userAgent`
 * @param pantallaTactil  true si el equipo tiene pantalla táctil: iPadOS 13+ se
 *                  presenta como "Macintosh" y sólo el táctil lo delata.
 */
export function sistemaMovilDeUA(ua: string, pantallaTactil = false): SistemaMovil {
  if (!ua) return 'desconocido'
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  // Android antes que "Mac": ningún UA de Android dice Macintosh, pero el orden
  // deja explícito que la heurística del iPad es la última opción.
  if (/Android/i.test(ua)) return 'android'
  if (ua.includes('Mac') && pantallaTactil) return 'ios'
  return 'desconocido'
}

/** Sistema del teléfono actual. Nunca lanza: ante cualquier duda, 'desconocido'. */
export function detectarSistemaMovil(): SistemaMovil {
  try {
    if (typeof navigator === 'undefined') return 'desconocido'
    const tactil = typeof document !== 'undefined' && 'ontouchend' in document
    return sistemaMovilDeUA(navigator.userAgent ?? '', tactil)
  } catch {
    return 'desconocido'
  }
}

/** true en iPhone, iPod y iPad (incluido iPadOS que se presenta como Mac). */
export function esIOS(): boolean {
  return detectarSistemaMovil() === 'ios'
}
