// Aviso de la vista pública "solo bruto" (decisión de producto 08-oct-2026): un
// espectador sin sesión ve la clasificación BRUTA de un torneo neto. El neto, la
// posición neta y los puntos netos, sólo con sesión. Ver `vista-publica.ts`.

import Link from 'next/link'
import { loginUrl } from '@/lib/auth/login-url'
import { COPY_CLASIFICACION_BRUTA, COPY_SOLO_BRUTO_CTA, COPY_SOLO_BRUTO_ERROR } from '@/lib/vista-publica-copy'

/**
 * `volverA`: a dónde vuelve el login (por defecto, el torneo `slug`; la ronda libre
 * pasa `/ronda-libre/<codigo>`). `error`: el visor tiene sesión pero el neto no
 * cargó: en vez del CTA de login, el aviso de reintento.
 */
export type AvisoSoloBrutoProps = ({ slug: string } | { volverA: string }) & { error?: boolean }

export function AvisoSoloBruto(props: AvisoSoloBrutoProps) {
  const { error = false } = props
  const volverA = 'volverA' in props ? props.volverA : `/torneo/${props.slug}`
  return (
    <p
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px 8px',
        margin: '0 0 14px',
        fontFamily: '"DM Sans", system-ui, sans-serif',
        fontSize: '13px',
        color: 'var(--text-2)',
        textAlign: 'center',
      }}
    >
      <span style={{ fontWeight: 600 }}>{COPY_CLASIFICACION_BRUTA}</span>
      <span aria-hidden="true">·</span>
      {error ? (
        <span>{COPY_SOLO_BRUTO_ERROR}</span>
      ) : (
      <Link
        href={loginUrl(volverA)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: '44px',
          color: 'var(--brand-on-bg)',
          fontWeight: 600,
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
        }}
      >
        {COPY_SOLO_BRUTO_CTA}
      </Link>
      )}
    </p>
  )
}
