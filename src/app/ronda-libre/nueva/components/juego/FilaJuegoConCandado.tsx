'use client'

import { Info } from '@/components/icons'
import { colores, opcion } from '../estilos'

export const MARCA_PROXIMAMENTE = 'Próximamente'

/** Marca "Próximamente": contorno gris, sin color de estado (no es un error ni un aviso). */
export function MarcaProximamente() {
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: 'var(--text-2)', border: '1px solid var(--text-3)', borderRadius: '10px', padding: '3px 8px',
      whiteSpace: 'nowrap',
    }}>
      {MARCA_PROXIMAMENTE}
    </span>
  )
}

interface Props {
  titulo: string
  subtitulo: string
  /** Lo decide `puedeCrearJuegoPersonalizado` (vía /api/ronda-libre/permiso-timba) y el interruptor del juego. */
  puedeElegir: boolean
  activa: boolean
  onElegir: () => void
  /** La "i" de al lado: abre, para todos, la explicación del juego. */
  info: { etiqueta: string; onAbrir: () => void }
}

/**
 * Candado de los juegos que todavía no están abiertos a todos (Timba libre, Skins): una sola pieza para los dos.
 * Quien no puede elegirlo lo ve marcado "Próximamente": tocarlo no hace nada ni muestra avisos (no es una venta:
 * ningún plan lo desbloquea). La "i" abre la explicación para todos.
 */
export function FilaJuegoConCandado({ titulo, subtitulo, puedeElegir, activa, onElegir, info }: Props) {
  const base = opcion(puedeElegir && activa)
  return (
    <div style={{
      ...base,
      display: 'flex', alignItems: 'center', gap: '4px', padding: '0 4px 0 0',
      background: puedeElegir ? base.background : colores.fondo, cursor: 'default',
    }}>
      <button
        type="button"
        aria-pressed={puedeElegir ? activa : undefined}
        aria-disabled={puedeElegir ? undefined : true}
        onClick={puedeElegir ? onElegir : undefined}
        style={{
          flex: 1, minHeight: '56px', border: 0, background: 'transparent', textAlign: 'left',
          padding: '12px 0 12px 14px', cursor: puedeElegir ? 'pointer' : 'default', color: 'inherit',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '15px', fontWeight: 600,
            color: !puedeElegir ? colores.texto2 : (activa ? colores.oroTexto : colores.texto),
          }}>
            {titulo}
          </span>
          {!puedeElegir && <MarcaProximamente />}
        </span>
        {puedeElegir && (
          <span style={{ display: 'block', fontSize: '12px', color: colores.texto2, marginTop: '2px' }}>
            {subtitulo}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={info.etiqueta}
        onClick={info.onAbrir}
        style={{
          width: '44px', height: '44px', flexShrink: 0, border: 0, borderRadius: '22px', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: colores.texto2, cursor: 'pointer',
        }}
      >
        <Info size={22} strokeWidth={1.6} aria-hidden="true" />
      </button>
    </div>
  )
}
