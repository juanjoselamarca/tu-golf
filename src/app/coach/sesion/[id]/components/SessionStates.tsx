'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

/** Estado de carga de la sesión (idéntico al original page.tsx:360-372). */
export function LoadingState() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)',
    }}>
      Cargando sesión...
    </div>
  )
}

/** Estado sesión no encontrada (idéntico al original page.tsx:374-402). */
export function NotFoundState() {
  const router = useRouter()
  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 20,
    }}>
      <p style={{ color: 'var(--text)', fontSize: 16 }}>Sesión no encontrada</p>
      {/* ui/Button nav (§5, acción reversible): 48px de alto y texto --brand-on-bg
          sobre el fondo. El botón propio medía 36px y daba 4.26:1 sobre el tinte dorado. */}
      <Button type="button" variant="nav" onClick={() => router.push('/coach')}>
        Volver al coach
      </Button>
    </div>
  )
}
