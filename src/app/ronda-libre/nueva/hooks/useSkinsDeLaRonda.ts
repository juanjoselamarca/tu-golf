'use client'

import { useEffect, useRef, useState } from 'react'
import type { ModoJuego } from '@/golf/core/rules'
import type { ConfigSkins } from '@/golf/formats/skins'
import { esCantidadDeHoyosDelSkins } from '@/golf/formats/skins'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { SKINS_LIBRE_ABIERTO } from '@/lib/auth/skins-libre-abierto'
import { captureError } from '@/lib/error-tracking'
import {
  FalloDelContextoSkins, MENSAJE_SKINS_SIN_DATOS_DE_CANCHA, contextoSkinsDeRondaNueva, type JugadorDelSkinsNuevo,
} from '@/lib/data/skins-ronda-nueva'
import { problemaPorNombresQueFaltan } from './useFormularioDeRonda'
import {
  configSkinsParaEnviar, problemaDelSkins, skinsPorDefecto, type ContextoDelSkins,
} from './skins-del-formulario'

/**
 * Reintentos tras una lectura de cancha que falló por señal (intermitente en el club) y la espera antes de cada uno.
 * Agotados, se avisa y se para: se vuelve a intentar solo cuando el teléfono recupera la red (`online`) o la app
 * vuelve a primer plano. Con la app en segundo plano no se reintenta.
 */
export const ESPERAS_REINTENTO_CONTEXTO_MS: readonly number[] = [2000, 5000, 10000]

export interface RondaDelSkinsEnElFormulario {
  courseId: string | null
  holes: number
  hoyoInicio: number
  recorridos: readonly string[]
  /** Tee de la ronda. */
  tees: string
  /** Los jugadores que van a la ronda, en orden (el creador primero). */
  jugadores: readonly JugadorDelSkinsNuevo[]
  modo: ModoJuego
  /** `admin_mode`: una persona anota por todos. */
  adminMode: boolean
  /** Tarjetas de jugador sin nombre (no cuentan como jugador). */
  filasSinNombre: number
}

/**
 * Carga el course handicap de cada jugador y el SI de los hoyos con `contextoSkinsDeRondaNueva`, la misma función que
 * corre la API. Solo lee cuando hay un skins elegido. Se vuelve a leer si cambia algo que mueve los números (cancha,
 * hoyos, salida, recorridos —en su orden, que numera los hoyos—, tees, índices o modo); los nombres no, se aplican al
 * validar.
 */
function useContextoDelSkins(activo: boolean, ronda: RondaDelSkinsEnElFormulario, esperasMs: readonly number[]): ContextoDelSkins {
  const listo = activo && !!ronda.courseId && esCantidadDeHoyosDelSkins(ronda.holes)
  const clave = listo
    ? JSON.stringify([
        ronda.courseId, ronda.holes, ronda.hoyoInicio, ronda.recorridos, ronda.tees, ronda.modo,
        ronda.jugadores.map(j => [j.indice, j.tees ?? null]),
      ])
    : null
  const [estado, setEstado] = useState<{ clave: string | null; contexto: ContextoDelSkins }>({ clave: null, contexto: { estado: 'cargando' } })
  // Las esperas no reinician la lectura: solo la clave (un arreglo nuevo en cada render no vuelve a cero los reintentos).
  const esperasRef = useRef(esperasMs)
  useEffect(() => { esperasRef.current = esperasMs }, [esperasMs])

  useEffect(() => {
    if (!clave) return
    const [courseId, holes, hoyoInicio, recorridos, tees, modo, porJugador] = JSON.parse(clave) as [
      string, number, number, string[], string, ModoJuego, [number | null, string | null][],
    ]
    let vigente = true
    let reloj: ReturnType<typeof setTimeout> | undefined
    /** Intento que espera a que la app vuelva a primer plano. */
    let enPausa: number | null = null
    /** Se avisó el error y se dejó de intentar: vuelve con la red o al volver a la app. */
    let detenido = false

    const programar = (intento: number) => {
      if (document.hidden) { enPausa = intento; return }
      reloj = setTimeout(() => void leer(intento), esperasRef.current[intento - 1] ?? 0)
    }
    async function leer(intento: number) {
      try {
        const { createClient } = await import('@/lib/supabase')
        const contexto = await contextoSkinsDeRondaNueva(createClient(), {
          courseId, holes, hoyoInicio, recorridos, tees, modo,
          jugadores: porJugador.map(([indice, tee]) => ({ nombre: '', indice, tees: tee })),
        })
        if (vigente) setEstado({ clave, contexto: { estado: 'listo', contexto } })
      } catch (err) {
        if (!vigente) return
        // Falta un dato de la cancha (no de la señal): reintentar solo no lo arregla.
        const deSenal = !(err instanceof FalloDelContextoSkins) || err.deSenal
        if (deSenal && intento < esperasRef.current.length) { programar(intento + 1); return }
        void captureError(err, { context: 'ronda-libre.nueva.skins-contexto', level: 'warning', meta: { courseId } })
        detenido = true
        const mensaje = deSenal ? MENSAJE_SKINS_SIN_DATOS_DE_CANCHA : (err as Error).message
        setEstado({ clave, contexto: { estado: 'error', mensaje } })
      }
    }
    const alVolver = () => {
      if (!vigente || document.hidden) return
      if (enPausa != null) { const i = enPausa; enPausa = null; void leer(i); return }
      if (detenido) { detenido = false; void leer(0) }
    }
    window.addEventListener('online', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    void leer(0)
    return () => {
      vigente = false
      if (reloj) clearTimeout(reloj)
      window.removeEventListener('online', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [clave])

  // Lo leído para otra combinación no vale: mientras llega lo nuevo, «cargando».
  return estado.clave === clave ? estado.contexto : { estado: 'cargando' }
}

/**
 * Skins en el asistente. Solo existe si el permiso (`puedeCrearJuegoPersonalizado`, vía la API: `permiso`) y el
 * interruptor `SKINS_LIBRE_ABIERTO` lo permiten: si no, `skins` es siempre null y la ronda se crea como siempre.
 */
export function useSkinsDeLaRonda(
  permiso: boolean, ronda: RondaDelSkinsEnElFormulario, esperasMs: readonly number[] = ESPERAS_REINTENTO_CONTEXTO_MS,
) {
  const puedeElegir = SKINS_LIBRE_ABIERTO && permiso
  const [elegido, setSkins] = useState<ConfigSkins | null>(null)
  const skins = puedeElegir ? elegido : null
  const contexto = useContextoDelSkins(skins != null, ronda, esperasMs)

  const nombres = ronda.jugadores.map(j => j.nombre)
  const problema: ProblemaDeLaRonda | null = skins
    ? problemaDelSkins({ config: skins, modo: ronda.modo, adminMode: ronda.adminMode, courseId: ronda.courseId, holes: ronda.holes, nombres, contexto })
    : null
  // En Jugadores, una tarjeta sin nombre se avisa antes (si no, el usuario ve 4 tarjetas y lee «es para 4»).
  const problemaEnJugadores = skins ? (problemaPorNombresQueFaltan(ronda.filasSinNombre) ?? problema) : null

  return {
    puedeElegir,
    skins,
    setSkins,
    elegir: () => setSkins(s => s ?? skinsPorDefecto()),
    soltar: () => setSkins(null),
    problema,
    problemaEnJugadores,
    /** Lo que viaja a la API (`reglas_juego`) con el modo de la ronda, o null sin skins. */
    paraEnviar: skins ? { reglasJuego: configSkinsParaEnviar(skins, ronda.modo), problema } : null,
  }
}
