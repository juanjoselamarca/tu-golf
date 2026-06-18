// Botones Compartir + Copiar link. Verbatim del monolito.
export interface ShareButtonsProps {
  onShare: () => void
  onCopy: () => void
  copied: boolean
}

export function ShareButtons({ onShare, onCopy, copied }: ShareButtonsProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
      <button
        onClick={onShare}
        aria-label="Compartir ronda"
        style={{ flex: 1, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
      >
        Compartir
      </button>
      <button
        onClick={onCopy}
        aria-label="Copiar enlace de la ronda"
        style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid #e5e7eb', color: 'var(--text)', fontSize: '13px', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, minHeight: '44px' }}
      >
        {copied ? '✓ Copiado' : 'Copiar link'}
      </button>
    </div>
  )
}
