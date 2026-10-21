// src/lib/data/tournaments/historial-del-cierre.ts
//
// Lleva al historial las rondas que cerró el cierre del torneo, fuera de la petición que cierra.

import { guardarRonda, recalcularIndice, rondasPorGuardar, reportarFallaDelHistorial } from './historial-del-cierre-pasos'

/** Workflow durable (Vercel Workflows): si se corta a mitad, sigue donde quedó. */
export async function historialDelCierre(tournamentId: string, cerradas: string[]): Promise<void> {
  'use workflow'
  await guardarRondasDelCierre(tournamentId, cerradas)
}

/**
 * Guarda una ronda a la vez, con la regla de `guardarRondaDeTorneoEnHistorial` para las que el
 * jugador nunca finalizó, y recalcula el índice de sus cuentas antes de pasar a la siguiente. Una
 * ronda que falla se reporta y no corta el resto. Si la lectura de las pendientes falla, guarda las
 * que cerró el cierre. El cierre la llama directo, después de responder y sin reintentos, cuando el
 * workflow no arranca.
 */
export async function guardarRondasDelCierre(tournamentId: string, cerradas: string[]): Promise<void> {
  let pendientes = cerradas
  try {
    pendientes = await rondasPorGuardar(tournamentId, cerradas)
  } catch (e) {
    await reportarFallaDelHistorial(String(e), { tournamentId })
  }
  for (const roundId of pendientes) {
    let cuentas: string[]
    try {
      cuentas = await guardarRonda(roundId)
    } catch (e) {
      await reportarFallaDelHistorial(String(e), { roundId })
      continue
    }
    for (const userId of cuentas) {
      try {
        await recalcularIndice(userId)
      } catch (e) {
        await reportarFallaDelHistorial(String(e), { roundId, userId })
      }
    }
  }
}
