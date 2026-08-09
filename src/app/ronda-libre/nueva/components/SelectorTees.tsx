'use client'

import type { CourseTee } from '@/lib/data/ronda-libre-nueva'
import { colores, etiqueta, opcion } from './estilos'

/** Tees genéricos cuando la cancha no publica los suyos. */
const TEES_GENERICOS = ['Negras', 'Azul', 'Blanco', 'Rojo']

interface Props {
  tees: CourseTee[]
  /** Recorridos elegidos: filtran los tees a los de esa combinación. */
  recorridosElegidos: string[]
  valor: string
  onElegir: (tee: string) => void
}

/** "blanco_norte_sur" → "Blanco". Sin recorridos, sólo capitaliza. */
export function nombreVisibleDeTee(nombre: string, hayRecorridos: boolean): string {
  const base = hayRecorridos ? nombre.split('_')[0] : nombre
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function SelectorTees({ tees, recorridosElegidos, valor, onElegir }: Props) {
  const clave = recorridosElegidos.length === 2
    ? recorridosElegidos.map(r => r.toLowerCase()).sort().join('_')
    : null

  const filtrados = clave ? tees.filter(t => t.nombre.toLowerCase().includes(clave)) : tees
  // Si el filtro no deja nada, mostrar todos: quedarse sin tees visibles dejaría
  // al usuario sin poder elegir.
  const aMostrar = filtrados.length > 0 ? filtrados : tees

  if (aMostrar.length === 0) {
    return (
      <div>
        <label style={etiqueta}>Tees</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TEES_GENERICOS.map(t => {
            const val = t.toLowerCase()
            const activo = valor === val
            return (
              <button
                key={t}
                type="button"
                aria-pressed={activo}
                onClick={() => onElegir(val)}
                style={{
                  padding: '10px 18px', borderRadius: '24px', minHeight: '44px',
                  border: `1px solid ${activo ? colores.oro : colores.inputBorde}`,
                  background: activo ? colores.oro : colores.fondo,
                  color: activo ? colores.oroSobreTexto : colores.texto2,
                  fontSize: '14px', fontWeight: activo ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label style={etiqueta}>Tees</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {aMostrar.map(t => {
          const val = t.nombre.toLowerCase()
          const activo = valor === val
          // P5: el yardaje viene null en 357 de 481 tees de FedeGolf. Se ocultan
          // los tokens sin número en vez de mostrar "null yds".
          const datos = [
            t.yardaje_total ? `${t.yardaje_total.toLocaleString()} yds` : null,
            t.rating ? `CR ${t.rating}` : null,
            t.slope ? `Slope ${t.slope}` : null,
          ].filter(Boolean).join(' · ')

          return (
            <button
              key={t.nombre}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(val)}
              style={opcion(activo)}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: activo ? colores.oroTexto : colores.texto }}>
                {nombreVisibleDeTee(t.nombre, clave != null)}
              </div>
              {datos && (
                <div style={{ fontSize: '11px', color: colores.texto2, marginTop: '2px' }}>{datos}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
