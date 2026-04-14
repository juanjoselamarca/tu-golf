'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { Flag, Users } from '@/components/icons'

interface Course { slope_rating: number; course_rating: number; par_total: number; nombre?: string }
interface Tournament {
  id: string; name: string; slug: string; course_id: string; status: string;
  courses: Course; course_name?: string; tees?: string; hole_count?: number;
  date_start?: string; total_rounds?: number
}
interface Category { id: string; name: string; handicap_min: number | null; handicap_max: number | null }
interface Profile  { id: string; name: string; email: string; indice: number | null }
export interface Player {
  id: string
  user_id?: string
  handicap_at_registration: number | null
  status: string
  profiles: { name: string; email: string; indice: number | null }
  categories: { name: string } | null
}

interface TournamentGroup {
  id: string
  name: string
  tee_time: string | null
  sort_order: number
  ronda_libre_id: string | null
  players: Array<{ id: string; player_id: string; playerName: string }>
}

interface Props {
  tournament:     Tournament & { codigo?: string | null }
  initialPlayers: Player[]
  categories:     Category[]
}

function calcCourseHandicap(indice: number, slope: number, rating: number, par: number) {
  return Math.round(indice * (slope / 113) + (rating - par))
}

const inputStyle: React.CSSProperties = {
  background: '#f8f9fa',
  border: '1px solid #e2e8f0',
  color: '#1a1a2e',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 200ms',
  boxSizing: 'border-box',
}

export default function JugadoresPanel({ tournament, initialPlayers, categories }: Props) {
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { showError, showWarning, showSuccess } = useToast()

  const [players,         setPlayers]         = useState<Player[]>(initialPlayers)
  const [codeCopied,      setCodeCopied]      = useState(false)
  const [linkCopied,      setLinkCopied]      = useState(false)
  const [search,          setSearch]          = useState('')
  const [results,         setResults]         = useState<Profile[]>([])
  const [showResults,     setShowResults]     = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [selectedCat,     setSelectedCat]     = useState(categories[0]?.id || '')
  const [loading,         setLoading]         = useState(false)
  const [starting,        setStarting]        = useState(false)
  const [closing,         setClosing]         = useState(false)
  const [tournamentStatus, setTournamentStatus] = useState(tournament.status)

  // Groups state
  const [groups, setGroups] = useState<TournamentGroup[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupTeeTime, setNewGroupTeeTime] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [allRoundsClosed, setAllRoundsClosed] = useState(false)
  const [teeStartTime, setTeeStartTime] = useState('08:00')
  const [teeInterval, setTeeInterval] = useState(10)
  const [generatingTees, setGeneratingTees] = useState(false)

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
        'id, user_id, handicap_at_registration, status, profiles(name, email, indice), categories(name)'
      )
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: true })
    setPlayers((data as unknown as Player[]) || [])
  }

  // Fetch groups with their players
  const fetchGroups = async () => {
    const supabase = createClient()
    const { data: gData } = await supabase
      .from('tournament_groups')
      .select('id, name, tee_time, sort_order, ronda_libre_id, tournament_group_players(id, player_id)')
      .eq('tournament_id', tournament.id)
      .order('sort_order')

    if (!gData) { setGroups([]); return }

    const mapped: TournamentGroup[] = gData.map((g: Record<string, unknown>) => {
      const gPlayers = (g.tournament_group_players as Array<{ id: string; player_id: string }>) || []
      return {
        id: g.id as string,
        name: g.name as string,
        tee_time: g.tee_time as string | null,
        sort_order: (g.sort_order as number) || 0,
        ronda_libre_id: g.ronda_libre_id as string | null,
        players: gPlayers.map((gp) => {
          const p = players.find((pl) => pl.id === gp.player_id)
          return { id: gp.id, player_id: gp.player_id, playerName: p?.profiles?.name || 'Jugador' }
        }),
      }
    })
    setGroups(mapped)
  }

  // Check if all rounds in the latest round_number are closed
  const checkAllRoundsClosed = async () => {
    const supabase = createClient()
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, status, round_number')
      .eq('tournament_id', tournament.id)
    if (!rounds || rounds.length === 0) { setAllRoundsClosed(false); return }
    const maxRound = Math.max(...rounds.map((r: { round_number: number }) => r.round_number || 1))
    const lastRoundEntries = rounds.filter((r: { round_number: number }) => (r.round_number || 1) === maxRound)
    setAllRoundsClosed(lastRoundEntries.length > 0 && lastRoundEntries.every((r: { status: string }) => r.status === 'closed'))
  }

  // Initial load of groups + round status
  useEffect(() => {
    fetchGroups()
    if (tournamentStatus === 'in_progress') {
      checkAllRoundsClosed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, tournamentStatus])

  // Create a new group
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { showWarning('Nombre requerido', 'Escribe un nombre para el grupo.'); return }
    setCreatingGroup(true)
    const supabase = createClient()
    // Convert time string "HH:MM" to full TIMESTAMPTZ using tournament date
    let teeTimeValue: string | null = null
    if (newGroupTeeTime) {
      const dateBase = tournament.date_start || new Date().toISOString().split('T')[0]
      teeTimeValue = `${dateBase}T${newGroupTeeTime}:00`
    }

    const { error } = await supabase.from('tournament_groups').insert({
      tournament_id: tournament.id,
      name: newGroupName.trim(),
      tee_time: teeTimeValue,
      sort_order: groups.length,
    })
    if (error) {
      showError('Error al crear grupo', error.message)
    } else {
      showSuccess('Grupo creado', `"${newGroupName.trim()}" agregado.`)
      setNewGroupName('')
      setNewGroupTeeTime('')
      await fetchGroups()
    }
    setCreatingGroup(false)
  }

  // Delete a group
  const handleDeleteGroup = async (groupId: string) => {
    const supabase = createClient()
    await supabase.from('tournament_groups').delete().eq('id', groupId)
    await fetchGroups()
  }

  // Auto-generate tee times for all groups
  const handleGenerateTeeTimes = async () => {
    if (groups.length === 0) { showWarning('Sin grupos', 'Crea grupos primero antes de generar horarios.'); return }
    setGeneratingTees(true)
    const supabase = createClient()
    const dateBase = tournament.date_start || new Date().toISOString().split('T')[0]
    const [startH, startM] = teeStartTime.split(':').map(Number)

    for (let i = 0; i < groups.length; i++) {
      const totalMinutes = startH * 60 + startM + (i * teeInterval)
      const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
      const m = (totalMinutes % 60).toString().padStart(2, '0')
      const teeTimeValue = `${dateBase}T${h}:${m}:00`

      await supabase
        .from('tournament_groups')
        .update({ tee_time: teeTimeValue })
        .eq('id', groups[i].id)
    }

    await fetchGroups()
    setGeneratingTees(false)
    showSuccess('Horarios generados', `${groups.length} grupos con horarios desde las ${teeStartTime} cada ${teeInterval} min.`)
  }

  // Assign player to group
  const handleAssignPlayer = async (playerId: string, groupId: string) => {
    const supabase = createClient()
    // Remove from any current group first
    await supabase.from('tournament_group_players').delete().eq('player_id', playerId)
    if (groupId) {
      const { error } = await supabase.from('tournament_group_players').insert({
        group_id: groupId,
        player_id: playerId,
      })
      if (error && !error.message.includes('duplicate')) {
        showError('Error', 'No se pudo asignar al grupo.')
        return
      }
    }
    await fetchGroups()
  }

  // Get the group a player belongs to
  const getPlayerGroupId = (playerId: string): string => {
    for (const g of groups) {
      if (g.players.some((gp) => gp.player_id === playerId)) return g.id
    }
    return ''
  }

  const handleInscribir = async () => {
    if (!selectedProfile) { showWarning('Jugador requerido', 'Busca y selecciona un jugador primero.'); return }

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

    // Auto-assign default category if none selected
    const catId = selectedCat || categories[0]?.id || null

    const { data: player, error: pErr } = await supabase
      .from('players')
      .insert({
        tournament_id:           tournament.id,
        user_id:                 selectedProfile.id,
        category_id:             catId,
        handicap_at_registration: courseHandicap,
        status:                  'approved',
      })
      .select()
      .single()

    if (pErr || !player) {
      const msg = pErr?.message?.toLowerCase() || ''
      if (msg.includes('duplicate') || msg.includes('unique')) {
        showError('Jugador duplicado', 'Este jugador ya está inscrito en el torneo.')
      } else if (msg.includes('permission') || msg.includes('policy') || pErr?.code === '42501') {
        showError('Sin permisos', 'No tienes permisos para inscribir jugadores. Verifica que eres el organizador.')
      } else {
        showError('Error al inscribir', `No pudimos inscribir al jugador: ${pErr?.message || 'error desconocido'}`)
      }
      setLoading(false)
      return
    }

    const { error: rErr } = await supabase.from('rounds').insert({
      tournament_id: tournament.id,
      player_id:     player.id,
      status:        'in_progress',
    })
    if (rErr) {
      console.warn('[rounds] Error al crear ronda:', rErr.message)
    }

    const playerName = selectedProfile.name
    setSelectedProfile(null)
    setSearch('')
    setResults([])
    await fetchPlayers()
    setLoading(false)
    showSuccess('¡Jugador inscrito!', `${playerName} fue agregado al torneo correctamente.`)
  }

  const handleDesinscribir = async (playerId: string) => {
    const playerName = players.find(p => p.id === playerId)?.profiles?.name || 'este jugador'

    if (tournamentStatus === 'in_progress') {
      if (!window.confirm(`Retirar a ${playerName}? Se borrarán todos sus scores del torneo.`)) return
      // Use API to cascade delete rounds/scores
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw_player', tournament_id: tournament.id, player_id: playerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        showError('Error', data.error || 'No se pudo retirar al jugador.')
        return
      }
      showSuccess('Jugador retirado', `${playerName} fue retirado del torneo.`)
    } else {
      const supabase = createClient()
      await supabase.from('players').delete().eq('id', playerId)
    }
    await fetchPlayers()
  }

  const handleCancelTournament = async () => {
    if (!window.confirm('Cancelar y eliminar este torneo? Esta acción no se puede deshacer.')) return
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_tournament', tournament_id: tournament.id }),
    })
    if (!res.ok) {
      const data = await res.json()
      showError('Error', data.error || 'No se pudo cancelar el torneo.')
      return
    }
    showSuccess('Torneo eliminado', 'El torneo fue eliminado.')
    router.push('/dashboard')
  }

  const handleStartTournament = async () => {
    if (players.length < 1) return
    if (!window.confirm(`Iniciar torneo con ${players.length} jugador${players.length !== 1 ? 'es' : ''}? Se crearán las rondas para todos.`)) return
    setStarting(true)
    const supabase = createClient()

    // 1. Update tournament status
    const { error: statusErr } = await supabase
      .from('tournaments')
      .update({ status: 'in_progress' })
      .eq('id', tournament.id)

    if (statusErr) {
      showError('Error', 'No se pudo iniciar el torneo.')
      setStarting(false)
      return
    }

    // 2. Create round_number=1 for all approved players who don't already have one
    const { data: existingRounds } = await supabase
      .from('rounds')
      .select('player_id')
      .eq('tournament_id', tournament.id)
      .eq('round_number', 1)

    const existingPlayerIds = new Set((existingRounds || []).map((r: { player_id: string }) => r.player_id))
    const approvedPlayers = players.filter((p) => p.status === 'approved' && !existingPlayerIds.has(p.id))

    if (approvedPlayers.length > 0) {
      const roundInserts = approvedPlayers.map((p) => ({
        tournament_id: tournament.id,
        player_id: p.id,
        round_number: 1,
        status: 'in_progress',
      }))
      const { error: roundErr } = await supabase.from('rounds').insert(roundInserts)
      if (roundErr) {
        console.warn('[rounds] Error al crear rondas:', roundErr.message)
      }
    }

    // 3. Create rondas_libres for groups that don't have one yet
    const groupsWithoutRonda = groups.filter((g) => !g.ronda_libre_id && g.players.length > 0)
    for (const group of groupsWithoutRonda) {
      const codigo = 'T' + Math.random().toString(36).substring(2, 8).toUpperCase()
      const courseName = (tournament.courses as unknown as { nombre: string })?.nombre || tournament.course_name || 'Cancha'

      const { data: ronda, error: rondaErr } = await supabase
        .from('rondas_libres')
        .insert({
          codigo,
          creador_id: (await supabase.auth.getUser()).data.user?.id,
          course_id: tournament.course_id || null,
          course_name: courseName,
          tees: tournament.tees || 'blanco',
          holes: tournament.hole_count || 18,
          fecha: tournament.date_start || new Date().toISOString().split('T')[0],
          estado: 'en_curso',
        })
        .select('id')
        .single()

      if (rondaErr || !ronda) {
        console.warn('[rondas_libres] Error para grupo', group.name, rondaErr?.message)
        continue
      }

      // Link group to ronda_libre
      await supabase.from('tournament_groups').update({ ronda_libre_id: ronda.id }).eq('id', group.id)

      // Create ronda_libre_jugadores for each player in the group
      for (const gp of group.players) {
        const player = players.find((p) => p.id === gp.player_id)
        if (!player) continue

        const { data: jugador } = await supabase
          .from('ronda_libre_jugadores')
          .insert({
            ronda_id: ronda.id,
            nombre: player.profiles?.name || 'Jugador',
            user_id: player.user_id || null,
            scores: {},
          })
          .select('id')
          .single()

        if (jugador) {
          await supabase
            .from('tournament_group_players')
            .update({ jugador_ronda_id: jugador.id })
            .eq('group_id', group.id)
            .eq('player_id', gp.player_id)
        }
      }
    }

    setTournamentStatus('in_progress')
    showSuccess('Torneo iniciado', 'Las rondas fueron creadas. Los jugadores ya pueden cargar scores.')
    setStarting(false)
    router.push(`/organizador/${tournament.slug}/scoring`)
  }

  const handleCloseTournament = async () => {
    if (!window.confirm('Cerrar el torneo? Los resultados seran definitivos.')) return
    setClosing(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('tournaments')
      .update({ status: 'closed' })
      .eq('id', tournament.id)

    if (error) {
      showError('Error', 'No se pudo cerrar el torneo.')
    } else {
      setTournamentStatus('closed')
      showSuccess('Torneo cerrado', 'Los resultados son definitivos.')
    }
    setClosing(false)
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', paddingBottom: '100px' }}>

      {/* Header */}
      <div style={{ background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '24px 32px' }}>
        <Link href="/dashboard" style={{ color: '#94a8c0', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '12px' }}>
          ← Volver al dashboard
        </Link>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: '#edeae4', margin: '0 0 8px' }}>
          {tournament.name}
        </h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {tournament.courses && (
            <span style={{ background: 'rgba(196,153,42,0.12)', color: '#c4992a', border: '1px solid rgba(196,153,42,0.3)', padding: '3px 10px', borderRadius: '20px', fontSize: '12px' }}>
              <Flag size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{(tournament.courses as unknown as { nombre: string }).nombre || 'Cancha'}
            </span>
          )}
          <span style={{
            background: tournamentStatus === 'closed' ? 'rgba(220,38,38,0.15)' : tournamentStatus === 'in_progress' ? 'rgba(34,197,94,0.15)' : 'rgba(26,79,214,0.15)',
            color: tournamentStatus === 'closed' ? '#fca5a5' : tournamentStatus === 'in_progress' ? '#22c55e' : '#7a9ef5',
            border: `1px solid ${tournamentStatus === 'closed' ? 'rgba(220,38,38,0.3)' : tournamentStatus === 'in_progress' ? 'rgba(34,197,94,0.3)' : 'rgba(26,79,214,0.3)'}`,
            padding: '3px 10px', borderRadius: '20px', fontSize: '12px',
          }}>
            {tournamentStatus === 'closed' ? 'Cerrado' : tournamentStatus === 'in_progress' ? 'En curso' : 'Borrador'}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Tournament invitation card */}
        {tournament.codigo && (
          <div
            style={{
              background: 'rgba(14,28,47,0.92)',
              border: '1px solid rgba(196,153,42,0.3)',
              borderRadius: '14px',
              padding: '24px 28px',
              marginBottom: '24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '12px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
              Invitar jugadores
            </div>

            {/* Copy link button - primary action */}
            <button
              type="button"
              onClick={() => {
                const link = `${window.location.origin}/torneo/${tournament.slug}/unirse`
                navigator.clipboard.writeText(link).then(() => {
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2500)
                })
              }}
              style={{
                background: linkCopied ? 'rgba(34,197,94,0.15)' : '#c4992a',
                border: linkCopied ? '1px solid rgba(34,197,94,0.4)' : '1px solid #c4992a',
                color: linkCopied ? '#22c55e' : '#070d18',
                padding: '12px 28px',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 200ms',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              {linkCopied ? 'Link copiado!' : 'Copiar link de invitacion'}
            </button>

            {/* Code reference - secondary */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: '#94a8c0' }}>Codigo:</span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#c4992a',
                  letterSpacing: '0.1em',
                }}
              >
                {tournament.codigo}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(tournament.codigo!).then(() => {
                    setCodeCopied(true)
                    setTimeout(() => setCodeCopied(false), 2000)
                  })
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: codeCopied ? '#22c55e' : '#94a8c0',
                  padding: '2px 6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                {codeCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

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
              <label style={{ display: 'block', fontSize: '12px', color: '#94a8c0', marginBottom: '6px' }}>Jugador</label>
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
                  ✓ {selectedProfile.name}{selectedProfile.indice != null ? ` — Hcp ${Number(selectedProfile.indice).toFixed(1)}` : ''}
                </div>
              )}
              {showResults && results.length > 0 && !selectedProfile && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#ffffff', border: '1px solid rgba(196,153,42,0.2)', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', zIndex: 50 }}>
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProfile(p)
                        setSearch(p.name)
                        setShowResults(false)
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,153,42,0.08)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                    >
                      <div style={{ color: '#1a1a2e', fontSize: '13px', fontWeight: 500 }}>{p.name}</div>
                      <div style={{ color: '#4a5568', fontSize: '11px' }}>
                        {p.email}
                        {p.indice != null && <span> · Índice {p.indice}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
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

        {/* Groups section */}
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
            Grupos de salida ({groups.length})
          </h2>

          {/* Create group form */}
          {tournamentStatus === 'draft' && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a8c0', marginBottom: '6px' }}>Nombre del grupo</label>
                <input
                  type="text"
                  placeholder="Ej: Grupo 1"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: '0 1 160px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a8c0', marginBottom: '6px' }}>Hora de salida (opc.)</label>
                <input
                  type="time"
                  value={newGroupTeeTime}
                  onChange={(e) => setNewGroupTeeTime(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={creatingGroup || !newGroupName.trim()}
                style={{
                  background: '#1a4fd6',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '14px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: creatingGroup || !newGroupName.trim() ? 'not-allowed' : 'pointer',
                  opacity: creatingGroup || !newGroupName.trim() ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {creatingGroup ? '...' : 'Crear grupo'}
              </button>
            </div>
          )}

          {/* Generate tee times */}
          {tournamentStatus === 'draft' && groups.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px', padding: '16px', background: 'rgba(7,13,24,0.4)', borderRadius: '10px', border: '1px solid rgba(122,143,168,0.1)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a8c0', marginBottom: '6px' }}>Hora inicio</label>
                <input
                  type="time"
                  value={teeStartTime}
                  onChange={(e) => setTeeStartTime(e.target.value)}
                  style={{ ...inputStyle, width: '120px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a8c0', marginBottom: '6px' }}>Intervalo (min)</label>
                <input
                  type="number"
                  value={teeInterval}
                  onChange={(e) => setTeeInterval(Math.max(1, parseInt(e.target.value) || 10))}
                  min={1}
                  max={30}
                  style={{ ...inputStyle, width: '80px' }}
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateTeeTimes}
                disabled={generatingTees}
                style={{
                  background: 'rgba(196,153,42,0.15)',
                  border: '1px solid rgba(196,153,42,0.4)',
                  color: '#c4992a',
                  fontWeight: 600,
                  fontSize: '13px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  cursor: generatingTees ? 'not-allowed' : 'pointer',
                  opacity: generatingTees ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {generatingTees ? 'Generando...' : `Generar horarios (${groups.length} grupos)`}
              </button>
            </div>
          )}

          {/* Group cards */}
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#94a8c0', fontSize: '13px' }}>
              Sin grupos aún. Crea grupos y asigna jugadores.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
              {groups.map((g) => (
                <div
                  key={g.id}
                  style={{
                    background: 'rgba(7,13,24,0.6)',
                    border: '1px solid rgba(122,143,168,0.2)',
                    borderRadius: '10px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#edeae4' }}>{g.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {g.tee_time && (
                        <span style={{ fontSize: '12px', color: '#c4992a', fontFamily: 'monospace' }}>
                          {g.tee_time.includes('T') ? new Date(g.tee_time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : g.tee_time}
                        </span>
                      )}
                      {tournamentStatus === 'draft' && (
                        <button
                          onClick={() => handleDeleteGroup(g.id)}
                          style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}
                        >
                          X
                        </button>
                      )}
                    </div>
                  </div>
                  {g.players.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94a8c0', fontStyle: 'italic' }}>Sin jugadores</div>
                  ) : (
                    g.players.map((gp) => (
                      <div key={gp.id} style={{ fontSize: '13px', color: '#edeae4', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {gp.playerName}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
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
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a8c0' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Users size={40} strokeWidth={1.5} /></div>
              <div style={{ fontSize: '16px', marginBottom: '6px', color: '#edeae4' }}>Sin jugadores aún</div>
              <div style={{ fontSize: '13px' }}>Busca y añade jugadores usando el formulario de arriba.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['#', 'Nombre', 'Índice', 'Course HCP', 'Categoría', 'Grupo', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 150ms' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', color: '#94a8c0', fontSize: '14px' }}>{i + 1}</td>
                      <td style={{ padding: '12px 16px', color: '#edeae4', fontSize: '14px', fontWeight: 500 }}>{p.profiles?.name || '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#94a8c0', fontSize: '14px' }}>{p.profiles?.indice ?? '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#c4992a', fontSize: '14px', fontWeight: 600 }}>{p.handicap_at_registration ?? '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#94a8c0', fontSize: '13px' }}>{p.categories?.name || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {groups.length > 0 ? (
                          <select
                            value={getPlayerGroupId(p.id)}
                            onChange={(e) => handleAssignPlayer(p.id, e.target.value)}
                            style={{ ...inputStyle, fontSize: '12px', padding: '4px 6px', minWidth: '100px' }}
                          >
                            <option value="">Sin grupo</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: '#94a8c0', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {tournamentStatus !== 'closed' && (
                          <button
                            onClick={() => handleDesinscribir(p.id)}
                            style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(7,13,24,0.96)', borderTop: '1px solid rgba(196,153,42,0.2)', padding: '16px 24px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', display: 'flex', justifyContent: 'center', gap: '12px', zIndex: 50 }}>
        {tournamentStatus === 'draft' && (
          <>
            <button
              onClick={handleCancelTournament}
              style={{
                background: 'rgba(220,38,38,0.1)',
                color: '#fca5a5',
                fontWeight: 600,
                fontSize: '14px',
                padding: '14px 24px',
                borderRadius: '8px',
                border: '1px solid rgba(220,38,38,0.25)',
                cursor: 'pointer',
                transition: 'all 200ms',
              }}
            >
              Eliminar torneo
            </button>
            <button
              onClick={handleStartTournament}
              disabled={players.length < 1 || starting}
              style={{
                background: players.length >= 1 ? '#c4992a' : 'rgba(122,143,168,0.2)',
                color: players.length >= 1 ? '#1a1a2e' : '#94a8c0',
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
              {starting ? 'Iniciando...' : `Iniciar torneo (${players.length} jugador${players.length !== 1 ? 'es' : ''})`}
            </button>
          </>
        )}

        {tournamentStatus === 'in_progress' && (
          <>
            <button
              onClick={() => router.push(`/organizador/${tournament.slug}/salida`)}
              style={{
                background: 'rgba(196,153,42,0.12)',
                color: '#c4992a',
                fontWeight: 600,
                fontSize: '14px',
                padding: '14px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(196,153,42,0.3)',
                cursor: 'pointer',
                transition: 'all 200ms',
              }}
            >
              Hoja de salida
            </button>
            <button
              onClick={() => router.push(`/organizador/${tournament.slug}/scoring`)}
              style={{
                background: '#1a4fd6',
                color: 'white',
                fontWeight: 700,
                fontSize: '16px',
                padding: '14px 30px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 200ms',
              }}
            >
              Ver scoring
            </button>
            {allRoundsClosed && (
              <button
                onClick={handleCloseTournament}
                disabled={closing}
                style={{
                  background: 'rgba(220,38,38,0.15)',
                  color: '#fca5a5',
                  fontWeight: 700,
                  fontSize: '16px',
                  padding: '14px 30px',
                  borderRadius: '8px',
                  border: '1px solid rgba(220,38,38,0.3)',
                  cursor: closing ? 'not-allowed' : 'pointer',
                  transition: 'all 200ms',
                }}
              >
                {closing ? 'Cerrando...' : 'Cerrar torneo'}
              </button>
            )}
          </>
        )}

        {tournamentStatus === 'closed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#94a8c0', fontSize: '14px', fontWeight: 600 }}>
              Torneo cerrado — Resultados definitivos
            </span>
            <button
              onClick={() => window.open(`/torneo/${tournament.slug}`, '_blank')}
              style={{
                background: '#c4992a',
                color: '#1a1a2e',
                fontWeight: 700,
                fontSize: '14px',
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Ver leaderboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
