'use client'

import { useMemo } from 'react'
import { estaRetiradoEn, hoyoDesdeElQueSeRetira, hoyosParaElegirElRetiro, nombreDelPuntito, tieneGolpesDesde } from '@/golf/formats/personalizado'
import { retirosVigentes } from '@/golf/ronda-libre/retiros-de-la-timba'
import { marcasDelHoyo, puntitosMarcables, type MarcasDeUnPuntito } from '@/golf/ronda-libre/marcas-de-la-timba'
import { useJuegoDeLaTimba, type EstadoDelJuego } from '../../hooks/useJuegoDeLaTimba'
import { useMarcasDeLaTimba, type MarcasDeLaTimba } from './useMarcasDeLaTimba'

const SIN_RETIROS: Readonly<Record<string, number>> = Object.freeze({})

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
 * los retiros, armados para las vistas. Fuera de una Timba (`activo: false`) no pide nada.
 */
export function useTimbaDelScorer(input: {
  codigo: string
  activo: boolean
  conexion: string
  jugadores: ReadonlyArray<{ id: string; nombre: string }>
  scores: Readonly<Record<string, Readonly<Record<number, number>>>>
  /** Cambia cuando el servidor tiene golpes nuevos: vuelve a pedir el juego. */
  firma: string
  currentHole: number
  ordenHoyos: readonly number[]
  /** Par del hoyo actual; `undefined` si no se conoce (el greenie, solo par 3, no se ofrece). */
  par: number | undefined
}): TimbaDelScorer {
  const { codigo, activo, conexion, jugadores, scores, firma, currentHole, ordenHoyos, par } = input
  const { juego, vista, vistaPedidaEn, recargar } = useJuegoDeLaTimba(codigo, { activo, firma })
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
    const puntosDelHoyo = vista && ordenHoyos.includes(currentHole)
      ? marcasDelHoyo({
          puntitos: puntitosMarcables(vista.config, par),
          jugadorIds: vista.jugadorIds,
          hoyo: currentHole,
          marcas: marcas.marcas,
          enEspera: marcas.enCola,
          resultadoDelHoyo: vista.resultado.hoyos.find(h => h.numero === currentHole) ?? null,
        })
      : []
    const birdieAutomatico = !!vista?.config.puntitos.some(p => p.tipo === 'birdie' && p.activo)
    const lineasRechazadas = marcas.rechazadas.map(m => {
      const puntito = vista?.config.puntitos.find(p => p.id === m.puntitoId)
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

  return { juego, recargar, marcas, nombres, retiros, ...derivados }
}
