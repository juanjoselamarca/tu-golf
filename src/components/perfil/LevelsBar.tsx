'use client'

import { NIVELES_ORDEN } from '@/lib/mi-golf/niveles'
import type { Nivel } from '@/lib/mi-golf/types'

/**
 * LevelsBar — Carta de membresía Golfers+
 *
 * Línea continua con 5 markers (Novato → Scratch). El marker actual
 * tiene halo radial sutil; futuros son open rings; pasados son filled.
 * Subtítulo editorial muestra los golpes hasta el siguiente nivel.
 *
 * Diseño premium 2026-04-27 — reemplaza el LevelsBar de IdentidadTab
 * (que tenía glow neón + heights inconsistentes). Usar este en /perfil.
 */

const GOLD = '#c4992a'
const GOLD_HALO = 'rgba(196,153,42,0.18)'
const TEXT = '#1a1a2e'
const TEXT_2 = '#4a5568'
const TEXT_3 = '#94a3b8'
const TRACK = '#e2e8f0'
const RING = '#cbd5e1'

export function LevelsBar({ nivel }: { nivel: Nivel }) {
  const currentIdx = NIVELES_ORDEN.indexOf(nivel.nombre)
  const total = NIVELES_ORDEN.length

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid rgba(196,153,42,0.18)',
        borderRadius: '16px',
        padding: '20px 20px 24px',
        marginBottom: '18px',
        animation: 'lvlbarIn 480ms ease-out both',
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontSize: '10px',
          fontFamily: '"DM Mono", monospace',
          fontWeight: 700,
          color: TEXT_3,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}
      >
        Tu categoría · Golfers+
      </div>

      {/* Hero del nivel */}
      <div
        style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '28px',
          fontWeight: 600,
          color: TEXT,
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
          marginBottom: '4px',
        }}
      >
        {nivel.nombre}
      </div>

      {/* Subtítulo editorial */}
      {nivel.nombre_siguiente && nivel.golpes_hasta_siguiente != null ? (
        <div style={{ fontSize: '13px', color: TEXT_2, marginBottom: '28px', lineHeight: 1.5 }}>
          Faltan{' '}
          <span
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '18px',
              fontWeight: 700,
              color: GOLD,
              letterSpacing: '-0.01em',
            }}
          >
            {nivel.golpes_hasta_siguiente.toFixed(1)}
          </span>{' '}
          golpes para pasar a <strong style={{ color: TEXT }}>{nivel.nombre_siguiente}</strong>
        </div>
      ) : (
        <div style={{ fontSize: '13px', color: TEXT_2, marginBottom: '28px', lineHeight: 1.5 }}>
          Estás en el nivel más alto de Golfers+.
        </div>
      )}

      {/* Track + markers */}
      <div style={{ position: 'relative', height: '36px' }}>
        {/* Línea horizontal continua */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '6px',
            right: '6px',
            height: '2px',
            background: TRACK,
            borderRadius: '1px',
          }}
        />
        {/* Línea progreso (gold) hasta el current */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '6px',
            width: total > 1 ? `calc((100% - 12px) * ${currentIdx} / ${total - 1})` : '0',
            height: '2px',
            background: GOLD,
            borderRadius: '1px',
            transformOrigin: 'left center',
            animation: 'lvlbarFill 720ms ease-out both',
          }}
        />

        {/* 5 markers distribuidos uniformemente */}
        {NIVELES_ORDEN.map((n, i) => {
          const isPast = i < currentIdx
          const isCurrent = i === currentIdx
          const leftPct = total > 1 ? `calc(${(i / (total - 1)) * 100}% - 6px)` : '0'

          return (
            <div
              key={n}
              style={{
                position: 'absolute',
                top: '0',
                left: leftPct,
                width: '12px',
                height: '12px',
                marginTop: '6px',
              }}
            >
              {/* Halo del current */}
              {isCurrent && (
                <div
                  style={{
                    position: 'absolute',
                    inset: '-7px',
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${GOLD_HALO} 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {/* Dot/ring */}
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: isPast || isCurrent ? GOLD : '#ffffff',
                  border: isPast || isCurrent ? 'none' : `1.5px solid ${RING}`,
                  boxShadow: isCurrent ? `0 1px 2px rgba(196,153,42,0.3)` : 'none',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
              {/* Tooltip "Estás aquí" sobre el current — solo desktop, evita clutter en mobile */}
              {isCurrent && (
                <div
                  className="lvlbar-tooltip"
                  style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: '"Playfair Display", serif',
                    fontStyle: 'italic',
                    fontSize: '11px',
                    color: TEXT_2,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    animation: 'lvlbarTooltip 600ms ease-out 480ms both',
                  }}
                >
                  Estás aquí
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Labels alineados con los markers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${total}, 1fr)`,
          gap: '4px',
          marginTop: '6px',
          fontSize: '9px',
          fontFamily: '"DM Mono", monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          textAlign: 'center',
        }}
      >
        {NIVELES_ORDEN.map((n, i) => {
          const isCurrent = i === currentIdx
          return (
            <span
              key={n}
              style={{
                color: isCurrent ? GOLD : TEXT_3,
                fontWeight: isCurrent ? 700 : 600,
              }}
            >
              {n}
            </span>
          )
        })}
      </div>

      <style>{`
        @keyframes lvlbarIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lvlbarFill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes lvlbarTooltip {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @media (max-width: 380px) {
          .lvlbar-tooltip { display: none; }
        }
      `}</style>
    </div>
  )
}
