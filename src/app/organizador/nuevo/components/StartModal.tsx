'use client'

// src/app/organizador/nuevo/components/StartModal.tsx
//
// Pantalla de arranque del wizard: "¿Por dónde empezamos?"
// - Empezar desde cero
// - Empezar con plantilla
// - Continuar un borrador reciente
// - Duplicar desde un torneo previo

import { useEffect, useState } from 'react'
import { FORMATS } from '@/golf/formats'
import { pageStyle } from '../styles'
import type { DraftSummary, TournamentSummary } from '../types'
import { TOURNAMENT_TEMPLATES, type TournamentTemplate } from '../tournament-templates'

export interface StartModalProps {
  recentTournaments: TournamentSummary[]
  existingDrafts: DraftSummary[]
  onStartFromScratch: () => void
  onStartFromTemplate: (template: TournamentTemplate) => void
  onDuplicateFromTournament: (id: string) => void
  onResumeDraft: (id: string) => void
  creating: boolean
  errorMsg: string | null
}

export function StartModal({
  recentTournaments,
  existingDrafts,
  onStartFromScratch,
  onStartFromTemplate,
  onDuplicateFromTournament,
  onResumeDraft,
  creating,
  errorMsg,
}: StartModalProps) {
  // `mounted` evita hydration mismatch en `formatRelativeDate` que usa Date.now().
  // Durante SSR renderea formato absoluto (determinístico); tras hydrate cambia a relativo.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>Nuevo torneo</h1>
        <p style={subtitleStyle}>¿Por dónde empezamos?</p>

        {errorMsg && (
          <div style={errorStyle} role="alert">
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          style={primaryButtonStyle(creating)}
          onClick={onStartFromScratch}
          disabled={creating}
        >
          {creating ? 'Creando...' : '+ Empezar desde cero'}
        </button>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Empezar con plantilla</h2>
          {/* focus-visible ring para navegación por teclado */}
          <style>{`.tmpl-card:focus-visible{outline:2px solid #c4992a;outline-offset:2px}`}</style>
          <div style={templateGridStyle}>
            {TOURNAMENT_TEMPLATES.map((t) => (
              <button
                type="button"
                key={t.format + t.holes}
                className="tmpl-card"
                style={templateCardStyle}
                onClick={() => onStartFromTemplate(t)}
                disabled={creating}
              >
                <span style={templateNameStyle}>{t.name}</span>
                <span style={templateDescStyle}>{t.description}</span>
              </button>
            ))}
          </div>
        </section>

        {existingDrafts.length > 0 && (
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Continuar un borrador</h2>
            <ul style={listStyle}>
              {existingDrafts.map((d) => (
                <li key={d.id} style={listItemStyle}>
                  <button
                    type="button"
                    style={listButtonStyle}
                    onClick={() => onResumeDraft(d.id)}
                    disabled={creating}
                  >
                    <span style={{ fontWeight: 600 }}>{d.name?.trim() || 'Sin nombre'}</span>
                    <span style={listMetaStyle} suppressHydrationWarning>
                      {mounted ? formatRelativeDate(d.updated_at) : formatDate(d.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recentTournaments.length > 0 && (
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Duplicar desde un torneo previo</h2>
            <ul style={listStyle}>
              {recentTournaments.slice(0, 5).map((t) => (
                <li key={t.id} style={listItemStyle}>
                  <button
                    type="button"
                    style={listButtonStyle}
                    onClick={() => onDuplicateFromTournament(t.id)}
                    disabled={creating}
                  >
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    <span style={listMetaStyle}>
                      {FORMATS[t.format]?.name ?? t.format} · {formatDate(t.date_start)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * Deterministic ES-cl date formatter — produces idéntico HTML en server y
 * client. NO usar `toLocaleDateString` acá: aunque Node tenga full-icu,
 * `'es-CL'` puede producir variantes sutiles entre runtimes y dispara
 * React error #425 (hydration mismatch) durante SSR.
 *
 * Usa `getUTC*` porque `date_start` y `updated_at` son ISO timestamps;
 * `getDate()` (local TZ) generaría días distintos entre server UTC y
 * cliente GMT-X. (Por eso no se usa `@/lib/format` acá, que trabaja en TZ local.)
 */
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function formatDate(iso?: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * Relative date ("hace 5 min"). Usa `Date.now()` que difiere entre server
 * y client → hydration mismatch. **Solo llamar tras mount** (ver flag
 * `mounted` arriba). Durante SSR usar `formatDate` como fallback.
 */
export function formatRelativeDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const delta = now - d.getTime()
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} d`
  return formatDate(iso)
}

// ── Styles ────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: '60px auto',
  padding: 24,
  borderRadius: 16,
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: 'var(--text-secondary)',
}

const errorStyle: React.CSSProperties = {
  background: 'rgba(239, 68, 68, 0.1)',
  color: 'var(--double)',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  border: '1px solid rgba(239, 68, 68, 0.25)',
}

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  appearance: 'none',
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 15,
  padding: '14px 20px',
  borderRadius: 12,
  border: 'none',
  background: 'var(--brand-gold)',
  color: 'var(--text)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
})

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingTop: 16,
  borderTop: '1px solid var(--border)',
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontFamily: '"DM Mono", monospace',
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const listItemStyle: React.CSSProperties = {
  margin: 0,
}

const listButtonStyle: React.CSSProperties = {
  appearance: 'none',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  textAlign: 'left',
  gap: 12,
}

const listMetaStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
}

const templateGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 8,
}

const templateCardStyle: React.CSSProperties = {
  appearance: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
}

const templateNameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
}

const templateDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  lineHeight: 1.3,
}
