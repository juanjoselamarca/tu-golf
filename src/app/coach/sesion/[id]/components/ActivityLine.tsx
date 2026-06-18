'use client'

/**
 * Línea de actividad mientras el coach piensa/llama tools (idéntico al original
 * page.tsx:559-582). El caller decide cuándo mostrarla.
 */
export function ActivityLine({ activity }: { activity: string | null }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      margin: '8px 0 8px 40px',
      maxWidth: 'fit-content',
      background: 'rgba(196,153,42,0.08)',
      border: '1px solid rgba(196,153,42,0.20)',
      borderRadius: 20,
      fontSize: 13,
      color: '#8A6A16',
      fontWeight: 500,
    }}>
      <span className="taiger-spinner" style={{
        width: 12, height: 12, borderRadius: 6,
        background: '#c4992a',
        animation: 'taigerPulse 1.2s ease-in-out infinite',
        flexShrink: 0,
      }} />
      <span>{activity ?? 'tAIger+ está analizando…'}</span>
    </div>
  )
}
