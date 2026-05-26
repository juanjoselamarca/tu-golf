'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CourseSelectorProps {
  onSelect: (course: {
    id: string | null
    nombre: string
    par_total: number | null
    fuente: string | null
  }) => void
  initialValue?: string
}

interface CourseRow {
  id: string
  nombre: string
  par_total: number | null
  fuente: string | null
  datos_verificados: boolean | null
  fedegolf_club_id: number | null
  parent_id: string | null
  loop_nombre: string | null
}

/** A merged course = one entry per course, with both VARONES and DAMAS ids */
interface MergedCourse {
  displayName: string
  clubName: string
  clubId: number | null
  parTotal: number | null
  verified: boolean
  varonesId: string | null
  damasId: string | null
  varonesParTotal: number | null
  damasParTotal: number | null
  fuente: string | null
  /** Loops for multi-recorrido clubs (e.g. Norte, Sur, Este) */
  loops: { name: string; id: string; par: number }[]
}

interface FavoriteCourse {
  displayName: string
  clubName: string
  clubId: number | null
  varonesId: string | null
  damasId: string | null
  varonesParTotal: number | null
  damasParTotal: number | null
  fuente: string | null
}

interface ClubGroup {
  clubName: string
  clubId: number | null
  courses: MergedCourse[]
}

type Gender = 'M' | 'F'

// ─── Constants ───────────────────────────────────────────────────────────────

const FAVORITES_KEY = 'golfers_favorite_courses'
const RECENTS_KEY = 'golfers_recent_courses'
const MAX_FAVORITES = 5
const MAX_RECENTS = 3

/** Club IDs ordered by popularity in Chilean golf */
const CLUB_POPULARITY_ORDER = [
  5, 4, 1, 3, 7, 2, 58, 9, 6, 26, 50, 10, 16, 17, 56,
  20, 21, 25, 8, 14, 18, 12, 27, 22, 19, 24,
]

// ─── Design tokens ──────────────────────────────────────────────────────────

const C = {
  bg: '#ffffff',
  card: '#f9fafb',
  cardGradient: '#ffffff',
  gold: '#c4992a',
  goldDim: 'rgba(196,153,42,0.35)',
  goldFaint: '#e5e7eb',
  ivory: '#111827',
  muted: '#6b7280',
  tertiary: '#9ca3af',
  inputBg: '#ffffff',
  white04: '#ffffff',
  white08: '#fffdf5',
  selectedBg: 'rgba(196,153,42,0.06)',
} as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanCourseName(nombre: string): { displayName: string; clubName: string } {
  const dashIdx = nombre.indexOf(' - ')
  let clubName = ''
  let coursePart = nombre

  if (dashIdx !== -1) {
    clubName = nombre.substring(0, dashIdx).trim()
    coursePart = nombre.substring(dashIdx + 3).trim()
  }

  // Remove gender suffixes
  coursePart = coursePart
    .replace(/\s*\(VARONES\)\s*/i, '')
    .replace(/\s*\(DAMAS\)\s*/i, '')
    .trim()

  return { displayName: coursePart || clubName, clubName }
}

function isVarones(nombre: string): boolean {
  return /\(VARONES\)/i.test(nombre)
}

function isDamas(nombre: string): boolean {
  return /\(DAMAS\)/i.test(nombre)
}

/** Merge VARONES/DAMAS pairs into single entries, grouping children under parents */
function mergeCourses(courses: CourseRow[]): MergedCourse[] {
  // Separate parents (parent_id is null) from children (parent_id is set)
  const parents = courses.filter(c => !c.parent_id)
  const children = courses.filter(c => c.parent_id)

  // Index children by parent_id
  const childrenByParent = new Map<string, CourseRow[]>()
  for (const child of children) {
    const pid = child.parent_id!
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, [])
    childrenByParent.get(pid)!.push(child)
  }

  const map = new Map<string, MergedCourse>()

  for (const c of parents) {
    const { displayName, clubName } = cleanCourseName(c.nombre)
    const key = `${c.fedegolf_club_id ?? 'null'}_${displayName}`

    if (!map.has(key)) {
      map.set(key, {
        displayName,
        clubName,
        clubId: c.fedegolf_club_id,
        parTotal: c.par_total,
        verified: c.datos_verificados ?? false,
        varonesId: null,
        damasId: null,
        varonesParTotal: null,
        damasParTotal: null,
        fuente: c.fuente,
        loops: [],
      })
    }

    const entry = map.get(key)!
    if (isDamas(c.nombre)) {
      entry.damasId = c.id
      entry.damasParTotal = c.par_total
    } else {
      entry.varonesId = c.id
      entry.varonesParTotal = c.par_total
      entry.parTotal = c.par_total
    }

    if (c.datos_verificados) entry.verified = true

    // Attach children loops to this parent
    const kids = childrenByParent.get(c.id)
    if (kids && kids.length >= 2) {
      entry.loops = kids
        .filter(k => k.loop_nombre)
        .map(k => ({ name: k.loop_nombre!, id: k.id, par: k.par_total ?? 36 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    }
  }

  return Array.from(map.values())
}

/** Group merged courses by club for the two-level hierarchy (club → recorrido) */
function groupByClub(courses: MergedCourse[]): ClubGroup[] {
  const map = new Map<string, ClubGroup>()
  for (const c of courses) {
    const key = `${c.clubId ?? 'null'}_${c.clubName || c.displayName}`
    if (!map.has(key)) {
      map.set(key, {
        clubName: c.clubName || c.displayName,
        clubId: c.clubId,
        courses: [],
      })
    }
    map.get(key)!.courses.push(c)
  }
  return Array.from(map.values())
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Silently fail
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StarIcon({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? C.gold : 'none'}
      stroke={filled ? C.gold : C.tertiary}
      strokeWidth={1.5}
      style={{ flexShrink: 0, transition: 'all 0.2s ease' }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  )
}

function GenderToggle({ value, onChange }: { value: Gender; onChange: (g: Gender) => void }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: 6,
        border: `1px solid ${C.goldFaint}`,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {(['M', 'F'] as Gender[]).map((g) => (
        <button
          key={g}
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(g) }}
          style={{
            padding: '2px 7px',
            fontSize: 11,
            fontWeight: 600,
            background: value === g ? C.gold : 'transparent',
            color: value === g ? C.bg : C.muted,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minHeight: 22,
            lineHeight: '16px',
          }}
        >
          {g === 'M' ? 'Varones' : 'Damas'}
        </button>
      ))}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
      <div
        style={{
          width: 24,
          height: 24,
          border: `2px solid ${C.goldDim}`,
          borderTopColor: C.gold,
          borderRadius: '50%',
          animation: 'course-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes course-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: C.tertiary,
        padding: '8px 4px 4px',
      }}
    >
      {children}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CourseSelector({ onSelect, initialValue }: CourseSelectorProps) {
  const [allCourses, setAllCourses] = useState<MergedCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedName, setSelectedName] = useState(initialValue ?? '')
  const [selectedCourse, setSelectedCourse] = useState<MergedCourse | null>(null)
  const [gender, setGender] = useState<Gender>('M')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CourseRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteCourse[]>(() =>
    loadFromStorage<FavoriteCourse[]>(FAVORITES_KEY, [])
  )
  const [recents, setRecents] = useState<FavoriteCourse[]>(() =>
    loadFromStorage<FavoriteCourse[]>(RECENTS_KEY, [])
  )
  const [expandedClubKey, setExpandedClubKey] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  // Load all fedegolf courses on mount (parents + children for loop info)
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('courses')
        .select('id, nombre, par_total, fuente, datos_verificados, fedegolf_club_id, parent_id, loop_nombre')
        .eq('fuente', 'fedegolf')
        .eq('activa', true)

      if (data) {
        setAllCourses(mergeCourses(data as CourseRow[]))
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Group by club and sort by popularity
  const sortedClubGroups = useMemo(() => {
    const popularityMap = new Map<number, number>()
    CLUB_POPULARITY_ORDER.forEach((id, idx) => popularityMap.set(id, idx))

    const groups = groupByClub(allCourses)
    // Sort recorridos inside each group alphabetically
    for (const g of groups) {
      g.courses.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
    }
    return groups.sort((a, b) => {
      const aIdx = a.clubId !== null ? (popularityMap.get(a.clubId) ?? 999) : 999
      const bIdx = b.clubId !== null ? (popularityMap.get(b.clubId) ?? 999) : 999
      if (aIdx !== bIdx) return aIdx - bIdx
      return a.clubName.localeCompare(b.clubName, 'es')
    })
  }, [allCourses])

  // Search handler — fetch parents + their children for loop info
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    // Search only parent courses (parent_id is null) to avoid duplicate loop entries
    const { data: parents } = await supabase
      .from('courses')
      .select('id, nombre, par_total, fuente, datos_verificados, fedegolf_club_id, parent_id, loop_nombre')
      .eq('activa', true)
      .is('parent_id', null)
      .ilike('nombre', `%${query}%`)
      .order('datos_verificados', { ascending: false })
      .limit(15)

    if (parents && parents.length > 0) {
      // Fetch children for any matching parents to get loop info
      const parentIds = parents.map(p => p.id)
      const { data: children } = await supabase
        .from('courses')
        .select('id, nombre, par_total, fuente, datos_verificados, fedegolf_club_id, parent_id, loop_nombre')
        .in('parent_id', parentIds)
        .eq('activa', true)

      setSearchResults([...(parents as CourseRow[]), ...((children as CourseRow[]) ?? [])])
    } else {
      setSearchResults((parents as CourseRow[]) ?? [])
    }
    setSearchLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSearchInput = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => handleSearch(value), 300)
  }

  const mergedSearchResults = useMemo(() => {
    return mergeCourses(searchResults)
  }, [searchResults])

  const searchClubGroups = useMemo(() => {
    const groups = groupByClub(mergedSearchResults)
    for (const g of groups) {
      g.courses.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
    }
    return groups
  }, [mergedSearchResults])

  // Select a course
  const doSelect = useCallback((course: MergedCourse, g: Gender) => {
    const id = g === 'F' ? (course.damasId ?? course.varonesId) : (course.varonesId ?? course.damasId)
    const par = g === 'F' ? (course.damasParTotal ?? course.varonesParTotal) : (course.varonesParTotal ?? course.damasParTotal)

    setSelectedName(course.displayName)
    setSelectedCourse(course)
    setGender(g)

    // Add to recents
    const asFav: FavoriteCourse = {
      displayName: course.displayName,
      clubName: course.clubName,
      clubId: course.clubId,
      varonesId: course.varonesId,
      damasId: course.damasId,
      varonesParTotal: course.varonesParTotal,
      damasParTotal: course.damasParTotal,
      fuente: course.fuente,
    }
    setRecents(prev => {
      const filtered = prev.filter(r => r.displayName !== course.displayName || r.clubId !== course.clubId)
      const updated = [asFav, ...filtered].slice(0, MAX_RECENTS)
      saveToStorage(RECENTS_KEY, updated)
      return updated
    })

    onSelect({
      id: id ?? null,
      nombre: course.displayName,
      par_total: par ?? null,
      fuente: course.fuente,
    })
  }, [onSelect])

  // Toggle favorite
  const toggleFavorite = useCallback((course: MergedCourse | FavoriteCourse) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.displayName === course.displayName && f.clubId === course.clubId)
      let updated: FavoriteCourse[]
      if (exists) {
        updated = prev.filter(f => !(f.displayName === course.displayName && f.clubId === course.clubId))
      } else {
        if (prev.length >= MAX_FAVORITES) return prev
        const asFav: FavoriteCourse = {
          displayName: course.displayName,
          clubName: course.clubName,
          clubId: course.clubId,
          varonesId: 'varonesId' in course ? course.varonesId : null,
          damasId: 'damasId' in course ? course.damasId : null,
          varonesParTotal: 'varonesParTotal' in course ? course.varonesParTotal : null,
          damasParTotal: 'damasParTotal' in course ? course.damasParTotal : null,
          fuente: course.fuente,
        }
        updated = [...prev, asFav]
      }
      saveToStorage(FAVORITES_KEY, updated)
      return updated
    })
  }, [])

  const isFavorite = useCallback((displayName: string, clubId: number | null) => {
    return favorites.some(f => f.displayName === displayName && f.clubId === clubId)
  }, [favorites])

  // Select custom course from search
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

  // Convert FavoriteCourse to MergedCourse for selection
  const favToMerged = (fav: FavoriteCourse): MergedCourse => ({
    ...fav,
    parTotal: fav.varonesParTotal,
    verified: true,
    loops: [],
  })

  // ── Selected state ──────────────────────────────────────────────────────────

  if (selectedName && selectedCourse) {
    const par = gender === 'F'
      ? (selectedCourse.damasParTotal ?? selectedCourse.varonesParTotal)
      : (selectedCourse.varonesParTotal ?? selectedCourse.damasParTotal)

    return (
      <div
        style={{
          background: C.cardGradient,
          border: `1px solid ${C.goldDim}`,
          borderRadius: 14,
          padding: '14px 16px',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Inbox 7a18d95b: flexWrap evita que toggle Varones/Damas + botón
            Cambiar le coman ancho al nombre en mobile angosto y rompan el
            texto carácter-por-carácter por culpa de wordBreak: break-word. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: C.ivory,
                // H05: 2 lineas con ellipsis en vez de truncado agresivo single-line.
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
                lineHeight: 1.3,
                wordBreak: 'break-word',
              }}
            >
              {selectedCourse.displayName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              {selectedCourse.clubName && (
                <span style={{ fontSize: 13, color: C.gold }}>
                  {selectedCourse.clubName}
                </span>
              )}
              {par && (
                <span style={{ fontSize: 12, color: C.muted }}>
                  Par {par}
                </span>
              )}
            </div>
          </div>
          {(selectedCourse.varonesId && selectedCourse.damasId) && (
            <GenderToggle
              value={gender}
              onChange={(g) => {
                setGender(g)
                doSelect(selectedCourse, g)
              }}
            />
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedName('')
              setSelectedCourse(null)
            }}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: C.muted,
              background: C.white04,
              border: `1px solid ${C.goldFaint}`,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minHeight: 36,
            }}
          >
            Cambiar
          </button>
        </div>
      </div>
    )
  }

  // Simple selected (custom or from initialValue without course object)
  if (selectedName) {
    return (
      <div
        style={{
          background: C.cardGradient,
          border: `1px solid ${C.goldDim}`,
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 14,
            color: C.ivory,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selectedName}
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectedName('')
            setSelectedCourse(null)
          }}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            color: C.muted,
            background: C.white04,
            border: `1px solid ${C.goldFaint}`,
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minHeight: 36,
          }}
        >
          Cambiar
        </button>
      </div>
    )
  }

  // ── Course list item ────────────────────────────────────────────────────────

  const renderCourseItem = (course: MergedCourse, showClub = true, isSearchResult = false) => {
    const fav = isFavorite(course.displayName, course.clubId)
    // Only show verification dot for non-fedegolf search results
    const showVerifiedDot = isSearchResult && course.fuente !== 'fedegolf' && course.verified
    return (
      <div
        key={`${course.clubId}_${course.displayName}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '14px 16px',
          background: '#ffffff',
          border: `1px solid ${C.goldFaint}`,
          borderRadius: 12,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minHeight: 56,
        }}
        onClick={() => doSelect(course, gender)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#fffdf5'
          e.currentTarget.style.borderColor = C.gold
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#ffffff'
          e.currentTarget.style.borderColor = C.goldFaint
        }}
      >
        {/* Row 1: Name + Star */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showVerifiedDot && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#4ade80',
                flexShrink: 0,
              }}
            />
          )}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 15,
              fontWeight: 600,
              color: C.ivory,
              // H05: permitir 2 lineas para evitar truncados agresivos tipo
              // "C.G. Las Brisas De Santo D…". Clamp a 2 lineas con ellipsis.
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            {course.displayName}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(course) }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            aria-label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <StarIcon filled={fav} size={16} />
          </button>
          {/* H04: chevron-right consistente en todo item clickeable. Señala
              que el card completo es tappable (ir al siguiente paso del wizard). */}
          <span
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', color: C.tertiary, flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </div>
        {/* Row 2: Club + Par + loops badge + V/D toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showClub && course.clubName && (
            <span
              style={{
                fontSize: 12,
                color: C.tertiary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}
            >
              {course.clubName}
            </span>
          )}
          {!showClub || !course.clubName ? <span style={{ flex: 1 }} /> : null}
          {course.loops.length >= 2 && (
            <span
              style={{
                fontSize: 11,
                color: C.gold,
                background: C.goldFaint,
                padding: '1px 6px',
                borderRadius: 4,
                flexShrink: 0,
                fontWeight: 600,
              }}
            >
              {course.loops.map(l => l.name).join(' / ')}
            </span>
          )}
          {course.parTotal && (
            <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>
              Par {course.parTotal}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Club list item (first level of hierarchy) ──────────────────────────────

  const handleClubClick = (group: ClubGroup) => {
    if (group.courses.length === 1) {
      doSelect(group.courses[0], gender)
      return
    }
    const key = `${group.clubId ?? 'null'}_${group.clubName}`
    setExpandedClubKey(prev => (prev === key ? null : key))
  }

  const renderClubItem = (group: ClubGroup) => {
    const key = `${group.clubId ?? 'null'}_${group.clubName}`
    const expanded = expandedClubKey === key
    const count = group.courses.length
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            background: expanded ? C.selectedBg : '#ffffff',
            border: `1px solid ${expanded ? C.gold : C.goldFaint}`,
            borderRadius: 12,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            minHeight: 60,
          }}
          onClick={() => handleClubClick(group)}
          onMouseEnter={(e) => {
            if (!expanded) {
              e.currentTarget.style.background = '#fffdf5'
              e.currentTarget.style.borderColor = C.gold
            }
          }}
          onMouseLeave={(e) => {
            if (!expanded) {
              e.currentTarget.style.background = '#ffffff'
              e.currentTarget.style.borderColor = C.goldFaint
            }
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: C.ivory,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {group.clubName}
            </div>
            {count > 1 && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {count} recorridos
              </div>
            )}
          </div>
          {/* H04: chevron consistente en todo item clickeable.
              Solo un recorrido: chevron-right apunta al siguiente paso.
              Multi-recorrido: chevron rota 90deg cuando esta expandido. */}
          <span
            aria-hidden="true"
            style={{
              display: 'flex', alignItems: 'center',
              color: expanded ? C.gold : C.tertiary,
              transform: expanded && count > 1 ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease, color 0.2s ease',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </div>
        {expanded && count > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12 }}>
            {group.courses.map((c) => renderCourseItem(c, false, false))}
          </div>
        )}
      </div>
    )
  }

  // ── Open selector ───────────────────────────────────────────────────────────

  const hasSearch = searchQuery.length >= 2
  const noSearchMatch = hasSearch && !searchLoading && mergedSearchResults.length === 0

  return (
    <div
      style={{
        background: C.cardGradient,
        border: `1px solid ${C.goldDim}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* ── Search bar (TOP) ── */}
      {/* P19: contraste WCAG AA placeholder, borde definido, icon lupa visible.
          TODO(foundation): reemplazar por <Input variant="search" /> cuando Foundation
          publique el componente. Por ahora usamos tokens inline con el icon inline. */}
      <div style={{ padding: '12px 12px 8px', borderBottom: `1px solid ${C.goldFaint}`, background: C.card }}>
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', alignItems: 'center', pointerEvents: 'none',
              color: '#6b7280',
            }}
          >
            {/* Lupa line icon — coherente con sistema line (no emojis, no cartoon). */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder="Buscar cancha..."
            aria-label="Buscar cancha"
            style={{
              width: '100%',
              padding: '12px 14px 12px 40px',
              fontSize: 15,
              color: C.ivory,
              background: C.inputBg,
              border: `2px solid #9ca3af`,
              borderRadius: 10,
              outline: 'none',
              minHeight: 48,
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.gold }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#9ca3af' }}
          />
        </div>
      </div>
      <div
        style={{
          maxHeight: '50vh',
          overflowY: 'auto',
          padding: '12px 12px 0',
        }}
      >
        {loading ? (
          <Spinner />
        ) : (
          <>
            {/* ── Favoritas ── */}
            {favorites.length > 0 && !hasSearch && (
              <div style={{ marginBottom: 8 }}>
                <SectionLabel>Favoritas</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {favorites.map((fav) => {
                    const merged = allCourses.find(
                      c => c.displayName === fav.displayName && c.clubId === fav.clubId
                    ) ?? favToMerged(fav)
                    return renderCourseItem(merged)
                  })}
                </div>
              </div>
            )}

            {/* ── Recientes ── */}
            {recents.length > 0 && !hasSearch && (
              <div style={{ marginBottom: 8 }}>
                <SectionLabel>Recientes</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {recents.map((rec) => {
                    const merged = allCourses.find(
                      c => c.displayName === rec.displayName && c.clubId === rec.clubId
                    ) ?? favToMerged(rec)
                    return renderCourseItem(merged)
                  })}
                </div>
              </div>
            )}

            {/* ── Search results ── */}
            {hasSearch ? (
              <div style={{ marginBottom: 8 }}>
                <SectionLabel>Resultados</SectionLabel>
                {searchLoading ? (
                  <Spinner />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {searchClubGroups.map((group) => renderClubItem(group))}
                    {noSearchMatch && (
                      <div style={{ padding: '12px 0', textAlign: 'center' }}>
                        <p style={{ fontSize: 13, color: C.tertiary, marginBottom: 8 }}>
                          No se encontraron canchas
                        </p>
                        <button
                          type="button"
                          onClick={selectCustom}
                          style={{
                            width: '100%',
                            padding: '10px 16px',
                            fontSize: 14,
                            color: C.muted,
                            background: 'transparent',
                            border: `1px dashed ${C.tertiary}`,
                            borderRadius: 10,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            minHeight: 44,
                          }}
                        >
                          Usar &ldquo;{searchQuery}&rdquo; como cancha
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ── Canchas populares ── */
              <div style={{ marginBottom: 8 }}>
                <SectionLabel>Canchas populares</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sortedClubGroups.map((group) => renderClubItem(group))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Search bar moved to top */}
    </div>
  )
}
