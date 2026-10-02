'use client'

import { Button } from '@/components/ui/Button'

/**
 * CTA de la ronda terminada para el jugador con cuenta cuya tarjeta no quedó en
 * su historial (la cerró otro). Ver `useGuardarEnMiHistorial`.
 */
export function GuardarEnMiHistorial({ estado, onGuardar }: {
  estado: 'oculto' | 'disponible' | 'guardando' | 'guardado'
  onGuardar: () => void
}) {
  if (estado === 'oculto' || estado === 'guardado') return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)', textAlign: 'center' }}>
        Tu tarjeta de esta ronda todavía no está en tu historial.
      </p>
      <Button variant="nav" fullWidth loading={estado === 'guardando'} onClick={onGuardar} style={{ maxWidth: '360px' }}>
        Guardar en mi historial
      </Button>
    </div>
  )
}
