'use client'

import { useMemo } from 'react'
import { estaRetiradoEn, hoyoDesdeElQueSeRetira, hoyosParaElegirElRetiro, nombreDelPuntito, tieneGolpesDesde } from '@/golf/formats/personalizado'
import { retirosVigentes } from '@/golf/ronda-libre/retiros-de-la-timba'
import { marcasDelHoyo, puntitosMarcables, type MarcasDeUnPuntito, type PuntitoMarcable } from '@/golf/ronda-libre/marcas-de-la-timba'
import { esVistaDelSkins, type VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import type { VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'
import { useJuegoDeLaTimba, type EstadoDelJuego } from '../../hooks/useJuegoDeLaTimba'
import { useMarcasDeLaTimba, type MarcasDeLaTimba } from './useMarcasDeLaTimba'

/** Lo que el scorer de grupo lee de `GET /juego`: el juego de la Timba, o los puntos especiales de un skins. */
export type VistaDelScorer = VistaDelJuego | VistaDelSkinsEnElScorer

const SIN_RETIROS: Readonly<Record<string, number>> = Object.freeze({})

/**
 * Cada cuánto el scorer vuelve a leer el juego con la pantalla quieta. Una Timba se anota en un solo celular
 * (`MENSAJE_TIMBA_UN_CELULAR`): los golpes y marcas nuevos son de este teléfono y ya piden el juego al guardarse
 * (`firma`). El poll cubre lo que pasa en otro lado (la ronda cerrada desde otro dispositivo) y, con la pantalla
 * quieta, el reintento de marcas que quedaron en cola sin señal (`useMarcasDeLaTimba` reintenta con cada vista
 * nueva): a lo más 60 s después de volver la señal; al finalizar se envían igual. Con el ritmo de 20 s del
 * espectador, la pantalla quieta pedía el juego 3-4 veces por minuto.
 */
export const INTERVALO_JUEGO_SCORER_S = 60

export interface JugadorParaRetiro {
  id: string
  nombre: string
  retiradoDesde: number | null
  /** Por defecto: el hoyo actual si no lo anotó, o el primero sin anotar después (`hoyoDesdeElQueSeRetira`). */
  desdeSiSeVa: number | null
  /** Para elegir otro si se acordaron tarde: de la salida hasta el actual (`hoyosParaElegirElRetiro`). */
  hoyosParaElegir: number[]
  /** De `hoyosParaElegir`, desde cuáles ya tiene golpes anotados (`tieneGolpesDesde`): la hoja avisa que dejan de contar. */
  conGolpesDesde: number[]
}

export interface TimbaDelScorer {
  /** El juego de la Timba (panel «Juego»). En un skins no hay juego que mostrar acá: queda en `error`. */
  juego: EstadoDelJuego
  recargar: () => Promise<void>
  marcas: MarcasDeLaTimba
  nombres: Record<string, string>
  /** jugadorId → hoyo desde el que se retiró: lo último de `GET /juego` más lo confirmado en este teléfono. */
  retiros: Readonly<Record<string, number>>
  retiradoEn: (jugadorId: string, hoyo: number) => boolean
  /** Puntos especiales para marcar en el hoyo actual (vacío si no hay juego o si el hoyo no tiene ninguno). */
  puntosDelHoyo: MarcasDeUnPuntito[]
  retiradosDelHoyo: ReadonlySet<string>
  birdieAutomatico: boolean
  /** "Sandy de Juan en el hoyo 4": las marcas que el servidor rechazó. */
  lineasRechazadas: string[]
  jugadoresParaRetiro: JugadorParaRetiro[]
}

/**
 * Todo lo de la Timba en el scorer de grupo: la vista del juego (`GET /juego`), las marcas con su cola offline y
 * los retiros, armados para las vistas. En un skins, lo mismo para sus puntos especiales (cada uno vale 1 skin; sin
 * birdie automático ni juicio del motor: juzga el teléfono con la misma regla). Fuera de una Timba o un skins
 * (`activo: false`) no pide nada.
 */
export function useTimbaDelScorer(input: {
  codigo: string
  activo: boolean
  conexion: string
  jugadores: ReadonlyArray<{ id: string; nombre: string }>
  scores: Readonly<Record<string, Readonly<Record<number, number>>>>
  /**
   * Cambia SOLO cuando el servidor ya tiene golpes nuevos (`guardados` de `useGrupoScoreSave`): vuelve a pedir el
   * juego. Nada que cambie sin un guardado (estado del envío, golpes aún en el teléfono): sería un pedido de más,
   * y uno que llega antes que el guardado trae el juego viejo.
   */
  firma: string
  currentHole: number
  ordenHoyos: readonly number[]
  /** Par del hoyo actual; `undefined` si no se conoce (el greenie, solo par 3, no se ofrece). */
  par: number | undefined
}): TimbaDelScorer {
  const { codigo, activo, conexion, jugadores, scores, firma, currentHole, ordenHoyos, par } = input
  const { juego, vista, vistaPedidaEn, recargar } = useJuegoDeLaTimba<VistaDelScorer>(codigo, { activo, firma, intervaloS: INTERVALO_JUEGO_SCORER_S })
  const marcas = useMarcasDeLaTimba({ codigo, activo, vista, vistaPedidaEn, recargar, conexion })

  const nombres = useMemo(() => Object.fromEntries(jugadores.map(j => [j.id, j.nombre])), [jugadores])
  // El retiro confirmado en el teléfono vale aunque `GET /juego` falle: si no, "Siguiente" le pondría par.
  const servidor = vista?.retiros ?? SIN_RETIROS
  const confirmados = marcas.retirosConfirmados
  const retiros = useMemo(
    () => (Object.keys(confirmados).length === 0 ? servidor : retirosVigentes(servidor, confirmados)),
    [servidor, confirmados],
  )

  const derivados = useMemo(() => {
    const retiradoEn = (jugadorId: string, hoyo: number) => estaRetiradoEn(retiros[jugadorId], hoyo, ordenHoyos)
    const retiradosDelHoyo = new Set(jugadores.filter(j => retiradoEn(j.id, currentHole)).map(j => j.id))
    const timba = vista && !esVistaDelSkins(vista) ? vista : null
    const puntosDelHoyo = vista && ordenHoyos.includes(currentHole)
      ? marcasDelHoyo({
          puntitos: puntitosMarcables<PuntitoMarcable>(vista.config, par),
          jugadorIds: vista.jugadorIds,
          hoyo: currentHole,
          marcas: marcas.marcas,
          enEspera: marcas.enCola,
          resultadoDelHoyo: timba?.resultado.hoyos.find(h => h.numero === currentHole) ?? null,
          // Los golpes como están en el teléfono: el botón aparece apenas se anota el par, sin esperar al servidor.
          golpes: Object.fromEntries(vista.jugadorIds.map(id => [id, scores[id]?.[currentHole]])),
          par,
          retirados: retiradosDelHoyo,
        })
      : []
    const birdieAutomatico = !!timba?.config.puntitos.some(p => p.tipo === 'birdie' && p.activo)
    const lineasRechazadas = marcas.rechazadas.map(m => {
      const puntito = vista?.config.puntitos.find((p: PuntitoMarcable) => p.id === m.puntitoId)
      const nombrePuntito = puntito ? nombreDelPuntito(puntito) : 'Punto especial'
      const jugador = nombres[m.jugadorId] ?? 'un jugador'
      const base = `${nombrePuntito} de ${jugador} en el hoyo ${m.hoyo}`
      return m.marcar ? base : `Quitar: ${base}`
    })
    const jugadoresParaRetiro = jugadores.map(j => {
      const desdeSiSeVa = hoyoDesdeElQueSeRetira(scores[j.id], currentHole, ordenHoyos)
      const hoyosParaElegir = hoyosParaElegirElRetiro(ordenHoyos, currentHole, desdeSiSeVa)
      return {
        id: j.id,
        nombre: j.nombre,
        retiradoDesde: retiros[j.id] ?? null,
        desdeSiSeVa,
        hoyosParaElegir,
        conGolpesDesde: hoyosParaElegir.filter(h => tieneGolpesDesde(scores[j.id], h, ordenHoyos)),
      }
    })
    return { retiradoEn, retiradosDelHoyo, puntosDelHoyo, birdieAutomatico, lineasRechazadas, jugadoresParaRetiro }
  }, [retiros, ordenHoyos, jugadores, currentHole, vista, par, marcas.marcas, marcas.enCola, marcas.rechazadas, nombres, scores])

  const juegoDeLaTimba = useMemo(
    (): EstadoDelJuego => (juego.estado === 'ok' && esVistaDelSkins(juego.vista) ? { estado: 'error' } : (juego as EstadoDelJuego)),
    [juego],
  )

  return { juego: juegoDeLaTimba, recargar, marcas, nombres, retiros, ...derivados }
}
