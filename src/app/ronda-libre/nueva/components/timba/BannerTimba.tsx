'use client'

import { SlidersHorizontal } from '@/components/icons'
import {
  NOMBRE_PUNTITO, PLANTILLAS_DEL_CATALOGO, SUBTITULO_TIMBA, TITULO_TIMBA, bajadaDePlantilla, jugadoresDePlantilla,
  nombreEnBanner,
} from './catalogo'
import { PUNTITOS_DEL_CATALOGO } from '@/golf/formats/personalizado'
import { BannerDeJuego } from '../juego/BannerDeJuego'

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
    <BannerDeJuego abierto={abierto} onCerrar={onCerrar} titulo={TITULO_TIMBA} subtitulo={SUBTITULO_TIMBA} proximamente={proximamente}>
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
    </BannerDeJuego>
  )
}
