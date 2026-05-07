'use client'

/**
 * PlanAssignedCard — render visual de un plan formal recién asignado por
 * tAIger+ (tool save_plan). Reemplaza prosa lavada con una card formal
 * clickeable. CTA "Cambiar de foco" llena el input del chat con un mensaje
 * que pide otro plan al coach.
 *
 * Spec: solicitud Juanjo 2026-05-06 — "card de plan asignado".
 */

import { useState } from 'react'

export interface AssignedPlan {
  plan_id: string
  pattern_id: string
  pattern_name: string
  hypothesis: string
  rule: string
  metric: string
  metric_name: string
  target_value: number
  target_op: 'lte' | 'gte' | 'eq'
  duration_days: number
  baseline_value: number | null
}

interface Props {
  plan: AssignedPlan
  onChangeFocus?: () => void
}

const OP_LABEL: Record<string, string> = { lte: '≤', gte: '≥', eq: '=' }

export function PlanAssignedCard({ plan, onChangeFocus }: Props) {
  const [accepted, setAccepted] = useState(false)

  const targetText = `${plan.metric_name} ${OP_LABEL[plan.target_op] ?? plan.target_op} ${formatNum(plan.target_value)}`
  const baselineText = plan.baseline_value != null
    ? `Hoy estás en ${formatNum(plan.baseline_value)}.`
    : null

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(196,153,42,0.10), rgba(196,153,42,0.04))',
      border: '1px solid rgba(196,153,42,0.35)',
      borderRadius: 16,
      padding: '20px 22px',
      margin: '16px 0',
      maxWidth: '85%',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(196,153,42,0.30)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#8A6A16',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 14 }}>🎯</span>
        Plan asignado
      </div>

      <h3 style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: 18,
        color: 'var(--text)',
        margin: '0 0 6px',
        fontWeight: 600,
        letterSpacing: '-0.005em',
      }}>
        {capitalize(plan.pattern_name)}
      </h3>

      {plan.hypothesis && (
        <p style={{
          fontSize: 13,
          color: 'var(--text-2)',
          fontStyle: 'italic',
          margin: '0 0 14px',
          lineHeight: 1.5,
        }}>
          “{plan.hypothesis}”
        </p>
      )}

      <Field label="Qué hacer" value={plan.rule} />
      <Field
        label="Cómo se mide"
        value={`${targetText}${baselineText ? ` · ${baselineText}` : ''}`}
      />
      <Field label="Por cuánto tiempo" value={`${plan.duration_days} días`} />

      <div style={{
        display: 'flex',
        gap: 10,
        marginTop: 14,
        paddingTop: 14,
        borderTop: '1px solid rgba(196,153,42,0.18)',
      }}>
        {accepted ? (
          <div style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: '#15803d',
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.30)',
            borderRadius: 10,
            textAlign: 'center',
          }}>
            ✓ Plan aceptado · empezamos
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAccepted(true)}
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--brand-dark)',
                background: '#c4992a',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'filter 200ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              Aceptar plan
            </button>
            <button
              type="button"
              onClick={onChangeFocus}
              style={{
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#8A6A16',
                background: 'transparent',
                border: '1px solid rgba(196,153,42,0.35)',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              Cambiar de foco
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-2)',
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14,
        color: 'var(--text)',
        lineHeight: 1.5,
      }}>
        {value}
      </div>
    </div>
  )
}

function formatNum(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  if (Math.abs(v) < 1) return v.toFixed(2)
  if (Math.abs(v) < 10) return v.toFixed(1)
  return Math.round(v).toString()
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
