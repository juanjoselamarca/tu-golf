'use client'

import { Shuffle } from '@/components/icons'
import { hoyosPorTramoParejo, type Pareja } from '@/golf/formats/personalizado'
import {
  conCompanero, parejasFijas, sortear, sorteoVigente, tramosDelSorteo, type JugadorDeLaTimba, type TimbaDelFormulario,
} from '../../hooks/timba-del-formulario'
import { colores, opcion, secundario, tarjeta } from '../estilos'

const ORDINAL_DEL_TRAMO = ['Primer', 'Segundo', 'Tercer'] as const

interface Props {
  timba: TimbaDelFormulario
  onTimba: (t: TimbaDelFormulario) => void
  /** En el orden en que viajan a la API (el creador primero). */
  jugadores: readonly JugadorDeLaTimba[]
  holes: number
}

/**
 * Parejas de la Timba, en Confirmar (recién ahí se sabe quiénes juegan). Parejas fijas: el creador elige a su
 * compañero. Parejas que rotan: se sortean con un botón y el sorteo queda guardado en la ronda. Individual: nada.
 * Con otra cantidad de jugadores no se muestra nada: el aviso del validador ya dice qué falta.
 */
export function ParejasDeLaTimba({ timba, onTimba, jugadores, holes }: Props) {
  const { unidad } = timba.config
  if (unidad === 'individual' || jugadores.length !== 4) return null
  const ids = jugadores.map(j => j.id)
  const nombre = (i: number) => jugadores[i]?.nombre ?? ''
  const contra = ([a, b]: Pareja, [c, d]: Pareja) => `${nombre(a)} y ${nombre(b)} contra ${nombre(c)} y ${nombre(d)}`

  if (unidad === 'parejas_fijas') {
    const parejas = parejasFijas(timba, ids)
    return (
      <section aria-label="Parejas" style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: 600, color: colores.texto }}>¿Con quién juegas en pareja?</span>
        <div role="radiogroup" aria-label="Tu pareja" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {jugadores.slice(1).map(j => {
            const activa = timba.companeroDelCreador === j.id
            return (
              <button
                key={j.id}
                type="button"
                role="radio"
                aria-checked={activa}
                onClick={() => onTimba(conCompanero(timba, j.id))}
                style={{ ...opcion(activa), minHeight: '48px', fontSize: '15px', fontWeight: 600 }}
              >
                {j.nombre}
              </button>
            )
          })}
        </div>
        {parejas && <span style={{ fontSize: '14px', color: colores.texto2 }}>{contra(parejas[0], parejas[1])}</span>}
      </section>
    )
  }

  const orden = sorteoVigente(timba, ids)
  const hoyosPorTramo = hoyosPorTramoParejo(holes)
  return (
    <section aria-label="Parejas" style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={{ fontSize: '15px', fontWeight: 600, color: colores.texto }}>
        Parejas{hoyosPorTramo ? ` · rotan cada ${hoyosPorTramo} hoyos` : ''}
      </span>
      {orden ? (
        <ol aria-label="Parejas por tramo" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tramosDelSorteo(orden).map(([p1, p2], i) => (
            <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: colores.texto2 }}>{ORDINAL_DEL_TRAMO[i]} tramo</span>
              <span style={{ fontSize: '14px', color: colores.texto }}>{contra(p1, p2)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <span style={{ fontSize: '14px', color: colores.texto2 }}>Se sortean antes de salir y quedan guardadas.</span>
      )}
      <button
        type="button"
        onClick={() => onTimba(sortear(timba, ids))}
        style={{ ...secundario, minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        <Shuffle size={18} strokeWidth={1.8} aria-hidden="true" />
        {orden ? 'Volver a sortear' : 'Sortear parejas'}
      </button>
    </section>
  )
}
