'use client'

import { Button } from '@/components/ui/Button'

/**
 * CTA de la ronda terminada para el jugador con cuenta cuya tarjeta no quedó en
 * su historial (la cerró otro). Ver `useGuardarEnMiHistorial`. Va pegado al
 * resumen de "tu ronda", con superficie propia: es una acción sobre tus datos.
 */
export function GuardarEnMiHistorial({ estado, onGuardar, children }: {
  estado: 'oculto' | 'disponible' | 'guardando' | 'guardado'
  onGuardar: () => void
  /** Lo que se revisa antes de guardar (hoyos estimados): misma superficie que la CTA. */
  children?: React.ReactNode
}) {
  if (estado === 'oculto' || estado === 'guardado') return null
  return (
    <section
      aria-label="Guardar en mi historial"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px',
        padding: '16px', marginBottom: '12px',
      }}
    >
      {children}
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-2)', textAlign: 'center' }}>
        Esta ronda aún no está en tu historial. Guárdala para sumarla a tus estadísticas.
      </p>
      <Button variant="commit" fullWidth loading={estado === 'guardando'} onClick={onGuardar}>
        Guardar en mi historial
      </Button>
    </section>
  )
}
