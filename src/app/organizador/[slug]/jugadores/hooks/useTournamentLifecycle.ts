import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useConfirmModal } from '@/hooks/useConfirmModal'
import type { Player, Tournament, TournamentGroup } from '../types'
import { resolveFormatoJuego } from '@/golf/formats'
import { ultimaRondaCerrada } from '@/lib/data/tournaments/ultima-ronda-cerrada'
import {
  avisoSinIndice,
  CODIGO_CONFIRMAR_SIN_INDICE,
  motivoParaNoIniciarDesdeInscritos,
  type JugadorSinIndice,
} from '@/lib/data/tournaments/motivo-para-no-iniciar'
import { inscritoAprobado } from '@/golf/tournament-status'

/** Tope de vueltas confirmar → 409: la lista de sin índice no puede cambiar sin fin. */
const MAX_CONFIRMACIONES_DE_INICIO = 3

/** La lista `sinIndice` de la ruta, tolerante a una respuesta sin ella. */
function listaSinIndice(v: unknown): JugadorSinIndice[] {
  if (!Array.isArray(v)) return []
  return v.filter(
    (j): j is JugadorSinIndice => typeof j?.id === 'string' && typeof j?.nombre === 'string',
  )
}

/** El texto del modal de inicio: el aviso de sin índice (si hay) va primero; la pregunta, al final. */
export function descripcionDeInicio(
  aprobados: number,
  sinIndice: JugadorSinIndice[],
  hcpCalcMode: string | null | undefined,
): string {
  const pregunta = `¿Iniciar con ${aprobados} jugador${aprobados !== 1 ? 'es' : ''}? Se crearán las rondas para todos.`
  const aviso = avisoSinIndice(sinIndice, hcpCalcMode)
  return aviso ? `${aviso} ${pregunta}` : pregunta
}

interface UseTournamentLifecycleArgs {
  tournament: Tournament & { codigo?: string | null }
  players: Player[]
  groups: TournamentGroup[]
  /** false hasta la primera lectura buena de grupos (ver `useGroups`). */
  gruposCargados: boolean
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
  gruposCargados,
  setTournamentStatus,
}: UseTournamentLifecycleArgs) {
  const router = useRouter()
  const { showError, showSuccess } = useToast()
  const { confirm, modalProps } = useConfirmModal()

  const [starting, setStarting] = useState(false)
  // Antes de confirmar (GET de lo que ve el servidor): el botón no dice
  // "Iniciando..." porque todavía no se inició nada.
  const [preparandoInicio, setPreparandoInicio] = useState(false)
  const [closing, setClosing] = useState(false)
  const [opening, setOpening] = useState(false)
  const [allRoundsClosed, setAllRoundsClosed] = useState(false)

  // ¿Están cerradas todas las tarjetas de la última ronda? Habilita "Cerrar torneo".
  const checkAllRoundsClosed = async () => {
    setAllRoundsClosed(await ultimaRondaCerrada(createClient(), tournament.id))
  }

  // Por qué todavía no se puede iniciar: el MISMO cálculo que la ruta de inicio
  // (fuente única), sobre los inscritos y grupos que el panel ya tiene. El
  // organizador lo ve junto al botón antes de apretarlo, no como un 400.
  // Sin grupos cargados no se adivina: el botón queda habilitado y la ruta,
  // que lee los grupos en el servidor, sigue siendo la que decide.
  const motivoNoIniciar = gruposCargados
    ? motivoParaNoIniciarDesdeInscritos(resolveFormatoJuego(tournament), players, groups, tournament.team_config)
    : null
  const aprobadosCount = players.filter((p) => inscritoAprobado(p.status)).length

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
      showError('Sin conexión', 'No se pudieron abrir las inscripciones. Revisa tu conexión e intenta de nuevo.')
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
      showError('Sin conexión', 'No se pudo volver a borrador. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setOpening(false)
    }
  }

  // Iniciar: 1) GET de lo que ve el servidor (motivo + jugadores sin índice);
  // 2) UN modal de confirmación que, si hay sin índice, los nombra; 3) POST con
  // los que el organizador vio. Si entre el GET y el POST alguien quedó sin
  // índice, el servidor responde 409 con la lista nueva y se vuelve a confirmar
  // (un modal por intento, nunca dos seguidos). Sin índice nunca bloquea.
  const handleStartTournament = async () => {
    if (motivoNoIniciar) {
      showError('Aún no se puede iniciar', motivoNoIniciar)
      return
    }
    const url = `/api/torneos/${tournament.slug}/start`

    setPreparandoInicio(true)
    try {
      const pre = await fetch(url, { method: 'GET' })
      const preData = await pre.json().catch(() => ({}))
      if (!pre.ok) {
        showError('Error al iniciar', preData.error || 'No se pudo preparar el inicio del torneo.')
        return
      }
      // El servidor manda: puede ver algo que el panel todavía no (otra pestaña).
      if (preData.motivo) {
        showError('Aún no se puede iniciar', preData.motivo)
        return
      }
      let sinIndice = listaSinIndice(preData.sinIndice)

      for (let intento = 0; intento < MAX_CONFIRMACIONES_DE_INICIO; intento++) {
        setPreparandoInicio(false)
        setStarting(false)
        const ok = await confirm({
          title: 'Iniciar torneo',
          description: descripcionDeInicio(aprobadosCount, sinIndice, tournament.hcp_calc_mode),
          confirmText: 'Iniciar torneo',
          variant: 'warning',
        })
        if (!ok) return
        setStarting(true)

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sinIndiceVistos: sinIndice.map((j) => j.id) }),
        })
        const data = await res.json().catch(() => ({}))

        if (res.status === 409 && data.codigo === CODIGO_CONFIRMAR_SIN_INDICE) {
          sinIndice = listaSinIndice(data.sinIndice)
          continue
        }
        if (!res.ok) {
          showError('Error al iniciar', data.error || 'No se pudo iniciar el torneo.')
          return
        }

        setTournamentStatus('in_progress')
        // La fecha programada ya había pasado (más de 2 días): el servidor la corrió a hoy.
        const movida = data.fechaMovidaA ? ' Movimos la fecha del torneo a hoy.' : ''
        showSuccess('Torneo iniciado', `Las rondas fueron creadas. Los jugadores ya pueden cargar scores.${movida}`)
        router.push(`/organizador/${tournament.slug}/scoring`)
        return
      }
      showError('No se pudo iniciar', 'La lista de jugadores cambió mientras confirmabas. Recarga la página e intenta de nuevo.')
    } catch {
      showError('Sin conexión', 'No se pudo iniciar el torneo. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setPreparandoInicio(false)
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
      showError('Sin conexión', 'No se pudo cerrar el torneo. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setClosing(false)
    }
  }

  return {
    starting, preparandoInicio, closing, opening, allRoundsClosed,
    checkAllRoundsClosed, handleStartTournament,
    motivoNoIniciar, aprobadosCount,
    handleOpenInscriptions, handleRevertToDraft,
    handleCancelTournament, handleCloseTournament,
    handleReopenTournament,
    confirmModalProps: modalProps,
  }
}
