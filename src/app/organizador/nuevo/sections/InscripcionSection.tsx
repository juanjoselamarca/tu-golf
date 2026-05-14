'use client'

// src/app/organizador/nuevo/sections/InscripcionSection.tsx
//
// Sección "Inscripción": edita config.registration.

import { useState } from 'react'
import type { TournamentConfig, RegistrationConfig } from '@/lib/draft/types'

export interface InscripcionSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const DEFAULT_REG: RegistrationConfig = {
  mode: 'open_with_code',
}

export function InscripcionSection({ config, applyChange }: InscripcionSectionProps) {
  const reg: RegistrationConfig = config.registration ?? DEFAULT_REG
  const [copied, setCopied] = useState(false)

  const update = (patch: Partial<RegistrationConfig>) => {
    applyChange({ registration: { ...reg, ...patch } })
  }

  const onCopy = async () => {
    if (!reg.code) return
    try {
      await navigator.clipboard.writeText(reg.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // sin permisos de clipboard — fallback silencioso
    }
  }

  // El input datetime-local pide formato YYYY-MM-DDTHH:mm.
  // El config guarda ISO o un string libre — pasamos como está, truncando.
  const deadlineValue = reg.deadline ? reg.deadline.slice(0, 16) : ''

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>Inscripción</h2>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="reg-mode">Modo</label>
        <select
          id="reg-mode"
          style={inputStyle}
          value={reg.mode}
          onChange={(e) =>
            update({ mode: e.target.value as RegistrationConfig['mode'] })
          }
        >
          <option value="open_with_code">Abierta con código</option>
          <option value="invite_only">Solo por invitación</option>
          <option value="club_members_only">Solo socios del club</option>
        </select>
      </div>

      {reg.mode === 'open_with_code' && (
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="reg-code">Código</label>
          <div style={codeRowStyle}>
            <input
              id="reg-code"
              type="text"
              readOnly
              value={reg.code ?? '(se generará al crear el torneo)'}
              style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
            />
            <button
              type="button"
              style={copyBtnStyle}
              onClick={onCopy}
              disabled={!reg.code}
              aria-label="Copiar código"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="reg-deadline">Deadline</label>
        <input
          id="reg-deadline"
          type="datetime-local"
          style={inputStyle}
          value={deadlineValue}
          onChange={(e) =>
            update({ deadline: e.target.value || undefined })
          }
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="reg-max">Cupo máximo</label>
        <input
          id="reg-max"
          type="number"
          min={1}
          step={1}
          placeholder="Sin límite"
          style={inputStyle}
          value={reg.max_players ?? ''}
          onChange={(e) =>
            update({
              max_players: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value) || 1),
            })
          }
        />
      </div>
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  padding: 20,
  fontFamily: '"DM Sans", sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary, #4b5563)',
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 14,
  outline: 'none',
}

const codeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
}

const copyBtnStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--brand-gold, #c4992a)',
  background: 'transparent',
  color: 'var(--brand-gold, #c4992a)',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
