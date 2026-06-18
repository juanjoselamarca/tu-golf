'use client'

import { TaigerIcon } from '@/components/icons/TaigerIcon'

/**
 * Estado vacío: burbuja del opener proactivo del coach (idéntico al original
 * page.tsx:448-488). Se muestra cuando no hay mensajes y llegó el opener.
 */
export function EmptyState({ opener }: { opener: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        marginBottom: 16,
        gap: 8,
      }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'rgba(196,153,42,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        flexShrink: 0,
        marginTop: 2,
      }}>
        <TaigerIcon size={18} />
      </div>
      <div
        className="taiger-md"
        style={{
          maxWidth: '80%',
          padding: '12px 16px',
          borderRadius: '14px 14px 14px 4px',
          background: 'var(--bg-surface)',
          color: 'var(--text)',
          fontSize: 14,
          lineHeight: 1.6,
          wordBreak: 'break-word',
        }}
        data-testid="taiger-opener"
      >
        {opener}
      </div>
    </div>
  )
}
