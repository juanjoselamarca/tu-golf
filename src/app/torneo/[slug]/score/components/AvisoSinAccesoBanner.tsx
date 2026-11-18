'use client'

import Link from 'next/link'
import { CTA_RELLENO } from '@/components/torneo/cta-aviso'
import { useAnunciarAvisoDeSesion } from '@/lib/auth/aviso-sesion-en-pantalla'
import type { AvisoSinAcceso } from '../hooks/acceso-guardado'

/**
 * El torneo no acepta lo que anota este teléfono (sesión cerrada, acceso de invitado roto, retirado): aviso con
 * salida. Mientras está a la vista, el banner global no dice "Sincronizando…" (ninguno de estos casos se sube solo).
 */
export function AvisoSinAccesoBanner({ aviso }: { aviso: AvisoSinAcceso | null }) {
  useAnunciarAvisoDeSesion(!!aviso)
  if (!aviso) return null
  return (
    <div role="alert" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
      <strong>{aviso.titulo}.</strong> {aviso.detalle}
      <div style={{ marginTop: '10px' }}>
        <Link href={aviso.href} style={CTA_RELLENO}>{aviso.cta}</Link>
      </div>
    </div>
  )
}
