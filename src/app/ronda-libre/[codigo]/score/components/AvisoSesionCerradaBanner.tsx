import Link from 'next/link'
import type { AvisoSesionCerrada } from '@/lib/auth/aviso-sesion-cerrada'

/**
 * Hay que iniciar sesión para que se guarde: aviso fijo bajo la cabecera (no un toast que se va) con la salida a
 * la vista, el botón "Iniciar sesión" de 44px que vuelve a esta tarjeta. Botón relleno como el de
 * `ConexionScorerBanner` (score-grupo): #070D18 sobre #C4992A = 7,35:1 en ambos temas (los dos tokens no cambian
 * con el tema); el texto del aviso, --text sobre el rojo al 10 % compositado, 14,2:1 claro / 15,0:1 oscuro.
 */
export function AvisoSesionCerradaBanner({ aviso }: { aviso: AvisoSesionCerrada | null }) {
  if (!aviso) return null
  return (
    <div
      role="alert"
      style={{
        flexShrink: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 12px',
        margin: '0 12px 8px',
        padding: '10px 14px',
        borderRadius: '10px',
        background: 'rgba(239,68,68,0.10)',
        border: '1px solid rgba(239,68,68,0.35)',
        color: 'var(--text)',
        fontSize: '14px',
        lineHeight: 1.4,
      }}
    >
      <span style={{ flex: '1 1 200px' }}>
        <strong>{aviso.titulo}.</strong> {aviso.detalle}
      </span>
      <Link
        href={aviso.href}
        style={{
          minHeight: '44px', display: 'inline-flex', alignItems: 'center',
          padding: '0 14px', borderRadius: '10px', flexShrink: 0,
          background: 'var(--brand)', color: 'var(--brand-dark)',
          fontWeight: 700, fontSize: '14px', textDecoration: 'none',
        }}
      >
        {aviso.cta}
      </Link>
    </div>
  )
}
