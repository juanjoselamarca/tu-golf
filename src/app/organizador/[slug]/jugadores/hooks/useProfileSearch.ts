import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

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
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, indice')
        .or(`name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10)
      setResults((data as Profile[]) || [])
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
