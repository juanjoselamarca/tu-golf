'use client'

// Confirmación del paso de revisión del import (POST /api/import/confirm).
//
// La pantalla final tiene que contar lo que el servidor GUARDÓ, no lo que el
// usuario aceptó: el confirm salta duplicados (misma cancha + fecha + gross ya
// en el historial) y rondas que importRound rechaza, y aun así responde 200.
// Antes el cliente ignoraba esos conteos y celebraba "3 tarjetas guardadas"
// con 0 guardadas (re-importar la misma foto), y si el confirm fallaba solo
// hacía console.error: el botón volvía a habilitarse sin decir nada.

import { useCallback, useState } from 'react'
import type { ResultadoCPI } from '@/golf/stats/cpi'
import type { ImportRoundData } from '@/lib/import-types'
import { captureError } from '@/lib/error-tracking'

export interface ResultadoConfirmacion {
  /** Tarjetas nuevas en el historial. */
  importadas: number
  /** Duplicados Garmin re-escritos con los datos del archivo (se guardaron, no son nuevos). */
  actualizadas: number
  duplicadas: number
  fallidas: number
  /** tempId de las tarjetas que NO se guardaron (duplicadas o con error). */
  noGuardadas: string[]
  cpiResult: ResultadoCPI | null
  insights: string[]
}

const ERROR_GENERICO = 'No pudimos guardar las tarjetas. Revisa tu conexión e intenta de nuevo.'
const ERROR_DATOS_INVALIDOS =
  'Una de las tarjetas tiene datos fuera de rango. Revisa sus hoyos o descártala e intenta de nuevo.'

function conteo(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

function tempIds(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.flatMap(x => (x && typeof (x as { tempId?: unknown }).tempId === 'string' ? [(x as { tempId: string }).tempId] : []))
}

/** Normaliza la respuesta 200 de /api/import/confirm. */
export function leerResultadoConfirmacion(data: unknown): ResultadoConfirmacion {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return {
    importadas: conteo(d.total_imported),
    actualizadas: conteo(d.total_updated),
    duplicadas: conteo(d.total_duplicates),
    fallidas: conteo(d.total_errors),
    noGuardadas: [...tempIds(d.duplicates), ...tempIds(d.errors)],
    cpiResult: (d.cpiResult as ResultadoCPI | null | undefined) ?? null,
    insights: Array.isArray(d.insights) ? d.insights.filter((i): i is string => typeof i === 'string') : [],
  }
}

/** Mensaje cuando el servidor respondió OK pero no guardó ninguna tarjeta. */
export function mensajeSinImportar(r: Pick<ResultadoConfirmacion, 'duplicadas' | 'fallidas'>): string {
  if (r.duplicadas > 0 && r.fallidas === 0) {
    return r.duplicadas === 1
      ? 'Esta tarjeta ya estaba en tu historial. No se guardó nada nuevo.'
      : 'Estas tarjetas ya estaban en tu historial. No se guardó nada nuevo.'
  }
  return 'No pudimos guardar las tarjetas. Revisa los datos de cada una e intenta de nuevo.'
}

/** Línea secundaria de la celebración cuando parte de la tanda no se guardó. */
export function detalleNoGuardadas(
  r: Pick<ResultadoConfirmacion, 'duplicadas' | 'fallidas'> & { actualizadas?: number },
): string | null {
  const partes: string[] = []
  const act = r.actualizadas ?? 0
  if (act > 0) {
    partes.push(act === 1 ? '1 ya estaba y se actualizó' : `${act} ya estaban y se actualizaron`)
  }
  if (r.duplicadas > 0) {
    partes.push(r.duplicadas === 1 ? '1 ya estaba en tu historial' : `${r.duplicadas} ya estaban en tu historial`)
  }
  if (r.fallidas > 0) {
    partes.push(r.fallidas === 1 ? '1 no se pudo guardar' : `${r.fallidas} no se pudieron guardar`)
  }
  return partes.length > 0 ? `${partes.join(' · ')}.` : null
}

export function useConfirmarImportacion() {
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** true cuando no se guardó nada porque TODO ya estaba en el historial. */
  const [todasDuplicadas, setTodasDuplicadas] = useState(false)

  /** Devuelve el resultado si se guardó al menos una tarjeta; si no, deja `error` y devuelve null. */
  const confirmar = useCallback(
    async (jobId: string | null, rounds: ImportRoundData[]): Promise<ResultadoConfirmacion | null> => {
      setConfirmando(true)
      setError(null)
      setTodasDuplicadas(false)
      try {
        const res = await fetch('/api/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, rounds }),
        })
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          const body = data as { error?: unknown; code?: unknown } | null
          const msg = body?.code === 'invalid_rounds' ? ERROR_DATOS_INVALIDOS : body?.error
          setError(typeof msg === 'string' && msg ? msg : ERROR_GENERICO)
          void captureError(new Error(`import confirm ${res.status}`), {
            context: 'import.confirm',
            meta: { status: res.status, rounds: rounds.length },
          })
          return null
        }
        const resultado = leerResultadoConfirmacion(data)
        if (resultado.importadas + resultado.actualizadas === 0) {
          setError(mensajeSinImportar(resultado))
          setTodasDuplicadas(resultado.duplicadas > 0 && resultado.fallidas === 0)
          return null
        }
        return resultado
      } catch (err) {
        void captureError(err, { context: 'import.confirm', meta: { rounds: rounds.length } })
        setError(ERROR_GENERICO)
        return null
      } finally {
        setConfirmando(false)
      }
    },
    [],
  )

  return { confirmando, error, todasDuplicadas, confirmar }
}
