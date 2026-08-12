'use client'

import type { CourseLoop, CourseTee } from '@/lib/data/ronda-libre-nueva'
import { colores, etiqueta, opcion } from './estilos'

interface Props {
  loops: CourseLoop[]
  tees: CourseTee[]
  elegidos: string[]
  onElegir: (recorridos: string[]) => void
}

interface Combinacion {
  recorridos: string[]
  par: number
  hoyos: number
  clave: string
}

/**
 * Clave de una combinación de recorridos: nombres en minúscula y ordenados
 * alfabéticamente. Los tees de estas canchas se llaman `blanco_norte_sur`, así
 * que la MISMA clave sirve para encontrar el tee de la combinación. Con dos
 * formas de armarla (una para comparar, otra para buscar el tee), "Sur + Norte"
 * y "Norte + Sur" dejaban de ser la misma cosa.
 */
function claveDe(recorridos: string[]): string {
  return recorridos.map(r => r.toLowerCase()).sort().join('_')
}

function combinacionesDe(loops: CourseLoop[]): Combinacion[] {
  const combos: Combinacion[] = []
  for (let i = 0; i < loops.length; i++) {
    for (let j = i + 1; j < loops.length; j++) {
      const a = loops[i]
      const b = loops[j]
      combos.push({
        recorridos: [a.recorrido, b.recorrido],
        par: a.par + b.par,
        hoyos: a.holes + b.holes,
        clave: claveDe([a.recorrido, b.recorrido]),
      })
    }
  }
  return combos
}

/** Elige qué dos recorridos se juegan en una cancha de 27 o 36 hoyos. */
export function SelectorRecorridos({ loops, tees, elegidos, onElegir }: Props) {
  const combos = combinacionesDe(loops)
  const claveActiva = elegidos.length === 2 ? claveDe(elegidos) : null

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ ...etiqueta, marginBottom: '10px' }}>Elige tu recorrido</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {combos.map(combo => {
          const activo = combo.clave === claveActiva
          const teeBlanco = tees
            .filter(t => t.nombre.toLowerCase().includes(combo.clave))
            .find(t => t.nombre.startsWith('blanco'))
          return (
            <button
              key={combo.clave}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(combo.recorridos)}
              style={{ ...opcion(activo), padding: '16px 20px', borderRadius: '14px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{
                    fontFamily: '"Playfair Display", serif', fontSize: '16px', fontWeight: 600,
                    color: activo ? colores.oroTexto : colores.texto,
                  }}>
                    {combo.recorridos.join(' + ')}
                  </div>
                  <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: colores.texto2, marginTop: '3px' }}>
                    {/* Los hoyos salen de los recorridos, no de un 18 fijo: dos
                        loops de 9 son 18, pero un club puede publicar loops de
                        otro tamaño y el texto tiene que decir la verdad. */}
                    {combo.hoyos} hoyos &middot; Par {combo.par}
                    {teeBlanco?.yardaje_total ? ` · ${teeBlanco.yardaje_total.toLocaleString()} yds` : ''}
                  </div>
                </div>
                {teeBlanco?.rating && teeBlanco?.slope ? (
                  <div style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '11px', color: colores.texto3, textAlign: 'right', flexShrink: 0 }}>
                    <div>CR {teeBlanco.rating}</div>
                    <div>Slope {teeBlanco.slope}</div>
                  </div>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
