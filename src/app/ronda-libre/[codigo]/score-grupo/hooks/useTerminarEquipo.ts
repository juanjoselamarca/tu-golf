'use client'

import { useState } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { haptic } from '@/lib/ronda/helpers'
import { cerrarCopiaLocalAlFinalizar } from '@/lib/ronda/score-storage'
import { terminarEquipoDeRonda } from '@/lib/data/ronda-libre-anotador'
import { AVISO_TERMINAR_SIN_SERVIDOR, avisoEquipoIncompletoAlTerminar } from '@/components/ronda/finalizar-copy'
import { equipoAjenoIncompleto, equipoTerminado, equiposSinParAutomatico } from '@/golf/ronda-libre/anotador-de-equipo'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import type { RondaLibre } from '@/types/ronda'
import type { ResultadoEnvio } from './useGrupoScoreSave'
import type { CierreEnCurso } from './useFinalizeGrupo'
import { resolverEnvioDelCierre, subirDrivesAntesDeCerrar } from './cierre-compartido'

export interface TerminarEquipo {
  /** Primer toque: abre la hoja (o avisa qué equipo está incompleto). Con la hoja abierta: termina. */
  terminar: () => Promise<void>
  terminando: boolean
  confirmarTerminar: boolean
  setConfirmarTerminar: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * «Terminar mi equipo» (un celular por equipo, migración 20261127150000_terminar_equipo_de_ronda): cada celular cierra
 * las tarjetas que anota (`teamEquipos`, ya sin los terminados: `equiposPorTerminar`) y la ronda se cierra sola cuando
 * termina el último equipo, en la misma transacción de la base. Mismo esqueleto que Finalizar (`useFinalizeGrupo`):
 *  1. el valor del hoyo en pantalla se confirma y el equipo que este celular RECLAMÓ se completa con par (los sin
 *     reclamar que anota el creador no: sería un par inventado; un hoyo vacío ahí frena antes de abrir la hoja);
 *  2. se envían los pendientes y se espera el resultado (`resolverEnvioDelCierre`, el mismo de Finalizar);
 *  3. drives en cola, mejor esfuerzo;
 *  4. `terminarEquipoDeRonda` por cada equipo. Sin señal no se encola: el aviso pide reintentar y el reintento es
 *     idempotente.
 * Historial: en esta ronda nadie juega una tarjeta propia (todo jugador va solo por estructura en un equipo de club,
 * `vaSoloPorEstructura`), así que no hay nada que guardar, igual que al finalizar hoy.
 */
export function useTerminarEquipo(input: {
  ronda: RondaLibre | null
  codigo: string
  /** Hoyos de la ronda en orden de juego. */
  hoyos: readonly number[]
  teamEquipos: EquipoDelScorer[]
  authUserId: string | null
  /** Hoyo en pantalla y su par: se confirman como con «Siguiente» (`confirmarHoyo`). */
  hoyoEnPantalla: number
  parEnPantalla: number
  confirmarHoyo: (hole: number, par: number) => Promise<void>
  /** Completa con par los hoyos vacíos del equipo que este celular reclamó (`useTeamScoreSave`). */
  completarEquiposConPar: (equipos: EquipoDelScorer[], hoyos: readonly number[]) => EquipoDelScorer[]
  enviarPendientes: (
    overrideScores?: Record<string, Record<number, number>>,
    opciones?: { reintentarRechazados?: boolean },
  ) => Promise<ResultadoEnvio>
  /** Exclusión con Finalizar y Descartar (`useFinalizeGrupo`). */
  cierreEnCurso: React.MutableRefObject<CierreEnCurso>
  recargar: () => Promise<void>
}): TerminarEquipo {
  const { ronda, codigo, hoyos, teamEquipos, authUserId, hoyoEnPantalla, parEnPantalla, cierreEnCurso } = input
  const router = useRouter()
  const [terminando, setTerminando] = useState(false)
  const [confirmarTerminar, setConfirmarTerminar] = useState(false)

  const terminar = async () => {
    if (!ronda || terminando || cierreEnCurso.current) return
    if (!confirmarTerminar) {
      // Un equipo sin reclamar que anota este celular (el creador: «Anotarlo yo» o uno liberado) no recibe par: con un
      // hoyo vacío (fuera del de pantalla, que se confirma al terminar) frena ya, sin abrir la hoja, y dice cuál.
      const sinPar = equiposSinParAutomatico(ronda, teamEquipos, authUserId)
      const falta = equipoAjenoIncompleto(sinPar, hoyos.filter(h => h !== hoyoEnPantalla))
      if (falta) {
        addToast({ type: 'error', title: avisoEquipoIncompletoAlTerminar(falta.equipo.nombre, falta.hoyo), duration: 8000 })
        haptic([30, 60, 30])
        return
      }
      setConfirmarTerminar(true)
      haptic([20, 50, 20])
      return
    }
    setConfirmarTerminar(false)
    cierreEnCurso.current = 'terminar'
    setTerminando(true)
    haptic(30)
    // Mientras navega el botón sigue en «Terminando…». Cualquier otra salida, incluida una excepción, lo libera.
    const nav = { navegando: false }
    try {
      await terminarUnaVez(ronda, nav)
    } catch (e) {
      void captureError(e instanceof Error ? e : new Error(String(e)), { context: 'score_grupo_terminar.excepcion', meta: { codigo } })
      addToast({ ...AVISO_TERMINAR_SIN_SERVIDOR, type: 'error', duration: 7000 })
    } finally {
      if (!nav.navegando) {
        cierreEnCurso.current = null
        setTerminando(false)
      }
    }
  }

  const terminarUnaVez = async (ronda: RondaLibre, nav: { navegando: boolean }): Promise<void> => {
    const irA = (destino: string) => {
      nav.navegando = true
      router.push(destino)
    }
    const avisarSinServidor = () => addToast({ ...AVISO_TERMINAR_SIN_SERVIDOR, type: 'error', duration: 7000 })
    if (!authUserId) { avisarSinServidor(); return }
    const porTerminar = teamEquipos.filter(e => !equipoTerminado(e))
    // Sin equipos que terminar (la lista cambió): se relee; si todos los suyos terminaron, la carga lleva a la vista en vivo.
    if (porTerminar.length === 0) { await input.recargar(); return }

    // 1. Primero el par del equipo reclamado (encola su `setTeamEquipos`) y después el hoyo en pantalla: `confirmarHoyo`
    //    actualiza sobre el estado anterior con flushSync, así que no pisa lo que se acaba de completar.
    const completos = input.completarEquiposConPar(teamEquipos, hoyos)
    await input.confirmarHoyo(hoyoEnPantalla, parEnPantalla)

    // 2. Pendientes, esperando el resultado.
    const envio = resolverEnvioDelCierre(await input.enviarPendientes(undefined, { reintentarRechazados: true }), {
      ronda, teamEquipos, codigo, avisarSinServidor,
    })
    if (envio === 'corta') return
    if (envio === 'cerrada') { irA(`/ronda-libre/${codigo}?finished=true`); return }

    // 3. Drives en cola.
    const supabase = createClient()
    await subirDrivesAntesDeCerrar(supabase, codigo, 'score_grupo_terminar_drives')

    // 4. Terminar cada equipo de este celular.
    let rondaCerrada = false
    for (const equipo of porTerminar) {
      const r = await terminarEquipoDeRonda(supabase, codigo, equipo.id)
      if (r.estado === 'ok') { rondaCerrada ||= r.rondaCerrada; continue }
      if (r.estado === 'incompleto') {
        // El servidor no tiene todos sus hoyos (un golpe que no subió, o un hoyo vacío en un equipo sin par automático).
        const local = completos.find(e => e.id === equipo.id) ?? equipo
        const hoyo = equipoAjenoIncompleto([local], hoyos)?.hoyo ?? null
        addToast({ type: 'error', title: avisoEquipoIncompletoAlTerminar(equipo.nombre, hoyo), duration: 8000 })
        haptic([30, 60, 30])
        void input.recargar()
        return
      }
      if (r.ronda === 'sin_respuesta') { avisarSinServidor(); return }
      if (r.ronda === 'cerrada') { irA(`/ronda-libre/${codigo}?finished=true`); return }
      // Ya no lo anota este celular (lo liberaron o lo sacaron): se relee quién anota qué.
      addToast({ type: 'info', title: r.mensaje, duration: 7000 })
      void input.recargar()
      return
    }

    // Todo lo de este celular subió (sin pendientes, arriba) y sus equipos quedaron cerrados: su copia se borra.
    // «Corregir mi tarjeta» reabre el equipo y el scorer lo carga del servidor.
    cerrarCopiaLocalAlFinalizar(codigo)
    irA(rondaCerrada ? `/ronda-libre/${codigo}?finished=true` : `/ronda-libre/${codigo}`)
  }

  return { terminar, terminando, confirmarTerminar, setConfirmarTerminar }
}
