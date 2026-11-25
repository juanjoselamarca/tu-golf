'use client'

import { useEffect, useRef, useState } from 'react'
import type { ModoJuego } from '@/golf/core/rules'
import type { ConfigSkins } from '@/golf/formats/skins'
import { esCantidadDeHoyosDelSkins } from '@/golf/formats/skins'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { SKINS_LIBRE_ABIERTO } from '@/lib/auth/skins-libre-abierto'
import { captureError } from '@/lib/error-tracking'
import { clienteConSenal } from '@/lib/red/cliente-con-senal'
import { conPlazoCancelable, LecturaCanceladaError } from '@/lib/red/con-timeout'
import {
  FalloDelContextoSkins, MENSAJE_SKINS_SIN_DATOS_DE_CANCHA, contextoSkinsDeRondaNueva, type JugadorDelSkinsNuevo,
} from '@/lib/data/skins-ronda-nueva'
import { problemaPorNombresQueFaltan } from './useFormularioDeRonda'
import {
  configSkinsParaEnviar, problemaDelSkins, skinsPorDefecto, type ContextoDelSkins, type ProblemaDelSkins,
} from './skins-del-formulario'

/**
 * Reintentos tras una lectura de cancha que falló (la señal en el club va y viene) y la espera antes de cada uno. El
 * aviso sale en el primer fallo y el reintento sigue por detrás: si funciona, el aviso se va solo. Agotados, se para y
 * se reporta; se vuelve a leer con «Reintentar», cuando el teléfono recupera la red (`online`) o cuando la app vuelve
 * a primer plano. Sin red o con la app en segundo plano no se programa nada.
 */
export const ESPERAS_REINTENTO_CONTEXTO_MS: readonly number[] = [2000, 5000, 10000]

/**
 * Plazo de cada lectura de cancha (catálogo de hoyos → rating de cada tee): una lectura colgada se corta acá y cuenta
 * como fallo de señal. La cadena son hasta 6 consultas en serie (hoyos propios, recorridos hijos y sus hoyos; después
 * por tee: recorridos hijos, sus tees y cancha + tee), y postgrest-js reintenta cada GET ante un error de red (1, 2 y
 * 4 s). Con señal lenta pero buena (~3 s por consulta) son ~18 s: 20 s no corta una lectura que iba a llegar, y queda
 * en la familia de los plazos de varias consultas (`PLAZO_GUARDAR_TARJETA_MS`, `PLAZO_CIERRE_MS`).
 */
export const PLAZO_LECTURA_CONTEXTO_MS = 20_000

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

const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * Carga el course handicap de cada jugador y el SI de los hoyos con `contextoSkinsDeRondaNueva`, la misma función que
 * corre la API. Solo lee cuando hay un skins elegido. Se vuelve a leer si cambia algo que mueve los números (cancha,
 * hoyos, salida, recorridos —en su orden, que numera los hoyos—, tees, índices o modo); los nombres no, se aplican al
 * validar. `reintentar` vuelve a leer desde cero (el botón «Reintentar» del aviso).
 */
function useContextoDelSkins(
  activo: boolean, ronda: RondaDelSkinsEnElFormulario, esperasMs: readonly number[], plazoMs: number,
): { contexto: ContextoDelSkins; reintentar: () => void } {
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
  const plazoRef = useRef(plazoMs)
  useEffect(() => { esperasRef.current = esperasMs; plazoRef.current = plazoMs }, [esperasMs, plazoMs])
  const reintentarRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!clave) return
    const [courseId, holes, hoyoInicio, recorridos, tees, modo, porJugador] = JSON.parse(clave) as [
      string, number, number, string[], string, ModoJuego, [number | null, string | null][],
    ]
    let vigente = true
    let reloj: ReturnType<typeof setTimeout> | undefined
    /** Intento que espera a que la app vuelva a primer plano. */
    let enPausa: number | null = null
    /** Sin intentos programados (agotados o sin red): vuelve con la red, al volver a la app o con «Reintentar». */
    let detenido = false
    /** Cada lectura lleva su número: la respuesta de una lectura reemplazada (por «Reintentar») no cuenta. */
    let ultima = 0
    /** Ya se reportó el fallo de esta combinación: volver a la app y fallar otra vez no lo repite. */
    let reportado = false
    /** La lectura en curso: «Reintentar» y desmontar la cancelan (deja de ocupar la conexión y no contesta tarde). */
    let control: AbortController | null = null
    const cancelarLaLectura = () => { control?.abort(); control = null }

    const avisar = (mensaje: string) => setEstado({ clave, contexto: { estado: 'error', mensaje } })
    const programar = (intento: number) => {
      if (document.hidden) { enPausa = intento; return }
      reloj = setTimeout(() => void leer(intento), esperasRef.current[intento - 1] ?? 0)
    }
    async function leer(intento: number) {
      if (sinRed()) { detenido = true; avisar(MENSAJE_SKINS_SIN_DATOS_DE_CANCHA); return }
      const esta = ++ultima
      cancelarLaLectura()
      const propio = new AbortController()
      control = propio
      try {
        const { createClient } = await import('@/lib/supabase')
        const supabase = createClient()
        const contexto = await conPlazoCancelable(senal => contextoSkinsDeRondaNueva(clienteConSenal(supabase, senal), {
          courseId, holes, hoyoInicio, recorridos, tees, modo,
          jugadores: porJugador.map(([indice, tee]) => ({ nombre: '', indice, tees: tee })),
        }), plazoRef.current, { signal: propio.signal })
        if (vigente && esta === ultima) setEstado({ clave, contexto: { estado: 'listo', contexto } })
      } catch (err) {
        if (!vigente || esta !== ultima || err instanceof LecturaCanceladaError) return
        // Un rating que no llegó puede ser la señal o la cancha: se dice lo que pasó (el tee sin rating, con su salida
        // «juega en gross») desde el primer fallo, y se reintenta igual por detrás.
        const agotado = intento >= esperasRef.current.length
        const especifico = err instanceof FalloDelContextoSkins && !err.deSenal
        avisar(especifico ? (err as Error).message : MENSAJE_SKINS_SIN_DATOS_DE_CANCHA)
        if (sinRed()) { detenido = true; return }
        if (!agotado) { programar(intento + 1); return }
        detenido = true
        if (!reportado) {
          reportado = true
          void captureError(err, { context: 'ronda-libre.nueva.skins-contexto', level: 'warning', meta: { courseId } })
        }
      }
    }
    const desdeCero = () => {
      if (reloj) clearTimeout(reloj)
      cancelarLaLectura()
      enPausa = null
      detenido = false
      void leer(0)
    }
    /**
     * Volvió la red o el usuario volvió a la app: si estaba detenido, se relee. También tras un fallo «del tee»: con 0
     * tees sin rating en la base, ese fallo es casi siempre la señal. `reportado` evita reportarlo dos veces.
     */
    const alVolver = () => {
      if (!vigente || document.hidden) return
      if (enPausa != null) { const i = enPausa; enPausa = null; void leer(i); return }
      if (detenido) desdeCero()
    }
    reintentarRef.current = () => {
      if (!vigente) return
      setEstado({ clave, contexto: { estado: 'cargando' } })
      desdeCero()
    }
    window.addEventListener('online', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    void leer(0)
    return () => {
      vigente = false
      if (reloj) clearTimeout(reloj)
      cancelarLaLectura()
      window.removeEventListener('online', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [clave])

  // Lo leído para otra combinación no vale: mientras llega lo nuevo, «cargando».
  return {
    contexto: estado.clave === clave ? estado.contexto : { estado: 'cargando' },
    reintentar: () => reintentarRef.current(),
  }
}

/**
 * Skins en el asistente. Solo existe si el permiso (`puedeCrearJuegoPersonalizado`, vía la API: `permiso`) y el
 * interruptor `SKINS_LIBRE_ABIERTO` lo permiten: si no, `skins` es siempre null y la ronda se crea como siempre.
 */
export function useSkinsDeLaRonda(
  permiso: boolean, ronda: RondaDelSkinsEnElFormulario, esperasMs: readonly number[] = ESPERAS_REINTENTO_CONTEXTO_MS,
  plazoMs: number = PLAZO_LECTURA_CONTEXTO_MS,
) {
  const puedeElegir = SKINS_LIBRE_ABIERTO && permiso
  const [elegido, setSkins] = useState<ConfigSkins | null>(null)
  const skins = puedeElegir ? elegido : null
  const { contexto, reintentar } = useContextoDelSkins(skins != null, ronda, esperasMs, plazoMs)

  const nombres = ronda.jugadores.map(j => j.nombre)
  const problema: ProblemaDelSkins | null = skins
    ? problemaDelSkins({ config: skins, modo: ronda.modo, adminMode: ronda.adminMode, courseId: ronda.courseId, holes: ronda.holes, nombres, contexto })
    : null
  // En Jugadores, una tarjeta sin nombre se avisa antes (si no, el usuario ve 4 tarjetas y lee «es para 4»).
  const problemaEnJugadores: ProblemaDeLaRonda | null = skins ? (problemaPorNombresQueFaltan(ronda.filasSinNombre) ?? problema) : null
  // La lectura de la cancha falló y su aviso es el que manda (no «falta un nombre» ni «un solo celular»).
  const enError = problema?.deLectura === true
  /**
   * FUENTE ÚNICA de cuándo un aviso lleva «Reintentar»: el aviso que muestra la pantalla es el de la lectura fallida.
   * Cada paso pasa el problema que muestra (Jugadores: el suyo, que puede ser otro; Confirmar: el del skins).
   */
  const reintentarSiMuestra = (mostrado: ProblemaDeLaRonda | null): (() => void) | undefined =>
    enError && mostrado === problema ? reintentar : undefined

  return {
    puedeElegir,
    skins,
    setSkins,
    elegir: () => setSkins(s => s ?? skinsPorDefecto()),
    soltar: () => setSkins(null),
    problema,
    problemaEnJugadores,
    enError,
    reintentarSiMuestra,
    reintentar,
    /** Lo que viaja a la API (`reglas_juego`) con el modo de la ronda, o null sin skins. */
    paraEnviar: skins ? { reglasJuego: configSkinsParaEnviar(skins, ronda.modo), problema } : null,
  }
}
