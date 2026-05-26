'use client'

// src/app/organizador/nuevo/DraftFooter.tsx
//
// Footer del editor del torneo. Sticky en desktop, inline en mobile.
// Botón izquierda "Vista previa" (siempre habilitado).
// Botón derecha "Crear torneo →" deshabilitado hasta isReadyToCreate.

import { useMemo, useState } from 'react'
import type { TournamentConfig } from '@/lib/draft/types'
import { validateGolfRules, type ValidationError } from '@/golf/tournament-config-validator'

export interface DraftFooterProps {
  draftId: string
  config: TournamentConfig
  onPreview: () => void
  onCreate: () => Promise<void>
}

export function DraftFooter({ config, onPreview, onCreate }: DraftFooterProps) {
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const validation = useMemo(() => validateGolfRules(config), [config])
  const ready = validation.isReadyToCreate && validation.errors.length === 0

  // Lista de motivos por los cuales el botón está bloqueado.
  const blockers = useMemo<ValidationError[]>(() => {
    const out: ValidationError[] = [...validation.errors]
    if (!config.name?.trim()) {
      out.push({
        code: 'name_required',
        field: 'name',
        message: 'Falta el nombre del torneo',
      })
    }
    if (!config.date_start) {
      out.push({
        code: 'date_required',
        field: 'date_start',
        message: 'Falta la fecha de inicio',
      })
    }
    config.rounds.forEach((r, idx) => {
      if (!r.date) {
        out.push({
          code: 'round_date_required',
          field: `rounds[${idx}].date`,
          message: `Falta fecha en la ronda ${r.round_number}`,
        })
      }
      if (!r.course_id) {
        out.push({
          code: 'round_course_required',
          field: `rounds[${idx}].course_id`,
          message: `Falta cancha en la ronda ${r.round_number}`,
        })
      }
    })
    return out
  }, [config, validation.errors])

  const handleCreate = async () => {
    if (!ready || submitting) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      await onCreate()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error creando el torneo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={containerStyle}>
      {errorMsg && (
        <div style={errorStyle} role="alert">
          {errorMsg}
        </div>
      )}

      {!ready && blockers.length > 0 && (
        <div style={blockersPanelStyle} role="status" aria-live="polite">
          <div style={blockersTitleStyle}>Falta para poder crear el torneo:</div>
          <ul style={blockersListStyle}>
            {blockers.slice(0, 6).map((b, i) => (
              <li key={`${b.code}-${i}`} style={blockersItemStyle}>
                {b.message}
              </li>
            ))}
            {blockers.length > 6 && (
              <li style={blockersItemStyle}>...y {blockers.length - 6} más</li>
            )}
          </ul>
        </div>
      )}

      <div style={rowStyle}>
        <button type="button" style={previewButtonStyle} onClick={onPreview}>
          Vista previa
        </button>

        <button
          type="button"
          style={createButtonStyle(ready, submitting)}
          disabled={!ready || submitting}
          onClick={handleCreate}
        >
          {submitting ? 'Creando...' : 'Crear torneo →'}
        </button>
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  padding: '12px 20px',
  borderTop: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  fontFamily: '"DM Sans", sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
}

const previewButtonStyle: React.CSSProperties = {
  appearance: 'none',
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: 14,
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: '#ffffff',
  color: 'var(--text-primary, #111827)',
  cursor: 'pointer',
}

const createButtonStyle = (ready: boolean, submitting: boolean): React.CSSProperties => ({
  appearance: 'none',
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 14,
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  background: ready ? 'var(--brand-gold, #c4992a)' : '#e5e7eb',
  color: ready ? '#0a1419' : '#9ca3af',
  cursor: ready && !submitting ? 'pointer' : 'not-allowed',
  boxShadow: ready ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
  transition: 'background-color 0.15s ease',
  opacity: submitting ? 0.7 : 1,
})

// Panel persistente que lista los blockers de validación. Aparece DENTRO
// del footer sticky, arriba del row de botones, para que el organizador
// vea SIEMPRE qué falta sin tener que hacer hover (que no funciona en
// mobile) o buscar tooltip flotante en otra parte de la pantalla.
const blockersPanelStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(196, 153, 42, 0.10)',
  border: '1px solid rgba(196, 153, 42, 0.35)',
  color: 'var(--text-primary, #111827)',
  fontSize: 12,
  lineHeight: 1.35,
}

const blockersTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 6,
  color: 'var(--brand-on-bg, #8A6A16)',
}

const blockersListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const blockersItemStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
}

const errorStyle: React.CSSProperties = {
  background: 'rgba(239, 68, 68, 0.1)',
  color: '#b91c1c',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  border: '1px solid rgba(239, 68, 68, 0.25)',
}
