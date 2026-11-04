'use client'

import { FONT_SIZE } from '@/lib/font-size'

interface EmptyStateProps {
  icon:          string
  title:         string
  description:   string
  actionLabel?:  string
  onAction?:     () => void
  actionHref?:   string
}

export function EmptyState({ icon, title, description, actionLabel, onAction, actionHref }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{icon}</div>
      <h3 style={{ fontFamily: '"Playfair Display", serif', color: 'var(--text)', marginBottom: '8px', fontSize: FONT_SIZE.lead }}>
        {title}
      </h3>
      <p style={{ color: 'var(--text-2)', marginBottom: '20px', fontSize: FONT_SIZE.small }}>{description}</p>
      {actionLabel && (onAction || actionHref) && (
        actionHref ? (
          <a
            href={actionHref}
            style={{ display: 'inline-block', background: 'var(--brand)', color: 'var(--brand-dark)', border: 'none', padding: '12px 28px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: FONT_SIZE.small, textDecoration: 'none' }}
          >
            {actionLabel}
          </a>
        ) : (
          <button
            onClick={onAction}
            style={{ background: 'var(--brand)', color: 'var(--brand-dark)', border: 'none', padding: '12px 28px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: FONT_SIZE.small }}
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}
