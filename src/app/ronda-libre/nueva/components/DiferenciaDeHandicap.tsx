'use client'

import { calcularDiferenciaHandicap } from '@/golf/formats'
import { colores } from './estilos'

interface Props {
  jugadorA: { nombre: string; golpes: number | null }
  jugadorB: { nombre: string; golpes: number | null }
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
 */
export function DiferenciaDeHandicap({ jugadorA, jugadorB }: Props) {
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
        <Detalle jugadorA={jugadorA} jugadorB={jugadorB} />
      )}
    </div>
  )
}

function Detalle({ jugadorA, jugadorB }: Props) {
  const hcpA = jugadorA.golpes ?? 0
  const hcpB = jugadorB.golpes ?? 0
  const [strokesA, strokesB] = calcularDiferenciaHandicap(hcpA, hcpB)
  const ventaja = Math.max(strokesA, strokesB)

  if (ventaja === 0) {
    return (
      <div style={{ fontSize: '13px', color: colores.texto2 }}>
        Mismo handicap — sin strokes de ventaja
      </div>
    )
  }

  const receptor = strokesA > 0 ? jugadorA.nombre : jugadorB.nombre

  return (
    <div style={{ fontSize: '13px', color: colores.texto2, lineHeight: 1.6 }}>
      <strong>{receptor}</strong> recibe{' '}
      <strong style={{ color: colores.oroTexto }}>
        {ventaja} stroke{ventaja !== 1 ? 's' : ''}
      </strong>{' '}
      de ventaja
      <br />
      <span style={{ fontSize: '11px', color: colores.texto3 }}>
        HCP cancha: {hcpA} ({jugadorA.nombre}) vs {hcpB} ({jugadorB.nombre})
      </span>
    </div>
  )
}
