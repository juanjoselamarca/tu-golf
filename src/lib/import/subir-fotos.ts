// Subida de pantallazos de tarjeta a /api/import/screenshot.
//
// Por qué existe: las fotos del celular pesan 1-8 MB y Vercel corta en 4,5 MB el
// cuerpo de un request (413 en texto plano). Con 2 fotos el jugador veía
// `Unexpected token 'R', "Request En"... is not valid JSON`. Acá se comprime cada
// foto en el cliente y, si igual no caben juntas, se mandan en varios requests.

import { ERROR_IMPORT_IA_NO_DISPONIBLE, type ImportRoundData } from '@/lib/import-types'
import { resizeImage } from '@/lib/images/resize-image'
import { fetchJsonConPlazo, JsonInvalidoError } from '@/lib/red/fetch-json-con-plazo'
import { TiempoAgotadoError } from '@/lib/red/con-timeout'
import { LIMITE_CUERPO_SUBIDA_BYTES } from '@/lib/red/limite-cuerpo'
import { PLAZO_IMPORTACION_MS } from '@/lib/red/plazos'

/** Lado mayor de la foto comprimida: la IA tiene que leer los números de cada hoyo. */
const MAX_DIMENSION_PANTALLAZO = 2048
const CALIDAD_PANTALLAZO = 0.85

export interface ResultadoSubidaFotos {
  /** Job del último lote: el confirm solo lo usa para verificar dueño y cerrarlo. */
  jobId: string
  rounds: ImportRoundData[]
  errors: Array<{ index: number; error: string }>
}

/** Mensajes al jugador (no al desarrollador). */
export const MENSAJES_SUBIDA_FOTOS = {
  fotoMuyPesada: (nombre: string) =>
    `La foto ${nombre} pesa demasiado aún comprimida. Sube un pantallazo en vez de una foto de la pantalla.`,
  respuestaIlegible: 'No pudimos procesar las fotos. Intenta de nuevo en unos segundos.',
  sinRed: 'No pudimos subir las fotos. Revisa tu conexión e intenta de nuevo.',
  // El servidor puede seguir leyendo (gasta IA y cupo): no invitar a reintentar al tiro.
  plazoVencido: 'La lectura está tardando más de lo normal. Espera un minuto antes de reintentar.',
} as const

/** Código que el servidor devuelve cuando la foto no es una tarjeta de Garmin Golf. */
const ERROR_NO_ES_TARJETA = 'not_a_scorecard'

/** Mensaje al jugador según por qué no se pudo leer una foto (código de `/api/import/screenshot`). */
export function mensajeDeFotoNoLeida(codigo: string | undefined): string {
  if (codigo === ERROR_NO_ES_TARJETA) {
    return 'No se detectó una tarjeta de golf en la imagen. Asegúrate de que sea un pantallazo de Garmin Golf.'
  }
  if (codigo === ERROR_IMPORT_IA_NO_DISPONIBLE) {
    return 'Error conectando con el servicio de lectura de fotos. Intenta de nuevo en unos segundos.'
  }
  return 'No pudimos leer la foto. Intenta de nuevo; si sigue fallando, sube un pantallazo más nítido.'
}

/**
 * Aviso para la revisión cuando SOLO algunas fotos se leyeron. Sin él, el jugador
 * que subía 5 fotos y veía 4 rondas confirmaba creyendo que había importado todo.
 * `null` si no hubo fotos fallidas.
 */
export function avisoDeFotosNoLeidas(
  errores: Array<{ index: number; error: string }>,
  totalFotos: number,
): string | null {
  if (errores.length === 0) return null
  const fotos = [...new Set(errores.map(e => e.index + 1))].sort((a, b) => a - b)
  const noEsTarjeta = errores.every(e => e.error === ERROR_NO_ES_TARJETA)
  if (fotos.length === 1) {
    const motivo = noEsTarjeta ? 'no parece una tarjeta de Garmin Golf' : 'no se pudo leer'
    return `No importamos la foto ${fotos[0]} de ${totalFotos}: ${motivo}. Revisa las rondas de abajo y vuelve a subir esa foto después.`
  }
  const cuales = `${fotos.slice(0, -1).join(', ')} y ${fotos[fotos.length - 1]}`
  const motivo = noEsTarjeta ? 'no parecen tarjetas de Garmin Golf' : 'no se pudieron leer'
  return `No importamos ${fotos.length} de tus ${totalFotos} fotos (las fotos ${cuales}): ${motivo}. Revisa las rondas de abajo y vuelve a subir esas fotos después.`
}

/** Mensaje para el jugador según por qué falló el envío de un lote. */
function mensajeDeFallaDeEnvio(err: unknown): string {
  if (err instanceof JsonInvalidoError) return MENSAJES_SUBIDA_FOTOS.respuestaIlegible
  if (err instanceof TiempoAgotadoError) return MENSAJES_SUBIDA_FOTOS.plazoVencido
  return MENSAJES_SUBIDA_FOTOS.sinRed
}

/**
 * Agrupa archivos (por su peso en bytes) en lotes que no pasan `limite`, en orden.
 * Devuelve los índices de cada lote. Un archivo que solo ya pasa el límite se
 * informa en `demasiadoGrande` (no se puede mandar de ninguna forma).
 */
export function armarLotesPorPeso(
  pesos: number[],
  limite: number,
): { lotes: number[][]; demasiadoGrande: number | null } {
  const lotes: number[][] = []
  let actual: number[] = []
  let pesoActual = 0
  for (let i = 0; i < pesos.length; i++) {
    const peso = pesos[i]
    if (peso > limite) return { lotes: [], demasiadoGrande: i }
    if (actual.length > 0 && pesoActual + peso > limite) {
      lotes.push(actual)
      actual = []
      pesoActual = 0
    }
    actual.push(i)
    pesoActual += peso
  }
  if (actual.length > 0) lotes.push(actual)
  return { lotes, demasiadoGrande: null }
}

/** Nombre de archivo JPEG para un blob comprimido (el servidor decide el mime por `type`). */
function comoArchivo(original: File, comprimido: Blob | File): File {
  if (comprimido instanceof File) return comprimido
  const base = original.name.replace(/\.[^.]+$/, '') || 'foto'
  return new File([comprimido], `${base}.jpg`, { type: comprimido.type || 'image/jpeg' })
}

interface DependenciasSubida {
  comprimir?: (file: File) => Promise<Blob | File>
  enviar?: typeof fetchJsonConPlazo
}

/**
 * Comprime, arma lotes bajo el límite de Vercel y los sube en orden. Une las rondas
 * y errores de todos los lotes; los índices de error se refieren a la foto original.
 * Si CUALQUIER lote falla, lanza `Error` con el mensaje real (429, plazo, red): la
 * revisión no tiene cómo avisar "faltaron N fotos", y seguir con un resultado parcial
 * hacía que el jugador confirmara creyendo que importó todo.
 */
export async function subirFotosImportacion(
  files: File[],
  deps: DependenciasSubida = {},
): Promise<ResultadoSubidaFotos> {
  const comprimir = deps.comprimir
    ?? ((f: File) => resizeImage(f, { maxDimension: MAX_DIMENSION_PANTALLAZO, quality: CALIDAD_PANTALLAZO }))
  const enviar = deps.enviar ?? fetchJsonConPlazo

  // De a una: cada foto decodificada ocupa decenas de MB y iOS Safari recarga la
  // pestaña sin aviso si se pasa del tope de memoria de canvas.
  const listos: File[] = []
  for (const f of files) listos.push(comoArchivo(f, await comprimir(f).catch(() => f)))

  const { lotes, demasiadoGrande } = armarLotesPorPeso(listos.map(f => f.size), LIMITE_CUERPO_SUBIDA_BYTES)
  if (demasiadoGrande !== null) {
    throw new Error(MENSAJES_SUBIDA_FOTOS.fotoMuyPesada(files[demasiadoGrande].name))
  }

  const rounds: ImportRoundData[] = []
  const errors: Array<{ index: number; error: string }> = []
  let jobId: string | null = null

  for (const lote of lotes) {
    const formData = new FormData()
    for (const i of lote) formData.append('images', listos[i])

    let falla: string | null = null
    let data: {
      job_id?: string
      rounds?: ImportRoundData[]
      errors?: Array<{ index: number; error: string }>
      error?: string
    } = {}
    try {
      const { res, json } = await enviar(
        '/api/import/screenshot',
        { method: 'POST', body: formData },
        PLAZO_IMPORTACION_MS,
        { leerCuerpoSiNoOk: true },
      )
      data = (json ?? {}) as typeof data
      if (!res.ok) falla = data.error || `Error ${res.status} al subir fotos`
    } catch (err) {
      falla = mensajeDeFallaDeEnvio(err)
    }

    if (falla !== null) throw new Error(falla)

    if (data.job_id) jobId = data.job_id
    rounds.push(...(data.rounds ?? []))
    // El servidor numera las fotos dentro de SU lote; se traduce a la foto original.
    for (const e of data.errors ?? []) errors.push({ index: lote[e.index] ?? e.index, error: e.error })
  }

  if (!jobId) throw new Error(MENSAJES_SUBIDA_FOTOS.respuestaIlegible)
  return { jobId, rounds, errors }
}
