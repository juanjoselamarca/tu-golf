/**
 * Descarga un Blob como archivo. NUNCA lanza.
 *
 * Fuente única del patrón "objectURL + <a download> + click" (antes duplicado
 * inline en share-card.ts). Lo usa la cascada de compartir como último recurso
 * en desktop sin Web Share API: bajar el PNG de la tarjeta para que el usuario
 * igual se lleve la imagen (decisión de producto 2026-07).
 *
 * Devuelve `true` si disparó la descarga; `false` si el entorno no lo permite
 * (sin `document`/`URL.createObjectURL`, o error).
 */
export function downloadBlob(blob: Blob, filename: string): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false
  }
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revocar en el próximo tick para no cortar la descarga en curso.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    return true
  } catch {
    return false
  }
}
