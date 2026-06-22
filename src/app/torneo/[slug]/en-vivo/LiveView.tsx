'use client'

// src/app/torneo/[slug]/en-vivo/LiveView.tsx
// Cliente raiz del Live polimorfico. Orquesta:
//   - Filtros (categoria, grupo, "solo mi grupo")
//   - Tabs por ronda
//   - TV mode (toggle + autoswitch de categoria)
//   - Switch de sub-componente segun tournament.format
//
// Los datos finales (players/teams/matches) vienen del server component como props.
// useLiveScores aqui se usa SOLO para obtener lastUpdate del polling (el agregado
// player-level full vive en el server por simplicidad MVP).

import { useMemo, useState } from 'react'
import { isTeamFormat } from '@/golf/formats'
import type { LivePlayer, LiveTeam, LiveMatch, LiveTournament } from './types'
import { useLiveScores } from './use-live-scores'
import LiveHeader from './LiveHeader'
import LiveTabs, { type LiveTabValue } from './LiveTabs'
import LiveFilterBar from './LiveFilterBar'
import TVMode from './TVMode'
import IndividualLeaderboard from './formats/IndividualLeaderboard'
import TeamLeaderboard from './formats/TeamLeaderboard'
import MatchPlayHeadToHead from './formats/MatchPlayHeadToHead'
import MatchPlayBracket from './formats/MatchPlayBracket'

// Tipo extendido local para campos opcionales que viven en BD pero no en types.ts (no podemos tocarlo en este wave).
type ExtendedTournament = LiveTournament & {
  bracket_mode?: 'single_elimination' | 'round_robin' | 'one_vs_one' | null
}
type ExtendedPlayer = LivePlayer & {
  group_id?: string | null
  category_id?: string | null
}
type ExtendedTeam = LiveTeam & {
  group_id?: string | null
  category_id?: string | null
}
type ExtendedMatch = LiveMatch & {
  category_id?: string | null
}

export interface LiveViewProps {
  tournament: ExtendedTournament
  players: ExtendedPlayer[]
  teams?: ExtendedTeam[]
  matches?: ExtendedMatch[]
  categories: Array<{ id: string; name: string }>
  groups: Array<{ id: string; name: string }>
  /** Si el viewer es uno de los players, su player.id. Habilita "Solo mi grupo". */
  initialUserId?: string
}

interface PlayerFilters {
  categoryFilter: string | null
  groupFilter: string | null
  myViewEnabled: boolean
  userId?: string
}

function applyFilters(players: ExtendedPlayer[], f: PlayerFilters): ExtendedPlayer[] {
  let out = players
  if (f.categoryFilter) {
    out = out.filter((p) => p.category_id === f.categoryFilter)
  }
  if (f.groupFilter) {
    out = out.filter((p) => p.group_id === f.groupFilter)
  }
  if (f.myViewEnabled && f.userId) {
    const me = players.find((p) => p.id === f.userId)
    if (me?.group_id) {
      out = out.filter((p) => p.group_id === me.group_id)
    }
  }
  return out
}

function applyFiltersTeams(
  teams: ExtendedTeam[],
  f: { categoryFilter: string | null; groupFilter: string | null }
): ExtendedTeam[] {
  let out = teams
  if (f.categoryFilter) out = out.filter((t) => t.category_id === f.categoryFilter)
  if (f.groupFilter) out = out.filter((t) => t.group_id === f.groupFilter)
  return out
}

function applyFiltersMatches(
  matches: ExtendedMatch[],
  f: { categoryFilter: string | null }
): ExtendedMatch[] {
  if (!f.categoryFilter) return matches
  return matches.filter((m) => m.category_id === f.categoryFilter)
}

export default function LiveView({
  tournament,
  players,
  teams = [],
  matches = [],
  categories,
  groups,
  initialUserId,
}: LiveViewProps) {
  const [selectedRound, setSelectedRound] = useState<LiveTabValue>('cumulative')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [myViewEnabled, setMyViewEnabled] = useState<boolean>(false)
  const [tvMode, setTvMode] = useState<boolean>(false)

  // selectedRound se preserva para cuando agreguemos slicing por ronda (Wave 3 tanda 2).
  // Por ahora los datos llegan ya agregados desde el server component.
  void selectedRound

  const { lastUpdate } = useLiveScores(tournament.id)

  const canEnableMyView = useMemo(() => {
    if (!initialUserId) return false
    const me = players.find((p) => p.id === initialUserId)
    return Boolean(me?.group_id)
  }, [players, initialUserId])

  const filteredPlayers = useMemo(
    () => applyFilters(players, { categoryFilter, groupFilter, myViewEnabled, userId: initialUserId }),
    [players, categoryFilter, groupFilter, myViewEnabled, initialUserId]
  )
  const filteredTeams = useMemo(
    () => applyFiltersTeams(teams, { categoryFilter, groupFilter }),
    [teams, categoryFilter, groupFilter]
  )
  const filteredMatches = useMemo(
    () => applyFiltersMatches(matches, { categoryFilter }),
    [matches, categoryFilter]
  )

  const body = useMemo(() => {
    const format = tournament.format || 'stroke_play'
    if (format === 'stroke_play' || format === 'stableford') {
      return (
        <IndividualLeaderboard
          players={filteredPlayers}
          format={format}
          modo={tournament.modo || 'gross'}
        />
      )
    }
    if (isTeamFormat(format)) {
      return <TeamLeaderboard teams={filteredTeams} />
    }
    if (format === 'match_play') {
      const bracketMode = tournament.bracket_mode || 'one_vs_one'
      if (bracketMode === 'one_vs_one') {
        return <MatchPlayHeadToHead matches={filteredMatches} />
      }
      return <MatchPlayBracket matches={filteredMatches} bracketMode={bracketMode} />
    }
    // Fallback defensivo: torneos viejos sin formato definido se renderizan como stroke_play gross.
    return <IndividualLeaderboard players={filteredPlayers} format="stroke_play" modo="gross" />
  }, [tournament, filteredPlayers, filteredTeams, filteredMatches])

  if (tvMode) {
    return (
      <TVMode
        categories={categories}
        onCategoryAutoswitch={setCategoryFilter}
        onExit={() => setTvMode(false)}
      >
        {body}
      </TVMode>
    )
  }

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
        color: 'var(--text-primary, #111827)',
      }}
    >
      <LiveHeader tournament={tournament} lastUpdate={lastUpdate} />
      <LiveTabs
        totalRounds={tournament.total_rounds || 1}
        selected={selectedRound}
        onChange={setSelectedRound}
      />
      <LiveFilterBar
        categories={categories}
        groups={groups}
        selectedCategory={categoryFilter}
        selectedGroup={groupFilter}
        myViewEnabled={myViewEnabled}
        canEnableMyView={canEnableMyView}
        onCategoryChange={setCategoryFilter}
        onGroupChange={setGroupFilter}
        onMyViewToggle={setMyViewEnabled}
        onTVMode={() => setTvMode(true)}
      />
      <div>{body}</div>
    </main>
  )
}
