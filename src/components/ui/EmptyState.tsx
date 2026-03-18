'use client'

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
      <h3 style={{ fontFamily: '"Playfair Display", serif', color: '#edeae4', marginBottom: '8px', fontSize: '18px' }}>
        {title}
      </h3>
      <p style={{ color: '#94a8c0', marginBottom: '20px', fontSize: '14px' }}>{description}</p>
      {actionLabel && (onAction || actionHref) && (
        actionHref ? (
          <a
            href={actionHref}
            style={{ display: 'inline-block', background: '#c4992a', color: '#070d18', border: 'none', padding: '12px 28px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}
          >
            {actionLabel}
          </a>
        ) : (
          <button
            onClick={onAction}
            style={{ background: '#c4992a', color: '#070d18', border: 'none', padding: '12px 28px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}
