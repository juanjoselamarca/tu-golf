// Subida de pantallazos de tarjeta a /api/import/screenshot.
//
// Por qué existe: las fotos del celular pesan 1-8 MB y Vercel corta en 4,5 MB el
// cuerpo de un request (413 en texto plano). Con 2 fotos el jugador veía
// `Unexpected token 'R', "Request En"... is not valid JSON`. Acá se comprime cada
// foto en el cliente y, si igual no caben juntas, se mandan en varios requests.

import type { ImportRoundData } from '@/lib/import-types'
import { resizeImage } from '@/lib/images/resize-image'
import { fetchJsonConPlazo, JsonInvalidoError } from '@/lib/red/fetch-json-con-plazo'
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
} as const

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
 * Lanza `Error` con un mensaje para el jugador si algo falla.
 */
export async function subirFotosImportacion(
  files: File[],
  deps: DependenciasSubida = {},
): Promise<ResultadoSubidaFotos> {
  const comprimir = deps.comprimir
    ?? ((f: File) => resizeImage(f, { maxDimension: MAX_DIMENSION_PANTALLAZO, quality: CALIDAD_PANTALLAZO }))
  const enviar = deps.enviar ?? fetchJsonConPlazo

  const listos = await Promise.all(
    files.map(async f => comoArchivo(f, await comprimir(f).catch(() => f))),
  )

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

    let res: Response
    let json: unknown
    try {
      ;({ res, json } = await enviar(
        '/api/import/screenshot',
        { method: 'POST', body: formData },
        PLAZO_IMPORTACION_MS,
        { leerCuerpoSiNoOk: true },
      ))
    } catch (err) {
      throw new Error(
        err instanceof JsonInvalidoError
          ? MENSAJES_SUBIDA_FOTOS.respuestaIlegible
          : MENSAJES_SUBIDA_FOTOS.sinRed,
      )
    }

    const data = (json ?? {}) as {
      job_id?: string
      rounds?: ImportRoundData[]
      errors?: Array<{ index: number; error: string }>
      error?: string
    }
    if (!res.ok) throw new Error(data.error || `Error ${res.status} al subir fotos`)

    if (data.job_id) jobId = data.job_id
    rounds.push(...(data.rounds ?? []))
    // El servidor numera las fotos dentro de SU lote; se traduce a la foto original.
    for (const e of data.errors ?? []) errors.push({ index: lote[e.index] ?? e.index, error: e.error })
  }

  if (!jobId) throw new Error(MENSAJES_SUBIDA_FOTOS.respuestaIlegible)
  return { jobId, rounds, errors }
}
