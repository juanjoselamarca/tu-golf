'use client'

import Link from 'next/link'
import { CTA_RELLENO, CTA_SECUNDARIO } from '@/components/torneo/cta-aviso'
import { useAnunciarAvisoDeSesion } from '@/lib/auth/aviso-sesion-en-pantalla'
import type { AvisoSinAcceso } from '../hooks/acceso-guardado'
import type { EstadoRecuperacion } from '../hooks/useRecuperarAccesoInvitado'

export interface RecuperacionDeAcceso {
  estado: EstadoRecuperacion
  mensaje: string | null
  recuperar: () => void
}

/**
 * El torneo no acepta lo que anota este teléfono (sesión cerrada, acceso de invitado roto, retirado): aviso con
 * salida. Mientras está a la vista, el banner global no dice "Sincronizando…" (ninguno de estos casos se sube solo).
 *
 * Con `aviso.accion === 'recuperar_invitado'` el CTA recupera el acceso en el lugar (`recuperacion`); si falla,
 * dice por qué y deja la salida al torneo (`aviso.href`).
 */
export function AvisoSinAccesoBanner({ aviso, recuperacion }: { aviso: AvisoSinAcceso | null; recuperacion?: RecuperacionDeAcceso }) {
  useAnunciarAvisoDeSesion(!!aviso)
  if (!aviso) return null
  const recupera = aviso.accion === 'recuperar_invitado' && recuperacion
  const recuperando = recupera && recuperacion.estado === 'recuperando'
  return (
    <div role="alert" style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
      <strong>{aviso.titulo}.</strong> {aviso.detalle}
      {recupera ? (
        <>
          <div style={{ marginTop: '10px' }}>
            <button type="button" onClick={recuperacion.recuperar} disabled={!!recuperando} aria-busy={!!recuperando}
              data-testid="recuperar-acceso-invitado"
              style={{ ...CTA_RELLENO, cursor: recuperando ? 'default' : 'pointer', opacity: recuperando ? 0.7 : 1, fontFamily: 'inherit' }}>
              {recuperando ? 'Recuperando…' : aviso.cta}
            </button>
          </div>
          {recuperacion.estado === 'error' && recuperacion.mensaje && (
            <div role="status" style={{ marginTop: '8px' }}>
              {recuperacion.mensaje}{' '}
              <Link href={aviso.href} style={CTA_SECUNDARIO}>Ver el torneo</Link>
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: '10px' }}>
          <Link href={aviso.href} style={CTA_RELLENO}>{aviso.cta}</Link>
        </div>
      )}
    </div>
  )
}
