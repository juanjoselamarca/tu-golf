import { useCallback, useEffect, useRef, useState } from 'react'
import { captureError } from '@/lib/error-tracking'

export interface SearchResult {
  id: string
  name: string
  indice: number | null
}

/**
 * Búsqueda de perfiles con debounce, pensada para usar una instancia por
 * jugador en el formulario de nueva ronda.
 *
 * Reutiliza el endpoint `/api/profiles/search` y la misma lógica de debounce
 * que `useProfileSearch` del panel de organizador, pero sin state de
 * selección (eso lo maneja `TarjetaDeRival` vía `onCampo`).
 */
export function usePlayerSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced fetch — dispara con >=2 caracteres.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearching(false)
      setOpen(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(trimmed)}`)
        const json = res.ok ? await res.json() : { results: [] }
        const items = ((json.results as SearchResult[]) || []).slice(0, 5)
        setResults(items)
        setOpen(items.length > 0 || true) // show "sin resultados" too
      } catch (err) {
        captureError(err, { context: 'usePlayerSearch', meta: { query: trimmed } })
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const dismiss = useCallback(() => setOpen(false), [])

  return { results, searching, open, setOpen, dismiss, containerRef }
}
