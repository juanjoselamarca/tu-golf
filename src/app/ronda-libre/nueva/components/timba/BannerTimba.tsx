'use client'

import { SlidersHorizontal, X } from '@/components/icons'
import { BottomSheet } from '@/components/ui/BottomSheet'
import {
  MARCA_PROXIMAMENTE, NOMBRE_PUNTITO, PLANTILLAS_DEL_CATALOGO, SUBTITULO_TIMBA, TITULO_TIMBA,
  bajadaDePlantilla, jugadoresDePlantilla, nombreEnBanner,
} from './catalogo'
import { PUNTITOS_DEL_CATALOGO } from '@/golf/formats/personalizado'

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

const caption = {
  fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-2)',
}

interface Props {
  abierto: boolean
  onCerrar: () => void
  /** Solo a quien todavía no puede elegirla se le marca "Próximamente". */
  proximamente: boolean
}

/** Banner informativo de Timba libre (maqueta Bloqueo): qué juegos trae. Lo abre la "i" del selector, para todos. */
export function BannerTimba({ abierto, onCerrar, proximamente }: Props) {
  return (
    <BottomSheet abierto={abierto} onCerrar={onCerrar} etiqueta={TITULO_TIMBA}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700 }}>{TITULO_TIMBA}</span>
              {proximamente && <MarcaProximamente />}
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>{SUBTITULO_TIMBA}</span>
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

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {PLANTILLAS_DEL_CATALOGO.map((p, i) => (
            <li key={p} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0',
              borderBottom: i < PLANTILLAS_DEL_CATALOGO.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>{nombreEnBanner(p)}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>{bajadaDePlantilla(p)}</span>
              </div>
              <span
                aria-label={`${jugadoresDePlantilla(p).replace('–', ' a ')} jugadores`}
                style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '13px', color: 'var(--text-2)' }}
              >
                {jugadoresDePlantilla(p)}
              </span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={caption}>Puntos especiales</span>
            <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>en cualquier juego</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {PUNTITOS_DEL_CATALOGO.map(t => (
              <span key={t} style={{
                fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', border: '1px solid var(--border)',
                borderRadius: '14px', padding: '5px 10px',
              }}>
                + {NOMBRE_PUNTITO[t]}
              </span>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', border: '1.5px dashed var(--text-3)',
          borderRadius: '12px', padding: '12px 14px',
        }}>
          <SlidersHorizontal size={22} strokeWidth={1.6} aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>{nombreEnBanner('personalizado_total')}</span>
            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>{bajadaDePlantilla('personalizado_total')}</span>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}
