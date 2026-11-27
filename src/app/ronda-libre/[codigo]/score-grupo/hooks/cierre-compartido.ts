// Pasos que comparten Finalizar (`useFinalizeGrupo`) y «Terminar mi equipo» (`useTerminarEquipo`): leer lo que dijo el
// envío de pendientes y subir los drives en cola antes de cerrar. Uno solo, para que los dos cierres no se separen.

import type { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { conPlazoCancelable } from '@/lib/red/con-timeout'
import { clienteConSenal } from '@/lib/red/cliente-con-senal'
import { haptic } from '@/lib/ronda/helpers'
import { hayPendientes } from '@/lib/ronda/score-storage'
import { marcarRespaldosDeRondaCerrada } from '@/lib/ronda/respaldo-local'
import { hayDrivesPendientes, reenviarDrivesPendientes, PLAZO_DRIVES_AL_FINALIZAR_MS } from '@/lib/ronda/drives-pendientes'
import { avisoFinalizarSinSesion } from '@/lib/auth/aviso-sesion-cerrada'
import { AVISO_RONDA_YA_FINALIZADA, avisoTarjetasNoGuardadas } from '@/components/ronda/finalizar-copy'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import type { RondaLibre } from '@/types/ronda'
import type { ResultadoEnvio } from './useGrupoScoreSave'

/** Nombre de una tarjeta del envío: el jugador, o el equipo (`eq:<id>`) en scramble / foursome. */
function nombreDeTarjeta(ronda: RondaLibre, equipos: readonly EquipoDelScorer[], id: string): string {
  if (id.startsWith('eq:')) return equipos.find(eq => eq.id === id.slice(3))?.nombre || 'un equipo'
  return ronda.ronda_libre_jugadores.find(j => j.id === id)?.nombre || 'un jugador'
}

/**
 * Lo que dice un envío de pendientes antes de cerrar: `corta` (ya se avisó, no se cierra), `cerrada` (P0002: la ronda
 * se cerró mientras tanto) o `sigue`.
 */
export function resolverEnvioDelCierre(envio: ResultadoEnvio, ctx: {
  ronda: RondaLibre
  teamEquipos: readonly EquipoDelScorer[]
  codigo: string
  avisarSinServidor: () => void
}): 'sigue' | 'cerrada' | 'corta' {
  const { ronda, teamEquipos, codigo, avisarSinServidor } = ctx
  // Borrada: el envío ya avisó, limpió la copia local y saca al marcador.
  if (envio.estado === 'ronda_borrada') return 'corta'
  // Cerrada mientras tanto (P0002): lo pendiente se queda en el teléfono a propósito (se puede
  // reabrir); no es falta de señal, y la tarjeta sigue al historial.
  if (envio.estado === 'ronda_cerrada') {
    // El envío del cierre va en silencio (el aviso con nombre es del cierre): el P0002 se avisa acá.
    addToast({ ...AVISO_RONDA_YA_FINALIZADA, type: 'info' })
    marcarRespaldosDeRondaCerrada(codigo)
    return 'cerrada'
  }
  if (envio.rechazadas.length > 0) {
    // Rechazo firme de una tarjeta (P0004/22023 = INVALID_DELTA: golpe u hoyo inválido). NO se cierra:
    // cerrar borraría la copia del grupo, el único lugar con esos golpes. Quedan en el teléfono, el
    // marcador sigue en la pantalla para revisarlos y el aviso nombra a cada uno (el genérico del envío
    // no sale encima). Una cuyo reenvío no tuvo respuesta no viene acá: eso es señal (abajo).
    // (P0001 con la ronda viva = el jugador ya no está: el envío lo deja fuera y no bloquea.)
    const nombres = envio.rechazadas.map(({ id }) => nombreDeTarjeta(ronda, teamEquipos, id))
    addToast({ ...avisoTarjetasNoGuardadas(nombres), type: 'error', duration: 10000 })
    haptic([30, 60, 30])
    return 'corta'
  }
  if (envio.sesionPerdida) {
    // Sin sesión el cierre no sale: lo mismo que dice el aviso fijo, no "sin conexión".
    addToast({ ...avisoFinalizarSinSesion({ habiaSesion: true }), type: 'error', duration: 7000 })
    return 'corta'
  }
  if (hayPendientes(codigo)) {
    avisarSinServidor()
    return 'corta'
  }
  return 'sigue'
}

/**
 * Drives del scramble de club: no cuentan para el score y no frenan el cierre, pero los que esperan en la cola suben
 * ANTES de cerrar. Con la ronda cerrada la RPC los rechaza (P0002) y el jugador quedaría con un drive menos sin aviso
 * (revisión Fable #895). Mejor esfuerzo con plazo: sin señal, se cierra igual.
 */
export async function subirDrivesAntesDeCerrar(supabase: ReturnType<typeof createClient>, codigo: string, contexto: string): Promise<void> {
  if (!hayDrivesPendientes(codigo)) return
  try {
    await conPlazoCancelable(s => reenviarDrivesPendientes(clienteConSenal(supabase, s), codigo), PLAZO_DRIVES_AL_FINALIZAR_MS)
  } catch { /* sin señal: el cierre no espera a los drives */ }
  if (hayDrivesPendientes(codigo)) {
    void captureError(new Error('drives sin subir al finalizar'), { context: contexto, level: 'warning', meta: { codigo } })
  }
}
