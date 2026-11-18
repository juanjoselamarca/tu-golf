// Cerrar la tarjeta abierta del scorer del organizador (`finalize_round`). Separado de `useScoreEntry`.
//
// Antes de cerrar espera la RESPUESTA de todo lo pendiente de la ronda (stats que esperaban el fin de los toques y la
// cola de cada hoyo) y no cierra si algo no quedó guardado o no se sabe: después del cierre el servidor rechaza los
// cambios y ya no se podría corregir (revisión #834, vueltas 5 y 6).

import { useCallback, useState, type MutableRefObject } from 'react'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { ColaHoyos } from './envio-hoyo'

interface Args {
  tournament: ScoringTournament | null
  selectedId: string | null
  players: ScoringPlayer[]
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  reloadRoster: () => Promise<unknown>
  clearSelection: () => void
  showError: (titulo: string, mensaje: string) => void
  showWarning: (titulo: string, mensaje: string) => void
  enviarPendientes: () => Promise<void>
  cola: Pick<ColaHoyos, 'vaciar' | 'hoyosInciertos'>
  fallidasDeRonda: (roundId: string) => number[]
  /** Hoyos en rojo de la tarjeta abierta, leídos después de esperar la cola (el closure del tap ya es viejo). */
  errorHolesRef: MutableRefObject<ReadonlySet<number>>
  setSaving: (saving: boolean) => void
}

export function useCerrarTarjeta({
  tournament, selectedId, players, getActiveRound, reloadRoster, clearSelection, showError, showWarning,
  enviarPendientes, cola, fallidasDeRonda, errorHolesRef, setSaving,
}: Args) {
  /** El cierre está esperando que respondan los envíos pendientes (el botón lo dice). */
  const [terminandoDeGuardar, setTerminandoDeGuardar] = useState(false)

  const finalizeRound = useCallback(async () => {
    if (!tournament || !selectedId) return
    const player = players.find((p) => p.id === selectedId)
    const round = getActiveRound(player)
    if (!round) return
    setSaving(true)
    // Todo lo de la tarjeta llega ANTES del cierre (después el servidor lo rechazaría): las stats que esperaban y lo
    // que esté en la cola de cada hoyo de la ronda. Se ESPERA la respuesta, no sólo la salida, y se dice.
    setTerminandoDeGuardar(true)
    await enviarPendientes()
    await cola.vaciar(round.id)
    setTerminandoDeGuardar(false)
    // Lo que no quedó guardado (o no se sabe) no se cierra encima: después del cierre ya no se podría corregir.
    const sinGuardar = [
      ...new Set([...errorHolesRef.current, ...fallidasDeRonda(round.id), ...cola.hoyosInciertos(round.id)]),
    ].sort((a, b) => a - b)
    if (sinGuardar.length > 0) {
      setSaving(false)
      const cuales = sinGuardar.length === 1 ? `el hoyo ${sinGuardar[0]}` : `los hoyos ${sinGuardar.join(', ')}`
      showError('No se cerró la tarjeta', `Revisa ${cuales}: hay datos sin guardar.`)
      return
    }
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize_round',
        tournament_id: tournament.id,
        round_id: round.id,
      }),
    }).catch(() => null)
    setSaving(false)
    const cuerpo: { error?: unknown; code?: unknown } | null = res && !res.ok
      ? await res.json().catch(() => null)
      : null
    // Ya estaba cerrada (la cerró otro dispositivo, o el primer cierre llegó y se
    // perdió la respuesta): reconciliar con el servidor, no pedir que reintente.
    if (cuerpo?.code === 'round_closed') {
      showWarning('La tarjeta ya estaba cerrada', 'Actualizamos el listado.')
      await reloadRoster()
      clearSelection()
      return
    }
    // Sin esto, un cierre que falló se veía igual que uno exitoso: la tarjeta
    // seguía abierta y el organizador no se enteraba ("el botón no hace nada").
    // El motivo del servidor (torneo cerrado, tarjeta de otro torneo) dice más
    // que "intenta de nuevo", que no arregla esos casos.
    if (!res?.ok) {
      showError('No se cerró la tarjeta', typeof cuerpo?.error === 'string' ? cuerpo.error : 'Intenta de nuevo.')
      return
    }
    await reloadRoster()
    clearSelection()
  }, [
    tournament, selectedId, players, getActiveRound, reloadRoster, clearSelection, showError, showWarning,
    enviarPendientes, cola, fallidasDeRonda, errorHolesRef, setSaving,
  ])

  return { finalizeRound, terminandoDeGuardar }
}
