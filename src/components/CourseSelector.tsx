'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface CourseSelectorProps {
  onSelect: (course: {
    id: string | null
    nombre: string
    par_total: number | null
    fuente: string | null
  }) => void
  initialValue?: string
}

interface ClubGroup {
  fedegolf_club_id: number
  nombre: string
  count: number
}

interface CourseResult {
  id: string
  nombre: string
  par_total: number | null
  fuente: string | null
  datos_verificados: boolean | null
}

type Tab = 'oficial' | 'buscar'
type View = 'clubs' | 'courses'

export default function CourseSelector({ onSelect, initialValue }: CourseSelectorProps) {
  const [tab, setTab] = useState<Tab>('oficial')
  const [view, setView] = useState<View>('clubs')
  const [clubs, setClubs] = useState<ClubGroup[]>([])
  const [clubCourses, setClubCourses] = useState<CourseResult[]>([])
  const [selectedClubName, setSelectedClubName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CourseResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState(initialValue ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = createClient()

  // Load clubs on mount
  useEffect(() => {
    async function loadClubs() {
      setLoading(true)
      const { data, error } = await supabase
        .from('courses')
        .select('fedegolf_club_id, nombre')
        .not('fedegolf_club_id', 'is', null)
        .eq('activa', true)

      if (error || !data) {
        setLoading(false)
        return
      }

      // Group by fedegolf_club_id, extract club name (first part before " - " or full name)
      const clubMap = new Map<number, { nombre: string; count: number }>()
      for (const row of data) {
        const clubId = row.fedegolf_club_id as number
        if (!clubMap.has(clubId)) {
          // Club name: use the part before " - " if present, otherwise full name
          const parts = row.nombre.split(' - ')
          const clubName = parts.length > 1 ? parts[0].trim() : row.nombre
          clubMap.set(clubId, { nombre: clubName, count: 0 })
        }
        clubMap.get(clubId)!.count++
      }

      const grouped: ClubGroup[] = Array.from(clubMap.entries())
        .map(([id, info]) => ({
          fedegolf_club_id: id,
          nombre: info.nombre,
          count: info.count,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

      setClubs(grouped)
      setLoading(false)
    }

    loadClubs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadClubCourses = useCallback(async (clubId: number, clubName: string) => {
    setLoading(true)
    setSelectedClubName(clubName)
    setView('courses')

    const { data } = await supabase
      .from('courses')
      .select('id, nombre, par_total, fuente, datos_verificados')
      .eq('fedegolf_club_id', clubId)
      .eq('activa', true)
      .order('nombre')

    setClubCourses(data ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('courses')
      .select('id, nombre, par_total, fuente, datos_verificados')
      .eq('activa', true)
      .ilike('nombre', `%${query}%`)
      .order('datos_verificados', { ascending: false })
      .limit(15)

    setSearchResults(data ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSearchInput = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => handleSearch(value), 300)
  }

  const selectCourse = (course: CourseResult) => {
    setSelectedName(course.nombre)
    onSelect({
      id: course.id,
      nombre: course.nombre,
      par_total: course.par_total,
      fuente: course.fuente,
    })
  }

  const selectCustom = () => {
    if (!searchQuery.trim()) return
    setSelectedName(searchQuery.trim())
    onSelect({
      id: null,
      nombre: searchQuery.trim(),
      par_total: null,
      fuente: null,
    })
  }

  const goBackToClubs = () => {
    setView('clubs')
    setClubCourses([])
    setSelectedClubName('')
  }

  // If already selected, show compact view
  if (selectedName) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2">
        <span className="flex-1 text-sm text-white truncate">{selectedName}</span>
        <button
          type="button"
          onClick={() => setSelectedName('')}
          className="text-xs text-zinc-400 hover:text-white transition-colors"
        >
          Cambiar
        </button>
      </div>
    )
  }

  const noSearchMatch = tab === 'buscar' && searchQuery.length >= 2 && !loading && searchResults.length === 0

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden">
      {/* Tabs */}
      <div className="flex bg-zinc-800">
        <button
          type="button"
          onClick={() => { setTab('oficial'); setView('clubs') }}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'oficial'
              ? 'bg-emerald-600 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Canchas Oficiales
        </button>
        <button
          type="button"
          onClick={() => setTab('buscar')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'buscar'
              ? 'bg-emerald-600 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Buscar cancha
        </button>
      </div>

      <div className="p-3">
        {/* Tab: Canchas Oficiales */}
        {tab === 'oficial' && (
          <>
            {view === 'courses' && (
              <button
                type="button"
                onClick={goBackToClubs}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 mb-2 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {selectedClubName}
              </button>
            )}

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : view === 'clubs' ? (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {clubs.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">No hay clubes disponibles</p>
                ) : (
                  clubs.map((club) => (
                    <button
                      key={club.fedegolf_club_id}
                      type="button"
                      onClick={() => loadClubCourses(club.fedegolf_club_id, club.nombre)}
                      className="w-full flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2 text-left hover:bg-zinc-700 transition-colors"
                    >
                      <span className="text-sm text-white truncate">{club.nombre}</span>
                      <span className="text-xs text-zinc-500 ml-2 shrink-0">
                        {club.count} {club.count === 1 ? 'cancha' : 'canchas'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {clubCourses.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">Sin canchas</p>
                ) : (
                  clubCourses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => selectCourse(course)}
                      className="w-full flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-left hover:bg-zinc-700 transition-colors"
                    >
                      <VerificationDot verified={course.datos_verificados} />
                      <span className="text-sm text-white truncate flex-1">{course.nombre}</span>
                      {course.par_total && (
                        <span className="text-xs text-zinc-500 shrink-0">Par {course.par_total}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Tab: Buscar cancha */}
        {tab === 'buscar' && (
          <>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Nombre de la cancha..."
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none transition-colors"
              autoFocus
            />

            <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {searchResults.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => selectCourse(course)}
                      className="w-full flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-left hover:bg-zinc-700 transition-colors"
                    >
                      <VerificationDot verified={course.datos_verificados} />
                      <span className="text-sm text-white truncate flex-1">{course.nombre}</span>
                      {course.par_total && (
                        <span className="text-xs text-zinc-500 shrink-0">Par {course.par_total}</span>
                      )}
                    </button>
                  ))}

                  {noSearchMatch && (
                    <div className="space-y-2 py-2">
                      <p className="text-xs text-zinc-500 text-center">
                        No se encontraron canchas con ese nombre
                      </p>
                      <button
                        type="button"
                        onClick={selectCustom}
                        className="w-full rounded-lg border border-dashed border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:border-emerald-500 hover:text-white transition-colors"
                      >
                        Usar &quot;{searchQuery}&quot; como nombre
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function VerificationDot({ verified }: { verified: boolean | null }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        verified ? 'bg-emerald-400' : 'bg-amber-400'
      }`}
      title={verified ? 'Verificada' : 'Sin verificar'}
    />
  )
}
