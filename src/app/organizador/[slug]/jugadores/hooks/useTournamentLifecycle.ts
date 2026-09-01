import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useConfirmModal } from '@/hooks/useConfirmModal'
import type { Player, Tournament, TournamentGroup } from '../types'

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
  const { confirm, modalProps } = useConfirmModal()

  const [starting, setStarting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [opening, setOpening] = useState(false)
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
    // Eliminar es un DELETE duro: borra rondas, grupos, players, categorías y el
    // torneo. Con inscripciones abiertas puede haber jugadores reales ya inscritos
    // vía /unirse — el confirm DEBE decir cuántos se borran, no un genérico
    // "no se puede deshacer" (CERO FALLOS: un fat-finger no puede tragarse 30
    // inscripciones en silencio). Si hay inscritos, sugerimos volver a borrador.
    const n = players.length
    const msg = n > 0
      ? `Este torneo tiene ${n} jugador${n !== 1 ? 'es' : ''} inscrito${n !== 1 ? 's' : ''}. Eliminarlo borra sus inscripciones de forma PERMANENTE (esto no se puede deshacer). Si solo quieres cerrar inscripciones, usa "Volver a borrador". ¿Eliminar igual?`
      : 'Eliminar este torneo? Esta acción no se puede deshacer.'
    const ok = await confirm({
      title: n > 0 ? 'Eliminar torneo con jugadores' : 'Eliminar torneo',
      description: msg,
      confirmText: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
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

  // Abre las inscripciones (draft → open) vía el orquestador /api/game, que
  // valida organizador server-side y delega en lifecycle.openTournament. No
  // hacemos el update directo acá (a diferencia de start/close) porque abrir
  // inscripciones expone el torneo públicamente: la validación server-side es
  // la barrera correcta.
  const handleOpenInscriptions = async () => {
    if (opening) return
    setOpening(true)
    // try/finally: si fetch tira (offline, DNS, abort) el flag NO debe quedar
    // pegado dejando el botón en "Abriendo..." para siempre (CERO FALLOS — wifi
    // de cancha entre hoyos).
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open_inscriptions', tournament_id: tournament.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showError('Error', data.error || 'No se pudieron abrir las inscripciones.')
        return
      }
      setTournamentStatus('open')
      showSuccess('Inscripciones abiertas', 'Comparte el link para que se inscriban. Puedes iniciar el torneo cuando quieras.')
    } catch {
      showError('Sin conexión', 'No se pudieron abrir las inscripciones. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setOpening(false)
    }
  }

  // Vuelve a borrador (open → draft) conservando los jugadores ya inscritos.
  const handleRevertToDraft = async () => {
    if (opening) return
    const ok = await confirm({
      title: 'Volver a borrador',
      description: '¿Cerrar las inscripciones? Los jugadores ya inscritos se conservan.',
      confirmText: 'Volver a borrador',
      variant: 'warning',
    })
    if (!ok) return
    setOpening(true)
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revert_to_draft', tournament_id: tournament.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showError('Error', data.error || 'No se pudo volver a borrador.')
        return
      }
      setTournamentStatus('draft')
      showSuccess('Inscripciones cerradas', 'El torneo volvió a borrador. Los jugadores inscritos se conservan.')
    } catch {
      showError('Sin conexión', 'No se pudo volver a borrador. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setOpening(false)
    }
  }

  const handleStartTournament = async () => {
    if (players.length < 1) return

    const ok = await confirm({
      title: 'Iniciar torneo',
      description: `¿Iniciar con ${players.length} jugador${players.length !== 1 ? 'es' : ''}? Se crearán las rondas para todos.`,
      confirmText: 'Iniciar torneo',
      variant: 'warning',
    })
    if (!ok) return
    setStarting(true)

    try {
      const res = await fetch(`/api/torneos/${tournament.slug}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        showError('Error al iniciar', data.error || 'No se pudo iniciar el torneo.')
        return
      }

      setTournamentStatus('in_progress')
      showSuccess('Torneo iniciado', 'Las rondas fueron creadas. Los jugadores ya pueden cargar scores.')
      router.push(`/organizador/${tournament.slug}/scoring`)
    } catch {
      showError('Sin conexión', 'No se pudo iniciar el torneo. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setStarting(false)
    }
  }

  const handleReopenTournament = async () => {
    const ok = await confirm({
      title: 'Reabrir torneo',
      description: '¿Reabrir el torneo? Los resultados dejarán de ser definitivos y se podrán editar scores.',
      confirmText: 'Reabrir torneo',
      variant: 'danger',
    })
    if (!ok) return
    setClosing(true)
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen_tournament', tournament_id: tournament.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showError('Error', data.error || 'No se pudo reabrir el torneo.')
        return
      }
      setTournamentStatus('in_progress')
      showSuccess('Torneo reabierto', 'Los scores pueden volver a editarse.')
    } catch {
      showError('Sin conexión', 'No se pudo reabrir el torneo. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setClosing(false)
    }
  }

  const handleCloseTournament = async () => {
    const ok = await confirm({
      title: 'Cerrar torneo',
      description: '¿Cerrar el torneo? Los resultados serán definitivos y los scores no podrán modificarse.',
      confirmText: 'Cerrar torneo',
      variant: 'danger',
    })
    if (!ok) return
    setClosing(true)
    // Vía /api/game (como open/revert/cancel): el server valida organizador y
    // CONGELA las rondas (individual + equipos) con el service client. El update
    // directo anterior solo marcaba status y dependía 100% del RLS del cliente,
    // dejando los scores de equipo editables tras el cierre (P0 de congelado).
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_tournament', tournament_id: tournament.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showError('Error', data.error || 'No se pudo cerrar el torneo.')
        return
      }
      setTournamentStatus('closed')
      showSuccess('Torneo cerrado', 'Los resultados son definitivos.')
    } catch {
      showError('Sin conexión', 'No se pudo cerrar el torneo. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setClosing(false)
    }
  }

  return {
    starting, closing, opening, allRoundsClosed,
    checkAllRoundsClosed, handleStartTournament,
    handleOpenInscriptions, handleRevertToDraft,
    handleCancelTournament, handleCloseTournament,
    handleReopenTournament,
    confirmModalProps: modalProps,
  }
}
