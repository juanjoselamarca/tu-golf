'use client'

import { useState } from 'react'
import { Info } from '@/components/icons'
import { colores, opcion } from '../estilos'
import { BannerTimba, MarcaProximamente } from './BannerTimba'
import { SUBTITULO_TIMBA, TITULO_TIMBA } from './catalogo'

interface Props {
  /** Lo decide `puedeCrearJuegoPersonalizado` (vía /api/ronda-libre/permiso-timba). */
  puedeElegir: boolean
  activa: boolean
  onElegir: () => void
}

/**
 * Timba libre en el selector de formato (maqueta Bloqueo). Quien todavía no puede elegirla la ve marcada
 * "Próximamente": tocarla no hace nada ni muestra avisos. La "i" de al lado abre, para todos, el banner con
 * los juegos que trae.
 */
export function FilaTimbaLibre({ puedeElegir, activa, onElegir }: Props) {
  const [banner, setBanner] = useState(false)
  const base = opcion(puedeElegir && activa)

  return (
    <>
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
              {TITULO_TIMBA}
            </span>
            {!puedeElegir && <MarcaProximamente />}
          </span>
          {puedeElegir && (
            <span style={{ display: 'block', fontSize: '12px', color: colores.texto2, marginTop: '2px' }}>
              {SUBTITULO_TIMBA}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label="Ver juegos de Timba libre"
          onClick={() => setBanner(true)}
          style={{
            width: '44px', height: '44px', flexShrink: 0, border: 0, borderRadius: '22px', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: colores.texto2, cursor: 'pointer',
          }}
        >
          <Info size={22} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <BannerTimba abierto={banner} onCerrar={() => setBanner(false)} proximamente={!puedeElegir} />
    </>
  )
}
