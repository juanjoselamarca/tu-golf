'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Flag } from '@/components/icons'
import { useTees } from './hooks/useTees'
import { useProfileSearch } from './hooks/useProfileSearch'
import { usePlayers } from './hooks/usePlayers'
import { useGroups } from './hooks/useGroups'
import { useTournamentLifecycle } from './hooks/useTournamentLifecycle'
import { TeesAssignmentSection } from './components/TeesAssignmentSection'
import { TournamentInvitationCard } from './components/TournamentInvitationCard'
import { InscribirPlayerForm, type InscribirMode } from './components/InscribirPlayerForm'
import { GroupsSection } from './components/GroupsSection'
import { PlayersTable } from './components/PlayersTable'
import { TournamentActionsBar } from './components/TournamentActionsBar'
import { listPlayers, type PlayerRow } from '@/lib/data/tournaments/players'

import type { Tournament, Category, Player } from './types'
import { isTeamFormat } from './types'

export type { Player } from './types'

interface Props {
  tournament:     Tournament & { codigo?: string | null }
  initialPlayers: Player[]
  categories:     Category[]
}

export default function JugadoresPanel({ tournament, initialPlayers, categories }: Props) {
  const {
    dropdownRef, search, setSearch, results,
    showResults, setShowResults, selectedProfile, setSelectedProfile,
    reset: resetSearch,
  } = useProfileSearch()

  const [selectedCat] = useState(categories[0]?.id || '')
  const [tournamentStatus, setTournamentStatus] = useState(tournament.status)

  // Inscripción: modo búsqueda de perfil existente vs invitado sin cuenta.
  const [mode, setMode] = useState<InscribirMode>('search')
  const [guestName, setGuestName] = useState('')
  const [guestHcp, setGuestHcp] = useState('')

  const {
    players, setPlayers, loading,
    fetchPlayers, inscribirPlayer, inscribirGuest, withdrawPlayer, disqualifyPlayer,
  } = usePlayers({ tournament, categories, initialPlayers, tournamentStatus })

  const handleInscribir = () => inscribirPlayer(selectedProfile, selectedCat, resetSearch)
  const handleInscribirGuest = () =>
    inscribirGuest(guestName, guestHcp.trim() === '' ? null : Number(guestHcp), selectedCat, () => {
      setGuestName('')
      setGuestHcp('')
    })
  const handleDesinscribir = withdrawPlayer
  const handleDescalificar = disqualifyPlayer

  const {
    groups, newGroupName, setNewGroupName, newGroupTeeTime, setNewGroupTeeTime,
    creatingGroup, teeStartTime, setTeeStartTime, teeInterval, setTeeInterval,
    generatingTees, fetchGroups, handleCreateGroup, handleDeleteGroup,
    handleGenerateTeeTimes, handleAssignPlayer, getPlayerGroupId,
  } = useGroups({ tournament, players })

  const {
    starting, closing, opening, allRoundsClosed,
    checkAllRoundsClosed, handleStartTournament,
    handleOpenInscriptions, handleRevertToDraft,
    handleCancelTournament, handleCloseTournament,
  } = useTournamentLifecycle({ tournament, players, groups, setTournamentStatus })

  // Formato de equipos: el grupo de salida ES el equipo (modelo PM 2026-06-02).
  const teamFormat = isTeamFormat(tournament.format)
  const teamSize = tournament.team_config?.size ?? 2

  // Fetch groups with their players
  // Check if all rounds in the latest round_number are closed
  // Initial load of groups + round status
  useEffect(() => {
    fetchGroups()
    if (tournamentStatus === 'in_progress') {
      checkAllRoundsClosed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, tournamentStatus])

  // ───── Feature bug #6 inbox: asignación manual de tee por jugador ─────
  // El modo manual se persiste en tournaments.tees por el create-tournament route.
  // También aceptamos lectura desde tournament.rounds (Fase 11 futura).
  const teesManualMode =
    tournament.tees === 'manual' ||
    (tournament.rounds ?? []).some((r) => r?.tee_assignment_mode === 'manual')
  const tees = useTees({ slug: tournament.slug, courseId: tournament.course_id })
  const [playersWithTees, setPlayersWithTees] = useState<PlayerRow[]>([])
  useEffect(() => {
    if (!teesManualMode) return
    const supabase = createClient()
    void listPlayers(supabase, tournament.id)
      .then(setPlayersWithTees)
      .catch(() => { /* swallow: motor sigue funcionando con fallback */ })
  }, [teesManualMode, tournament.id, players.length])

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: '100px' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '24px 32px' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none', display: 'inline-block', marginBottom: '12px' }}>
          ← Volver al dashboard
        </Link>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', color: 'var(--text)', margin: '0 0 8px' }}>
          {tournament.name}
        </h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {tournament.courses && (
            <span style={{ background: 'rgba(196,153,42,0.12)', color: 'var(--brand-on-bg)', border: '1px solid var(--border-md)', padding: '3px 10px', borderRadius: '20px', fontSize: '12px' }}>
              <Flag size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{(tournament.courses as unknown as { nombre: string }).nombre || 'Cancha'}
            </span>
          )}
          <span style={{
            background: tournamentStatus === 'closed' ? 'rgba(220,38,38,0.15)' : tournamentStatus === 'in_progress' ? 'rgba(34,197,94,0.15)' : tournamentStatus === 'open' ? 'rgba(196,153,42,0.15)' : 'rgba(26,79,214,0.15)',
            color: tournamentStatus === 'closed' ? '#fca5a5' : tournamentStatus === 'in_progress' ? '#22c55e' : tournamentStatus === 'open' ? '#c4992a' : '#7a9ef5',
            border: `1px solid ${tournamentStatus === 'closed' ? 'rgba(220,38,38,0.3)' : tournamentStatus === 'in_progress' ? 'rgba(34,197,94,0.3)' : tournamentStatus === 'open' ? 'rgba(196,153,42,0.3)' : 'rgba(26,79,214,0.3)'}`,
            padding: '3px 10px', borderRadius: '20px', fontSize: '12px',
          }}>
            {tournamentStatus === 'closed' ? 'Cerrado' : tournamentStatus === 'in_progress' ? 'En curso' : tournamentStatus === 'open' ? 'Inscripciones abiertas' : 'Borrador'}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {tournament.codigo && (
          <TournamentInvitationCard slug={tournament.slug} codigo={tournament.codigo} />
        )}

        <InscribirPlayerForm
          dropdownRef={dropdownRef}
          search={search}
          setSearch={setSearch}
          results={results}
          showResults={showResults}
          setShowResults={setShowResults}
          selectedProfile={selectedProfile}
          setSelectedProfile={setSelectedProfile}
          loading={loading}
          onInscribir={handleInscribir}
          mode={mode}
          setMode={setMode}
          guestName={guestName}
          setGuestName={setGuestName}
          guestHcp={guestHcp}
          setGuestHcp={setGuestHcp}
          onInscribirGuest={handleInscribirGuest}
        />

        <GroupsSection
          tournamentStatus={tournamentStatus}
          groups={groups}
          newGroupName={newGroupName}
          setNewGroupName={setNewGroupName}
          newGroupTeeTime={newGroupTeeTime}
          setNewGroupTeeTime={setNewGroupTeeTime}
          creatingGroup={creatingGroup}
          onCreateGroup={handleCreateGroup}
          teeStartTime={teeStartTime}
          setTeeStartTime={setTeeStartTime}
          teeInterval={teeInterval}
          setTeeInterval={setTeeInterval}
          generatingTees={generatingTees}
          onGenerateTeeTimes={handleGenerateTeeTimes}
          onDeleteGroup={handleDeleteGroup}
          isTeam={teamFormat}
          teamSize={teamSize}
        />

        <PlayersTable
          players={players}
          groups={groups}
          tournamentStatus={tournamentStatus}
          getPlayerGroupId={getPlayerGroupId}
          onAssignPlayer={handleAssignPlayer}
          onWithdraw={handleDesinscribir}
          onDisqualify={handleDescalificar}
        />
      </div>

      <TournamentActionsBar
        tournamentStatus={tournamentStatus}
        slug={tournament.slug}
        playersCount={players.length}
        starting={starting}
        closing={closing}
        opening={opening}
        allRoundsClosed={allRoundsClosed}
        onStart={handleStartTournament}
        onOpenInscriptions={handleOpenInscriptions}
        onRevertToDraft={handleRevertToDraft}
        onCancel={handleCancelTournament}
        onClose={handleCloseTournament}
      />

      {/* Bug #6 inbox: asignación manual de tee por jugador */}
      {teesManualMode && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
          <TeesAssignmentSection
            players={playersWithTees}
            courseTees={tees.courseTees}
            // tournaments.tees guarda 'per_player'|'mixed'|'manual' (no un nombre de tee).
            // Por eso pasamos null acá — el fallback efectivo se resuelve via category
            // o queda en source='none' (motor decide).
            tournamentTeesGlobal={null}
            loading={tees.loading}
            errors={tees.errors}
            onAssign={async (playerId, teeId) => {
              try {
                await tees.assignTee(playerId, teeId)
                const supabase = createClient()
                const fresh = await listPlayers(supabase, tournament.id)
                setPlayersWithTees(fresh)
              } catch { /* el useTees ya populated errors map */ }
            }}
          />
        </div>
      )}
    </div>
  )
}
