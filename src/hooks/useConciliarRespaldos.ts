'use client'

// src/hooks/useConciliarRespaldos.ts
//
// El banner "Sincronizando N hoyos…" cuenta los respaldos locales sin enviar. Si la ronda se
// borró (o se cerró) mientras el jugador no estaba en su scorer, nadie limpiaba ese respaldo y el
// banner quedaba para siempre en todas las páginas (PR #763). El conciliador le pregunta al
// servidor por cada ronda con respaldo pendiente y limpia SOLO con respuesta firme:
//   - la ronda no existe (PGRST116)  → el creador la descartó;
//   - la ronda está 'finalizada'     → el servidor ya no acepta esos golpes.
// Cualquier otra cosa (en curso, red caída, timeout, sesión vencida, permisos) no toca nada:
// borrar golpes de una ronda viva por una lectura dudosa sería perder la tarjeta del jugador.

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { conTimeout } from '@/lib/red/con-timeout'
import { fetchEstadoRondaLibre, RONDA_NO_EXISTE } from '@/lib/data/ronda-libre-estado'
import { codigosConRespaldoPendiente } from '@/lib/ronda/respaldo-local'
import { limpiarCopiaLocalDeRonda } from '@/lib/ronda/score-storage'

const TIMEOUT_CONSULTA_MS = 10_000
const ESTADOS_QUE_LIMPIAN: ReadonlySet<string> = new Set([RONDA_NO_EXISTE, 'finalizada'])

/** Concilia una vez. Devuelve los códigos cuya copia local se limpió. */
export async function conciliarRespaldos(): Promise<string[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return []
  const codigos = codigosConRespaldoPendiente()
  if (codigos.length === 0) return []
  const supabase = createClient()
  const limpiados: string[] = []
  for (const codigo of codigos) {
    let estado: string | null = null
    try {
      estado = await conTimeout(fetchEstadoRondaLibre(supabase, codigo), TIMEOUT_CONSULTA_MS)
    } catch {
      continue // red caída o timeout: sin señal no se borra nada
    }
    if (estado != null && ESTADOS_QUE_LIMPIAN.has(estado)) {
      limpiarCopiaLocalDeRonda(codigo)
      limpiados.push(codigo)
    }
  }
  return limpiados
}

/** Concilia al montar y cada vez que vuelve la conexión; nunca en cada render. */
export function useConciliarRespaldos(onLimpio?: () => void): void {
  const onLimpioRef = useRef(onLimpio)
  useEffect(() => { onLimpioRef.current = onLimpio }, [onLimpio])

  useEffect(() => {
    let vivo = true
    let enCurso = false
    const correr = () => {
      if (enCurso) return
      enCurso = true
      conciliarRespaldos()
        .then(limpiados => { if (vivo && limpiados.length > 0) onLimpioRef.current?.() })
        .catch(() => { /* conciliar es best-effort: el próximo 'online' reintenta */ })
        .finally(() => { enCurso = false })
    }
    correr()
    window.addEventListener('online', correr)
    return () => { vivo = false; window.removeEventListener('online', correr) }
  }, [])
}
