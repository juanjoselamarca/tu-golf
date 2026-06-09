import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import type { Player, Tournament, TournamentGroup } from '../types'
import {
  computeStoredTeamHandicap,
  resolvePlayerHandicap,
  isProducerTeamFormat,
} from '@/lib/data/tournaments/teamRounds'
import { FORMAT_META } from '@/golf/core/rules'
import type { FormatoJuego } from '@/golf/core/rules'

interface UseTournamentLifecycleArgs {
  tournament: Tournament & { codigo?: string | null }
  players: Player[]
  groups: TournamentGroup[]
  setTournamentStatus: (status: string) => void
}

/**
 * Ciclo de vida del torneo (iniciar / cancelar / cerrar) + chequeo de rondas
 * cerradas. Extraído verbatim de JugadoresPanel — sin cambio de comportamiento.
 *
 * `tournamentStatus` se queda en el componente (lo consume usePlayers) y acá
 * sólo recibimos `setTournamentStatus` para evitar dependencia circular
 * (lifecycle necesita players+groups; usePlayers necesita tournamentStatus).
 */
export function useTournamentLifecycle({
  tournament,
  players,
  groups,
  setTournamentStatus,
}: UseTournamentLifecycleArgs) {
  const router = useRouter()
  const { showError, showSuccess } = useToast()

  const [starting, setStarting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [allRoundsClosed, setAllRoundsClosed] = useState(false)

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

    // Validación previa: todos los jugadores aprobados deben estar en algún
    // grupo. Si no, no se les crea ronda_libre_jugador y el leaderboard rompe
    // (rounds existe pero no hay scoring path). Mostramos warning con la lista.
    const groupedIds = new Set<string>()
    for (const g of groups) {
      for (const gp of g.players) groupedIds.add(gp.player_id)
    }
    const ungrouped = players.filter(
      (p) => p.status === 'approved' && !groupedIds.has(p.id),
    )
    if (ungrouped.length > 0) {
      const names = ungrouped
        .map((p) => p.profiles?.name || 'Jugador')
        .slice(0, 5)
        .join(', ')
      const extra = ungrouped.length > 5 ? ` y ${ungrouped.length - 5} más` : ''
      showError(
        'Jugadores sin grupo',
        `Asigná a un grupo antes de iniciar: ${names}${extra}.`,
      )
      return
    }

    // Validación de tamaño de equipo: en formatos por equipos cada grupo (= equipo)
    // debe respetar el rango del formato (foursome exactamente 2; scramble/best_ball
    // 2 a 4). Sin esto el motor degrada EN SILENCIO — foursome con 3 ignora al
    // tercero, scramble con 5 los trata como 4 — y nadie se entera hasta que los
    // netos salen mal. Bloqueamos el inicio con un mensaje claro. Rango canónico en
    // FORMAT_META (golf-correcto). Grupos vacíos se ignoran (no se les crea ronda).
    if (isProducerTeamFormat(tournament.format)) {
      const meta = FORMAT_META[tournament.format as FormatoJuego]
      const rango = meta?.jugadoresPorEquipo
      if (rango) {
        // Contamos `group.players` igual que el loop de materialización de abajo
        // (mismo array, sin filtrar por `approved`): así el tamaño validado es el
        // MISMO equipo que el motor va a construir. No "arreglar" a approved-only:
        // desincronizaría la validación de la realidad.
        const fueraDeRango = groups.filter(
          (g) => g.players.length > 0 && (g.players.length < rango.min || g.players.length > rango.max),
        )
        if (fueraDeRango.length > 0) {
          const exigido = rango.min === rango.max ? `${rango.min}` : `${rango.min} a ${rango.max}`
          const detalle = fueraDeRango
            .map((g) => `"${g.name}" (${g.players.length})`)
            .slice(0, 5)
            .join(', ')
          const extra = fueraDeRango.length > 5 ? ` y ${fueraDeRango.length - 5} más` : ''
          showError(
            'Tamaño de equipo incorrecto',
            `En ${meta.label}, cada equipo debe tener ${exigido} jugadores. Corregí: ${detalle}${extra}.`,
          )
          return
        }
      }
    }

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
        void captureError(roundErr, { context: 'useTournamentLifecycle.start.crearRounds', level: 'warning' })
      }
    }

    // 3. Create rondas_libres for groups that don't have one yet.
    // En formatos por equipos (scramble/foursome/best_ball) el grupo ES el
    // equipo: además de la ronda y sus jugadores, creamos un ronda_equipos por
    // grupo. Sin `formato_juego` en la ronda, score-grupo no engancha el scoring
    // de equipo y el leaderboard se queda sin datos. En scramble/foursome el
    // ronda_equipos guarda el score COMPARTIDO; en best_ball sólo la membresía
    // (handicap_equipo null, cada jugador con su course handicap individual).
    const teamFormat = isProducerTeamFormat(tournament.format)
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
          ...(teamFormat ? { formato_juego: tournament.format } : {}),
        })
        .select('id')
        .single()

      if (rondaErr || !ronda) {
        void captureError(rondaErr ?? new Error('ronda_libre no creada'), {
          context: 'useTournamentLifecycle.start.crearRondaLibre',
          level: 'warning',
          meta: { group: group.name },
        })
        continue
      }

      // Link group to ronda_libre
      await supabase.from('tournament_groups').update({ ronda_libre_id: ronda.id }).eq('id', group.id)

      // Create ronda_libre_jugadores for each player in the group.
      // Guardamos el id de cada ronda_libre_jugador + su handicap en orden de
      // grupo para, en formatos por equipos, armar los miembros del equipo.
      const teamMembers: Array<{ jugadorRondaId: string; handicap: number }> = []
      for (const gp of group.players) {
        const player = players.find((p) => p.id === gp.player_id)
        if (!player) continue

        const handicap = resolvePlayerHandicap(player)
        const { data: jugador } = await supabase
          .from('ronda_libre_jugadores')
          .insert({
            ronda_id: ronda.id,
            nombre: player.profiles?.name || player.player_name || 'Jugador',
            user_id: player.user_id || null,
            // Handicap por jugador en ronda_libre_jugadores. Se setea cuando:
            //  - formato equipos (fallback del leaderboard de equipos), o
            //  - jugador INVITADO (sin user_id): no tiene profiles.indice, así que
            //    su índice debe viajar por acá para que el leaderboard individual
            //    (leaderboard.ts: handicap almacenado primero) calcule su neto.
            // Para jugadores registrados en individual NO se setea: path
            // byte-idéntico al que ya corre en prod (usa profiles.indice).
            ...((teamFormat || !player.user_id) ? { handicap } : {}),
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
          teamMembers.push({ jugadorRondaId: jugador.id, handicap })
        }
      }

      // Formato por equipos: crear el ronda_equipos del grupo + sus miembros.
      // Espeja api/ronda-libre/create pero con el handicap canónico del motor
      // (computeStoredTeamHandicap). El valor almacenado es la fuente de verdad
      // que leen tanto el scorer en cancha como el leaderboard.
      if (teamFormat && teamMembers.length > 0) {
        const handicapEquipo = computeStoredTeamHandicap(
          tournament.format ?? '',
          teamMembers.map((m) => m.handicap),
        )

        const { data: equipo, error: equipoErr } = await supabase
          .from('ronda_equipos')
          .insert({
            ronda_id: ronda.id,
            nombre: group.name,
            handicap_equipo: handicapEquipo,
            scores: {},
          })
          .select('id')
          .single()

        if (equipoErr || !equipo) {
          void captureError(equipoErr ?? new Error('ronda_equipos no creado'), {
            context: 'useTournamentLifecycle.start.crearRondaEquipo',
            level: 'warning',
            meta: { group: group.name },
          })
        } else {
          const memberRows = teamMembers.map((m, idx) => ({
            equipo_id: equipo.id,
            jugador_id: m.jugadorRondaId,
            orden: idx,
          }))
          const { error: membersErr } = await supabase
            .from('ronda_equipo_jugadores')
            .insert(memberRows)
          if (membersErr) {
            void captureError(membersErr, {
              context: 'useTournamentLifecycle.start.crearRondaEquipoJugadores',
              level: 'warning',
              meta: { group: group.name },
            })
          }
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

  return {
    starting, closing, allRoundsClosed,
    checkAllRoundsClosed, handleStartTournament,
    handleCancelTournament, handleCloseTournament,
  }
}
