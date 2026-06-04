import { useEffect, useRef, useState } from 'react'

export interface Profile {
  id: string
  name: string
  email: string
  indice: number | null
}

/**
 * Búsqueda con debounce de perfiles para inscribir jugadores + manejo del
 * dropdown de resultados (cierre por click afuera). Extraído verbatim de
 * JugadoresPanel — sin cambio de comportamiento.
 */
export function useProfileSearch() {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [showResults, setShowResults] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)

  // Debounced search
  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      // La búsqueda por email vive en el servidor (API autenticada): el email de
      // profiles ya no es legible por el cliente público (RLS column-level).
      try {
        const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(search)}`)
        const json = res.ok ? await res.json() : { results: [] }
        setResults((json.results as Profile[]) || [])
      } catch {
        setResults([])
      }
      setShowResults(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /** Resetea búsqueda + selección (tras inscribir). */
  function reset() {
    setSelectedProfile(null)
    setSearch('')
    setResults([])
  }

  return {
    dropdownRef,
    search, setSearch,
    results,
    showResults, setShowResults,
    selectedProfile, setSelectedProfile,
    reset,
  }
}
