'use client'

// src/app/organizador/nuevo/sections/InscripcionSection.tsx
//
// Sección "Inscripción": edita config.registration.

import { useState } from 'react'
import { copyToClipboard } from '@/lib/clipboard'
import type { TournamentConfig, RegistrationConfig } from '@/lib/draft/types'
import { cardStyle, titleStyle, fieldStyle, labelStyle, inputStyle } from '../styles'
import { InlineFieldError, useFieldErrors } from '../components/InlineFieldError'

export interface InscripcionSectionProps {
  config: TournamentConfig
  applyChange: (partial: Partial<TournamentConfig>) => void
}

const DEFAULT_REG: RegistrationConfig = {
  mode: 'open_with_code',
}

export function InscripcionSection({ config, applyChange }: InscripcionSectionProps) {
  const fieldError = useFieldErrors()
  const deadlineError = fieldError('registration.deadline')
  const maxError = fieldError('registration.max_players')
  const reg: RegistrationConfig = config.registration ?? DEFAULT_REG
  const [copied, setCopied] = useState(false)

  const update = (patch: Partial<RegistrationConfig>) => {
    applyChange({ registration: { ...reg, ...patch } })
  }

  const onCopy = async () => {
    if (!reg.code) return
    try {
      await copyToClipboard(reg.code)
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
        <label style={labelStyle} htmlFor="reg-deadline">Fecha límite de inscripción</label>
        <input
          id="reg-deadline"
          type="datetime-local"
          style={{ ...inputStyle, ...deadlineError.borderStyle }}
          {...deadlineError.inputProps}
          value={deadlineValue}
          onChange={(e) =>
            // null = "sin valor": viaja en el PATCH. Con undefined el server
            // conservaba el deadline viejo y el autosave lo hacía reaparecer.
            update({ deadline: e.target.value || null })
          }
        />
        <InlineFieldError state={deadlineError} />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="reg-max">Cupo máximo</label>
        <input
          id="reg-max"
          type="number"
          min={1}
          step={1}
          placeholder="Sin límite"
          style={{ ...inputStyle, ...maxError.borderStyle }}
          {...maxError.inputProps}
          value={reg.max_players ?? ''}
          onChange={(e) =>
            update({
              // Entero ≥ 1, como pide el schema.
              max_players: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value) || 1)),
            })
          }
        />
        <InlineFieldError state={maxError} />
      </div>
    </section>
  )
}

const codeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
}

const copyBtnStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--brand-gold)',
  background: 'transparent',
  color: 'var(--brand-gold)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
