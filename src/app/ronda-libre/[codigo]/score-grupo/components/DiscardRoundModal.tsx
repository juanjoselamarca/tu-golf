'use client'

interface DiscardRoundModalProps {
  showConfirm: boolean
  setShowConfirm: (v: boolean) => void
  discarding: boolean
  onDiscard: () => void
}

/** Botón "Descartar ronda" + modal de confirmación (scorer de grupo). */
export function DiscardRoundModal({ showConfirm, setShowConfirm, discarding, onDiscard }: DiscardRoundModalProps) {
  return (
    <>
      {/* Descartar ronda */}
      <div style={{ padding: '0 16px 12px', textAlign: 'center' }}>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={discarding}
          aria-label="Descartar ronda"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            color: 'rgba(156,163,175,0.7)',
            fontSize: '14px', fontWeight: 400,
            padding: '8px 14px', borderRadius: '8px',
            cursor: discarding ? 'not-allowed' : 'pointer',
            opacity: discarding ? 0.5 : 1,
            letterSpacing: '0.02em',
            WebkitTapHighlightColor: 'transparent',
          }}
        >{discarding ? 'Descartando…' : 'Descartar ronda'}</button>
      </div>

      {/* Modal de confirmación de descarte */}
      {showConfirm && (
        <div
          onClick={() => setShowConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)', borderRadius: '16px',
              border: `1px solid var(--border)`,
              padding: '24px', maxWidth: '340px', width: '100%',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
              {'¿'}Descartar esta ronda?
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '20px', lineHeight: 1.5 }}>
              Se borrar{'á'}n todos los scores. Esta acci{'ó'}n no se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px',
                  background: 'transparent', border: `1px solid var(--border)`,
                  color: 'var(--text-2)', fontSize: '14px', fontWeight: 500,
                  cursor: 'pointer', minHeight: '44px',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={onDiscard}
                disabled={discarding}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px',
                  background: '#dc2626', border: 'none',
                  color: '#ffffff', fontSize: '14px', fontWeight: 600,
                  cursor: discarding ? 'not-allowed' : 'pointer', minHeight: '44px',
                  opacity: discarding ? 0.7 : 1,
                }}
              >
                {discarding ? 'Descartando…' : 'Sí, descartar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
