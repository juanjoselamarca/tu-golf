'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'

interface Course { slope_rating: number; course_rating: number; par_total: number }
interface Tournament { id: string; name: string; slug: string; course_id: string; status: string; courses: Course }
interface Category { id: string; name: string; handicap_min: number | null; handicap_max: number | null }
interface Flight   { id: string; name: string; tee_time: string | null }
interface Profile  { id: string; name: string; email: string; indice: number | null }
export interface Player {
  id: string
  handicap_at_registration: number | null
  status: string
  profiles: { name: string; email: string; indice: number | null }
  categories: { name: string } | null
  flights: { name: string } | null
}

interface Props {
  tournament:     Tournament
  initialPlayers: Player[]
  categories:     Category[]
  flights:        Flight[]
}

function calcCourseHandicap(indice: number, slope: number, rating: number, par: number) {
  return Math.round(indice * (slope / 113) + (rating - par))
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(7,13,24,0.6)',
  border: '1px solid rgba(122,143,168,0.3)',
  color: '#edeae4',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 200ms',
  boxSizing: 'border-box',
}

export default function JugadoresPanel({ tournament, initialPlayers, categories, flights }: Props) {
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { showError, showWarning, showSuccess } = useToast()

  const [players,         setPlayers]         = useState<Player[]>(initialPlayers)
  const [search,          setSearch]          = useState('')
  const [results,         setResults]         = useState<Profile[]>([])
  const [showResults,     setShowResults]     = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [selectedCat,     setSelectedCat]     = useState(categories[0]?.id || '')
  const [selectedFlight,  setSelectedFlight]  = useState(flights[0]?.id || '')
  const [loading,         setLoading]         = useState(false)
  const [starting,        setStarting]        = useState(false)

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

  const fetchPlayers = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('players')
      .select(
        'id, handicap_at_registration, status, profiles(name, email, indice), categories(name), flights(name)'
      )
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: true })
    setPlayers((data as unknown as Player[]) || [])
  }

  const handleInscribir = async () => {
    if (!selectedProfile) { showWarning('Selecciona un jugador', 'Busca y selecciona un jugador antes de inscribir.'); return }
    if (!selectedCat)     { showWarning('Categoría requerida', 'Selecciona la categoría del jugador.'); return }
    if (!selectedFlight)  { showWarning('Flight requerido', 'Selecciona el flight del jugador.'); return }

    setLoading(true)
    const supabase = createClient()
    const course = tournament.courses

    const courseHandicap =
      selectedProfile.indice != null && course
        ? calcCourseHandicap(
            selectedProfile.indice,
            course.slope_rating,
            course.course_rating,
            course.par_total
          )
        : null

    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({
        tournament_id:           tournament.id,
        user_id:                 selectedProfile.id,
        category_id:             selectedCat,
        flight_id:               selectedFlight,
        handicap_at_registration: courseHandicap,
        status:                  'registered',
      })
      .select()
      .single()

    if (pErr || !player) {
      const isDuplicate = pErr?.message?.toLowerCase().includes('duplicate') || pErr?.message?.toLowerCase().includes('unique')
      if (isDuplicate) {
        showError('Jugador duplicado', 'Este jugador ya está inscrito en el torneo.')
      } else {
        showError('Error al inscribir', 'No pudimos inscribir al jugador. Intenta nuevamente.')
      }
      setLoading(false)
      return
    }

    await supabase.from('rounds').insert({
      tournament_id: tournament.id,
      player_id:     player.id,
      status:        'not_started',
    })

    const playerName = selectedProfile.name
    setSelectedProfile(null)
    setSearch('')
    setResults([])
    await fetchPlayers()
    setLoading(false)
    showSuccess('¡Jugador inscrito!', `${playerName} fue agregado al torneo correctamente.`)
  }

  const handleDesinscribir = async (playerId: string) => {
    const supabase = createClient()
    await supabase.from('players').delete().eq('id', playerId)
    await fetchPlayers()
  }

  const handleStartTournament = async () => {
    if (players.length < 1) return
    setStarting(true)
    const supabase = createClient()
    await supabase.from('tournaments').update({ status: 'active' }).eq('id', tournament.id)
    router.push(`/organizador/${tournament.slug}/scoring`)
  }

  return (
    <div style={{ background: '#070d18', minHeight: '100vh', paddingBottom: '100px' }}>

      {/* Header */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '24px 32px' }}>
        <Link href="/dashboard" style={{ color: '#7a8fa8', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '12px' }}>
          ← Volver al dashboard
        </Link>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#edeae4', margin: '0 0 8px' }}>
          {tournament.name}
        </h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {tournament.courses && (
            <span style={{ background: 'rgba(196,153,42,0.12)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)', padding: '3px 10px', borderRadius: '20px', fontSize: '12px' }}>
              ⛳ {(tournament.courses as unknown as { nombre: string }).nombre || 'Cancha'}
            </span>
          )}
          <span style={{ background: 'rgba(26,79,214,0.15)', color: '#7a9ef5', border: '1px solid rgba(26,79,214,0.3)', padding: '3px 10px', borderRadius: '20px', fontSize: '12px' }}>
            {tournament.status === 'draft' ? '📋 Borrador' : '🟢 Activo'}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Inscribir jugador */}
        <div
          style={{
            background: 'rgba(14,28,47,0.92)',
            border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '14px',
            padding: '28px',
            marginBottom: '32px',
          }}
        >
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', margin: '0 0 20px' }}>
            Inscribir jugador
          </h2>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>

            {/* Search */}
            <div ref={dropdownRef} style={{ flex: '1 1 220px', position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '6px' }}>Jugador</label>
              <input
                type="text"
                placeholder="Buscar por nombre o email..."
                value={selectedProfile ? selectedProfile.name : search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelectedProfile(null)
                }}
                style={inputStyle}
                onFocus={() => search && setShowResults(true)}
              />
              {selectedProfile && (
                <div style={{ fontSize: '11px', color: '#c4992a', marginTop: '3px' }}>
                  ✓ {selectedProfile.name} — idx {selectedProfile.indice ?? '—'}
                </div>
              )}
              {showResults && results.length > 0 && !selectedProfile && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', zIndex: 50 }}>
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProfile(p)
                        setSearch(p.name)
                        setShowResults(false)
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                    >
                      <div style={{ color: '#edeae4', fontSize: '13px', fontWeight: 500 }}>{p.name}</div>
                      <div style={{ color: '#7a8fa8', fontSize: '11px' }}>
                        {p.email}
                        {p.indice != null && <span> · Índice {p.indice}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category */}
            <div style={{ flex: '0 1 160px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '6px' }}>Categoría</label>
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Flight */}
            <div style={{ flex: '0 1 160px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#7a8fa8', marginBottom: '6px' }}>Flight</label>
              <select
                value={selectedFlight}
                onChange={(e) => setSelectedFlight(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              >
                {flights.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Button */}
            <button
              type="button"
              onClick={handleInscribir}
              disabled={loading || !selectedProfile}
              style={{
                background: '#1a4fd6',
                color: 'white',
                fontWeight: 600,
                fontSize: '14px',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: loading || !selectedProfile ? 'not-allowed' : 'pointer',
                opacity: loading || !selectedProfile ? 0.6 : 1,
                alignSelf: 'flex-end',
                whiteSpace: 'nowrap',
              }}
            >
              {loading ? '...' : 'Inscribir'}
            </button>
          </div>
        </div>

        {/* Players table */}
        <div
          style={{
            background: 'rgba(14,28,47,0.92)',
            border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: '14px',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', margin: 0 }}>
              Jugadores inscritos ({players.length})
            </h2>
          </div>

          {players.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#7a8fa8' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
              <div style={{ fontSize: '16px', marginBottom: '6px', color: '#edeae4' }}>Sin jugadores aún</div>
              <div style={{ fontSize: '13px' }}>Busca y añade jugadores usando el formulario de arriba.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['#', 'Nombre', 'Índice', 'Course HCP', 'Categoría', 'Flight', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 150ms' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', color: '#7a8fa8', fontSize: '14px' }}>{i + 1}</td>
                      <td style={{ padding: '12px 16px', color: '#edeae4', fontSize: '14px', fontWeight: 500 }}>{p.profiles?.name || '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#7a8fa8', fontSize: '14px' }}>{p.profiles?.indice ?? '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#c4992a', fontSize: '14px', fontWeight: 600 }}>{p.handicap_at_registration ?? '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#7a8fa8', fontSize: '13px' }}>{p.categories?.name || '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#7a8fa8', fontSize: '13px' }}>{p.flights?.name || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={() => handleDesinscribir(p.id)}
                          style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sticky start button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(7,13,24,0.96)', borderTop: '1px solid rgba(196,153,42,0.2)', padding: '16px 24px', display: 'flex', justifyContent: 'center', zIndex: 50 }}>
        <button
          onClick={handleStartTournament}
          disabled={players.length < 1 || starting}
          style={{
            background: players.length >= 1 ? '#c4992a' : 'rgba(122,143,168,0.2)',
            color: players.length >= 1 ? '#070d18' : '#7a8fa8',
            fontWeight: 700,
            fontSize: '16px',
            padding: '14px 40px',
            borderRadius: '8px',
            border: 'none',
            cursor: players.length < 1 || starting ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
            minWidth: '280px',
          }}
        >
          {starting ? 'Iniciando...' : `Iniciar torneo → (${players.length} jugador${players.length !== 1 ? 'es' : ''})`}
        </button>
      </div>
    </div>
  )
}
