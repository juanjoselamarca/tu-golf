'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { addToast } from '@/hooks/useToast'

export function DeleteAccountModal() {
  const [deleteStep, setDeleteStep] = useState(0) // 0=idle, 1=first confirm, 2=deleting

  return (
    <>
      {/* Eliminar cuenta — link discreto al final + modal de confirmación.
          Premium: la zona peligro NO es protagonista visual. */}
      <div style={{ marginTop: '32px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => setDeleteStep(1)}
          style={{
            background: 'transparent', border: 'none', padding: '8px 12px',
            fontSize: '12px', color: 'var(--text-3)', cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: '3px',
            fontFamily: '"DM Sans", system-ui, sans-serif',
          }}
        >
          Eliminar mi cuenta
        </button>
      </div>

      {/* Modal de confirmación — solo render cuando deleteStep > 0 */}
      {deleteStep > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => deleteStep === 1 && setDeleteStep(0)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(7,13,24,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            animation: 'modalOverlayIn 200ms ease-out both',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)', borderRadius: '16px',
              padding: '28px', maxWidth: '420px', width: '100%',
              border: '1px solid rgba(220,38,38,0.18)',
              boxShadow: '0 24px 48px rgba(7,13,24,0.18)',
              animation: 'modalCardIn 320ms ease-out both',
            }}
          >
            <h3
              id="delete-account-title"
              style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: '20px', fontWeight: 600,
                color: 'var(--text)', margin: '0 0 8px',
                letterSpacing: '-0.01em',
              }}
            >
              ¿Eliminar tu cuenta?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '0 0 20px', lineHeight: 1.55 }}>
              Se borrarán todos tus datos: perfil, rondas, historial, estadísticas y sesiones de coaching.
              <br />
              <strong style={{ color: '#991b1b' }}>Esta acción no se puede deshacer.</strong>
            </p>
            {deleteStep === 1 && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button variant="ghost" size="sm" onClick={() => setDeleteStep(0)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    setDeleteStep(2)
                    try {
                      const res = await fetch('/api/profile/delete-account', { method: 'DELETE' })
                      if (res.ok) {
                        addToast({ title: 'Cuenta eliminada', message: 'Tu cuenta y todos tus datos fueron eliminados.', type: 'success' })
                        setTimeout(() => { window.location.href = '/' }, 1500)
                      } else {
                        const data = await res.json().catch(() => ({}))
                        addToast({ title: 'No se pudo eliminar', message: data.error || 'Ocurrió un error. Intenta de nuevo o contacta soporte.', type: 'error' })
                        setDeleteStep(0)
                      }
                    } catch {
                      addToast({ title: 'Sin conexión', message: 'No pudimos conectar con el servidor. Verifica tu internet e intenta de nuevo.', type: 'error' })
                      setDeleteStep(0)
                    }
                  }}
                >
                  Sí, eliminar todo
                </Button>
              </div>
            )}
            {deleteStep === 2 && (
              <p style={{ fontSize: '14px', color: '#991b1b', fontWeight: 500, margin: 0 }}>
                Eliminando tu cuenta...
              </p>
            )}
          </div>
          <style>{`
            @keyframes modalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes modalCardIn {
              from { opacity: 0; transform: translateY(8px) scale(0.97); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
    </>
  )
}
