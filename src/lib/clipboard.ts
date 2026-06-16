/**
 * Copia texto al portapapeles de forma robusta. NUNCA lanza.
 *
 * Estrategia en cascada:
 *   1. Clipboard API moderna (`navigator.clipboard.writeText`) — requiere contexto
 *      seguro (HTTPS) y permiso. La envolvemos en try/catch porque rechaza en
 *      contextos no-seguros, sin permiso, o en webviews in-app (iOS).
 *   2. Fallback legacy: `<textarea>` temporal + `document.execCommand('copy')`,
 *      que funciona en navegadores viejos y en algunos contextos donde la API
 *      moderna está bloqueada.
 *   3. Si todo falla, devuelve `false` — el caller decide qué feedback mostrar.
 *
 * Devuelve `true` si el texto quedó (probablemente) en el portapapeles.
 *
 * Motivación: auditoría QA del 2026-06-16 detectó ~20 usos directos de
 * `navigator.clipboard.writeText`, varios sin manejo de error → excepción no
 * capturada y cero feedback cuando el navegador niega el portapapeles. Este
 * helper centraliza el endurecimiento en un solo lugar.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Clipboard API moderna
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // contexto no-seguro / permiso denegado / webview → probamos el fallback
    }
  }

  // 2. Fallback legacy con textarea + execCommand
  if (typeof document === 'undefined') return false
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // Fuera de viewport y sin afectar el layout/scroll
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
