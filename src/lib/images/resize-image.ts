/**
 * Redimensiona y comprime una imagen del cliente antes de subirla.
 *
 * Por qué:
 *  - Las fotos de iPhone/Android pesan 3-8MB y son ~4032x3024.
 *  - La portada de torneo se muestra a max 1600x900 (hero 16:9).
 *  - Subir el original es desperdicio de red + storage.
 *
 * Output: JPEG calidad 0.85, max 1600px de lado mayor, manteniendo aspect ratio
 * original (NO crop — el display usa object-fit:cover y el usuario ya cropeó al
 * pickear desde galería si quiso).
 *
 * Si el browser no soporta canvas (extremadamente raro) o no sabe decodificar el
 * formato (HEIC en Chrome/Android), retorna el File original.
 *
 * Los defaults son los de la portada de torneo; la importación de pantallazos pide más
 * resolución (`opciones.maxDimension`) para que la IA lea los números de la tarjeta.
 */

const MAX_DIMENSION = 1600
const QUALITY = 0.85

export interface OpcionesResize {
  /** Lado mayor máximo, en px. Default 1600. */
  maxDimension?: number
  /** Calidad JPEG 0-1. Default 0.85. */
  quality?: number
}

export async function resizeImage(file: File, opciones: OpcionesResize = {}): Promise<Blob | File> {
  const maxDimension = opciones.maxDimension ?? MAX_DIMENSION
  const quality = opciones.quality ?? QUALITY

  // Skip resize si el archivo ya es chico (<500KB y <1600px implícito)
  if (file.size < 500 * 1024) {
    return file
  }

  const bitmap = await loadBitmap(file)
  if (!bitmap) return file

  try {
    const { width, height } = scaleDimensions(bitmap.width, bitmap.height, maxDimension)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    return blob ?? file
  } finally {
    if ('close' in bitmap) (bitmap as ImageBitmap).close()
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fallthrough a HTMLImageElement
    }
  }
  return loadHtmlImage(file)
}

function loadHtmlImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function scaleDimensions(w: number, h: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(w, h)
  if (longest <= maxDimension) return { width: w, height: h }
  const scale = maxDimension / longest
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  }
}
