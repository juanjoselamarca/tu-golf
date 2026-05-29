/**
 * Header de la página /perfil/historial:
 *   ← Mi Perfil
 *   Mi Historial
 *   [Rondas N] [Prom +/-] [Birdies N] [Eagles N]
 *   🐯 tAIger+ ... [N]
 *   [progress bar]
 */
'use client'

import Link from 'next/link'
import { taigerMessage } from '../lib/helpers'

interface Pill {
  label: string
  value: string
}

interface Props {
  pills:        Pill[]
  totalRounds:  number
  /** Progreso 0..1 para la barra de tAIger+. */
  progress:     number
}

export function HistorialHeader({ pills, totalRounds, progress }: Props) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '20px 16px 16px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <Link
          href="/perfil"
          style={{
            color: 'var(--text-3)', fontSize: '13px', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            marginBottom: '6px', minHeight: '44px',
          }}
        >
          &#8592; Mi Perfil
        </Link>
        <h1 style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '26px',
          color: 'var(--text)',
          margin: '0 0 16px 0',
          fontWeight: 700,
        }}>
          Mi Historial
        </h1>

        {/* Stat pills — horizontal scroll on mobile */}
        <div style={{
          display: 'flex', gap: '8px',
          overflowX: 'auto', paddingBottom: '4px',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          {pills.map(pill => (
            <div key={pill.label} style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              padding: '6px 16px',
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: '11px',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 500,
              }}>
                {pill.label}
              </span>
              <span style={{
                fontSize: '15px',
                color: 'var(--text)',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {pill.value}
              </span>
            </div>
          ))}
        </div>

        {/* tAIger progress bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            {/* TODO(foundation): reemplazar emoji por <TaigerIcon /> cuando el icon system migre emojis — P7 */}
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
              &#128047; {taigerMessage(totalRounds)}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{totalRounds}</span>
          </div>
          <div style={{
            height: '4px',
            background: 'rgba(196,153,42,0.15)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              borderRadius: '2px',
              width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
              background: 'linear-gradient(90deg, #c4992a, #e8c06a)',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      </div>
    </div>
  )
}
