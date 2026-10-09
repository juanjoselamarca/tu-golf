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
  importadas: number
  duplicadas: number
  fallidas: number
  cpiResult: ResultadoCPI | null
  insights: string[]
}

const ERROR_GENERICO = 'No pudimos guardar las tarjetas. Revisa tu conexión e intenta de nuevo.'

function conteo(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

/** Normaliza la respuesta 200 de /api/import/confirm. */
export function leerResultadoConfirmacion(data: unknown): ResultadoConfirmacion {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return {
    importadas: conteo(d.total_imported),
    duplicadas: conteo(d.total_duplicates),
    fallidas: conteo(d.total_errors),
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
export function detalleNoGuardadas(r: Pick<ResultadoConfirmacion, 'duplicadas' | 'fallidas'>): string | null {
  const partes: string[] = []
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

  /** Devuelve el resultado si se guardó al menos una tarjeta; si no, deja `error` y devuelve null. */
  const confirmar = useCallback(
    async (jobId: string | null, rounds: ImportRoundData[]): Promise<ResultadoConfirmacion | null> => {
      setConfirmando(true)
      setError(null)
      try {
        const res = await fetch('/api/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, rounds }),
        })
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          const msg = (data as { error?: unknown } | null)?.error
          setError(typeof msg === 'string' && msg ? msg : ERROR_GENERICO)
          void captureError(new Error(`import confirm ${res.status}`), {
            context: 'import.confirm',
            meta: { status: res.status, rounds: rounds.length },
          })
          return null
        }
        const resultado = leerResultadoConfirmacion(data)
        if (resultado.importadas === 0) {
          setError(mensajeSinImportar(resultado))
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

  return { confirmando, error, confirmar }
}
