'use client'

// src/app/organizador/nuevo/sections/ComoJueganSection.tsx
//
// Sección "Cómo juegan":
// - formato (chips)
// - modo gross/neto (chips). Todos los formatos se juegan gross o neto; el
//   neto de Match Play, Best Ball y Stableford es del plan Pro
//   (`modoPermitidoPorPlan`, misma regla que la ronda libre y el servidor).
//
// Hoyos por ronda: única fuente es RondasSection (cada ronda define sus hoyos).

import { useEffect } from 'react'
import type { TournamentConfig, TournamentFormat, ScoringMode } from '@/lib/draft/types'
import { useAccesoNeto } from '@/hooks/useAccesoNeto'
import { modoPermitidoPorPlan, netoBloqueadoPorPlan } from '@/golf/billing/modo-por-plan'
import type { NetoFeature } from '@/golf/billing/plans'
import { ProBadge } from '@/components/billing/ProBadge'
import { planesUrl } from '@/lib/planes-url'

export interface ComoJueganSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const FORMAT_OPTIONS: Array<{ value: TournamentFormat; label: string }> = [
  { value: 'stroke_play', label: 'Stroke Play' },
  { value: 'stableford', label: 'Stableford' },
  { value: 'best_ball', label: 'Best Ball' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'match_play', label: 'Match Play' },
  { value: 'foursome', label: 'Foursome' },
]

export function ComoJueganSection({ config, applyChange }: ComoJueganSectionProps) {
  const accesoNeto = useAccesoNeto()
  // Mientras el plan carga no se bloquea ni se corrige nada: el servidor
  // (`create-tournament`) es la autoridad y responde 403 si no corresponde.
  const planPermite = (feature: NetoFeature) => accesoNeto.loading || accesoNeto.puedeUsar(feature)
  const netoLocked = netoBloqueadoPorPlan(config.format, planPermite)
  const modoPermitido = modoPermitidoPorPlan(config.format, config.modo, planPermite)

  // El modo vive en el borrador (autosave), no se puede derivar: si el plan
  // resuelve bloqueado con un neto ya guardado (borrador duplicado, plan
  // vencido), se corrige a gross una vez. Gross nunca se bloquea, así que
  // esto no puede rebotar.
  useEffect(() => {
    if (modoPermitido !== config.modo) applyChange({ modo: modoPermitido })
  }, [modoPermitido, config.modo, applyChange])

  const setFormat = (format: TournamentFormat) => {
    const partial: Partial<TournamentConfig> = { format }
    // Cambiar de formato no puede dejar seleccionado un neto que el plan no
    // permite en el formato nuevo (Stroke Play Neto → Match Play sin Pro).
    const modo = modoPermitidoPorPlan(format, config.modo, planPermite)
    if (modo !== config.modo) partial.modo = modo
    // Match Play tiene modo exclusivo (gross XOR neto): los premios con
    // kind explícito ya no aplican. Limpiamos para no dejar state stale
    // en config.prizes (JSONB en tournament_drafts) que confunda al
    // mapPrizeForInsert o a futuros consumers del draft.
    if (format === 'match_play' && config.prizes?.some((p) => p.kind != null)) {
      // null, no undefined: undefined no viaja en el PATCH y el server
      // conservaba el kind viejo.
      partial.prizes = config.prizes.map((p) => ({ ...p, kind: null }))
    }
    applyChange(partial)
  }

  const setModo = (modo: ScoringMode) => {
    if (modo === 'neto' && netoLocked) {
      // Mismo comportamiento que la ronda libre: el neto bloqueado lleva a
      // los planes, y su "Volver" trae de vuelta a este borrador.
      window.location.href = planesUrl(window.location.pathname + window.location.search)
      return
    }
    applyChange({ modo })
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Cómo juegan</h2>

      <div style={groupStyle}>
        <span style={labelStyle}>Formato</span>
        <div style={chipRowStyle}>
          {FORMAT_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              aria-pressed={config.format === opt.value}
              style={chipStyle(config.format === opt.value, false)}
              onClick={() => setFormat(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={groupStyle}>
        <span style={labelStyle}>Modo</span>
        <div style={chipRowStyle}>
          <button
            type="button"
            aria-pressed={modoPermitido === 'gross'}
            style={chipStyle(modoPermitido === 'gross', false)}
            onClick={() => setModo('gross')}
          >
            Gross
          </button>
          <button
            type="button"
            aria-pressed={modoPermitido === 'neto'}
            aria-disabled={netoLocked || undefined}
            aria-label={netoLocked ? 'Neto, requiere plan Pro' : undefined}
            style={chipStyle(modoPermitido === 'neto', netoLocked)}
            onClick={() => setModo('neto')}
          >
            Neto
            {netoLocked && (
              <span style={{ marginLeft: 6 }}>
                <ProBadge tier="pro" variant="filled" size={10} />
              </span>
            )}
          </button>
        </div>
        {netoLocked && (
          <span style={hintStyle}>El modo Neto de este formato es del plan Pro.</span>
        )}
      </div>
    </section>
  )
}

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  padding: 20,
  fontFamily: '"DM Sans", sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary)',
}

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

function chipStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 999,
    border: active
      ? '1px solid var(--brand-gold)'
      : '1px solid var(--border)',
    background: active
      ? 'var(--brand-gold)'
      : 'var(--input-bg)',
    color: active ? '#fff' : 'var(--text-primary)',
    fontFamily: '"DM Sans", sans-serif',
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'background 120ms ease, border-color 120ms ease',
  }
}
