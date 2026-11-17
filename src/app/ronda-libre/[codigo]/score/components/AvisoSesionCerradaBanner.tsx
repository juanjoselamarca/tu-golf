import Link from 'next/link'
import type { AvisoSesionCerrada } from '@/lib/auth/aviso-sesion-cerrada'

/**
 * La sesión se cerró en plena ronda: aviso fijo bajo la cabecera (no un toast que se va) con la salida a la
 * vista, "Iniciar sesión" de 44px, que vuelve a esta tarjeta. Mismo tratamiento que el scorer del torneo.
 */
export function AvisoSesionCerradaBanner({ aviso }: { aviso: AvisoSesionCerrada | null }) {
  if (!aviso) return null
  return (
    <div
      role="alert"
      style={{
        flexShrink: 0,
        margin: '8px 12px 0',
        padding: '10px 14px 4px',
        borderRadius: '10px',
        background: 'rgba(239,68,68,0.10)',
        border: '1px solid rgba(239,68,68,0.35)',
        color: 'var(--text)',
        fontSize: '14px',
        lineHeight: 1.4,
      }}
    >
      <strong>{aviso.titulo}.</strong> {aviso.detalle}
      <Link
        href={aviso.href}
        style={{ display: 'flex', width: 'fit-content', alignItems: 'center', minHeight: '44px', color: 'var(--brand-on-bg)', fontWeight: 700, textDecoration: 'none' }}
      >
        {aviso.cta} →
      </Link>
    </div>
  )
}
