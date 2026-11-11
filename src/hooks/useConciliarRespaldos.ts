'use client'

// src/hooks/useConciliarRespaldos.ts
//
// El banner "Sincronizando N hoyos…" cuenta los respaldos locales sin enviar. Si la ronda se
// borró (o se cerró) mientras el jugador no estaba en su scorer, nadie los resolvía y el banner
// quedaba para siempre en todas las páginas (PR #763). El conciliador le pregunta al servidor
// por cada ronda con respaldos sin enviar y actúa SOLO con respuesta firme:
//   - no existe (PGRST116) → el creador la descartó: se borra toda su copia local;
//   - 'finalizada'         → se MARCA (sale del banner) pero NO se borra: la ronda se puede
//                            reabrir (reabrir un torneo devuelve sus rondas a 'en_curso') y
//                            esos golpes son lo único que hay. A los 30 días marcada se barre, y
//                            sólo acá: con la ronda recién confirmada cerrada;
//   - 'en_curso'           → si estaba marcada, se desmarca (vuelve al banner y el scorer la reenvía).
// Cualquier otra cosa (red caída, timeout, sesión vencida, permisos) no toca nada.

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { conTimeout } from '@/lib/red/con-timeout'
import { esRondaCerrada, fetchEstadoRondaLibre, RONDA_NO_EXISTE, TIMEOUT_ESTADO_RONDA_MS } from '@/lib/data/ronda-libre-estado'
import {
  barrerRespaldosDeRondaCerrada,
  codigosConRespaldoDeRondaCerrada,
  codigosConRespaldoPendiente,
  desmarcarRespaldosDeRondaCerrada,
  marcarRespaldosDeRondaCerrada,
} from '@/lib/ronda/respaldo-local'
import { barrerRechazadosViejos, limpiarCopiaLocalDeRonda } from '@/lib/ronda/score-storage'

/** Concilia una vez. Devuelve los códigos cuyo estado local cambió (borrados, marcados o desmarcados). */
export async function conciliarRespaldos(): Promise<string[]> {
  // Local y sin servidor: los golpes apartados del scorer de grupo que nadie va a reenviar (P3-3 del #763).
  barrerRechazadosViejos()
  if (typeof navigator !== 'undefined' && !navigator.onLine) return []
  const codigos = [...new Set([...codigosConRespaldoPendiente(), ...codigosConRespaldoDeRondaCerrada()])]
  if (codigos.length === 0) return []
  const supabase = createClient()
  const cambiados: string[] = []
  for (const codigo of codigos) {
    let estado: string | null = null
    try {
      estado = await conTimeout(fetchEstadoRondaLibre(supabase, codigo), TIMEOUT_ESTADO_RONDA_MS)
    } catch {
      continue // red caída o timeout: sin señal no se toca nada
    }
    let cambio = false
    if (estado === RONDA_NO_EXISTE) { limpiarCopiaLocalDeRonda(codigo); cambio = true }
    else if (esRondaCerrada(estado)) {
      cambio = marcarRespaldosDeRondaCerrada(codigo)
      // Recién confirmada cerrada: lo marcado hace más de 30 días se barre (una reabierta nunca llega acá).
      barrerRespaldosDeRondaCerrada(codigo)
    }
    else if (estado === 'en_curso') cambio = desmarcarRespaldosDeRondaCerrada(codigo)
    if (cambio) cambiados.push(codigo)
  }
  return cambiados
}

/** Concilia al montar y cada vez que vuelve la conexión; nunca en cada render. */
export function useConciliarRespaldos(onCambio?: () => void): void {
  const onCambioRef = useRef(onCambio)
  useEffect(() => { onCambioRef.current = onCambio }, [onCambio])

  useEffect(() => {
    let vivo = true
    let enCurso = false
    const correr = () => {
      if (enCurso) return
      enCurso = true
      conciliarRespaldos()
        .then(cambiados => { if (vivo && cambiados.length > 0) onCambioRef.current?.() })
        .catch(() => { /* conciliar es best-effort: el próximo 'online' reintenta */ })
        .finally(() => { enCurso = false })
    }
    correr()
    window.addEventListener('online', correr)
    return () => { vivo = false; window.removeEventListener('online', correr) }
  }, [])
}
