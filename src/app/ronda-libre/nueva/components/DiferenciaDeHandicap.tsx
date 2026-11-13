'use client'

import { calcularDiferenciaHandicap } from '@/golf/formats'
import { formatearHandicap } from '@/golf/handicap-index-range'
import { colores } from './estilos'

interface Jugador {
  nombre: string
  /** Golpes de la ronda (en 9 hoyos, los de 9): con esto se calcula la ventaja. */
  golpes: number | null
  /** HCP que se muestra: siempre el de 18 hoyos. */
  hcp: number | null
}

interface Props {
  jugadorA: Jugador
  jugadorB: Jugador
  /** Hoyos de la ronda: en 9, la ventaja se anuncia "en 9 hoyos". */
  hoyos: number
}

/**
 * Ventaja que reparte el Match Play antes de empezar.
 *
 * Los golpes llegan ya calculados por el motor (`resolverCourseHandicap`), no
 * se re-derivan acá: este bloque tenía su propia copia de la fórmula WHS con el
 * par de 18 hoyos fijo, así que en una vuelta de 9 anunciaba el doble de
 * strokes de ventaja de los que el marcador después repartía.
 *
 * La diferencia sale de `calcularDiferenciaHandicap` (R&A 6.2a), el mismo que
 * usa el motor de match play.
 *
 * Los HCP del rótulo son los de 18 hoyos (regla de Juanjo, 12-nov-2026: nunca un
 * HCP partido en 2). En una vuelta de 9 la ventaja sale de los golpes de 9, así
 * que la frase dice "en 9 hoyos": sin eso, "HCP 15 vs 8 · recibe 4" no cuadra.
 */
export function DiferenciaDeHandicap({ jugadorA, jugadorB, hoyos }: Props) {
  const listo = jugadorA.golpes != null && jugadorB.golpes != null

  return (
    <div style={{
      marginTop: '12px', padding: '14px',
      background: colores.oroTenue,
      border: `1px solid ${colores.oroBorde}`,
      borderRadius: '12px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: colores.oroTexto, marginBottom: '8px' }}>
        Diferencia de handicap
      </div>
      {!listo ? (
        <div style={{ fontSize: '13px', color: colores.texto2 }}>
          Carga el índice de los dos jugadores para ver la ventaja.
        </div>
      ) : (
        <Detalle jugadorA={jugadorA} jugadorB={jugadorB} hoyos={hoyos} />
      )}
    </div>
  )
}

function Detalle({ jugadorA, jugadorB, hoyos }: Props) {
  const [strokesA, strokesB] = calcularDiferenciaHandicap(jugadorA.golpes ?? 0, jugadorB.golpes ?? 0)
  const ventaja = Math.max(strokesA, strokesB)

  const enNueve = hoyos <= 9
  const receptor = strokesA > 0 ? jugadorA.nombre : jugadorB.nombre

  return (
    <div style={{ fontSize: '13px', color: colores.texto2, lineHeight: 1.6 }}>
      {ventaja === 0 ? (
        // En 9 hoyos dos HCP distintos pueden dar los mismos golpes: no se afirma
        // "mismo handicap" junto a dos HCP que no lo son.
        enNueve ? 'Sin strokes de ventaja en 9 hoyos' : 'Mismo handicap — sin strokes de ventaja'
      ) : (
        <>
          <strong>{receptor}</strong> recibe{' '}
          <strong style={{ color: colores.oroTexto }}>
            {ventaja} stroke{ventaja !== 1 ? 's' : ''}
          </strong>{' '}
          de ventaja{enNueve ? ' en 9 hoyos' : ''}
        </>
      )}
      {/* Nunca cae a los golpes: en 9 hoyos serían la mitad del HCP. En 18 con
          ventaja 0 los HCP son iguales y la línea sobra. */}
      {(enNueve || ventaja > 0) && jugadorA.hcp != null && jugadorB.hcp != null && (
        <>
          <br />
          <span style={{ fontSize: '11px', color: colores.texto3 }}>
            HCP cancha: {formatearHandicap(jugadorA.hcp)} ({jugadorA.nombre}) vs {formatearHandicap(jugadorB.hcp)} ({jugadorB.nombre})
          </span>
        </>
      )}
    </div>
  )
}
