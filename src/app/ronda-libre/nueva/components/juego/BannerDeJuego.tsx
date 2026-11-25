'use client'

import type { ReactNode } from 'react'
import { X } from '@/components/icons'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { MarcaProximamente } from './FilaJuegoConCandado'

interface Props {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  subtitulo: string
  /** Solo a quien todavía no puede elegirlo se le marca "Próximamente". */
  proximamente: boolean
  children: ReactNode
}

/** Hoja informativa de un juego (lo que abre la "i" de `FilaJuegoConCandado`): cabecera común y el contenido del juego. */
export function BannerDeJuego({ abierto, onCerrar, titulo, subtitulo, proximamente, children }: Props) {
  return (
    <BottomSheet abierto={abierto} onCerrar={onCerrar} etiqueta={titulo}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700 }}>{titulo}</span>
              {proximamente && <MarcaProximamente />}
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>{subtitulo}</span>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            style={{
              width: '44px', height: '44px', margin: '-8px -10px 0 0', flexShrink: 0, border: 0, background: 'transparent',
              color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </BottomSheet>
  )
}
