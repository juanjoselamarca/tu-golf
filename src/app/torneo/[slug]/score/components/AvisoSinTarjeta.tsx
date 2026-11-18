'use client'

import Link from 'next/link'
import type { AvisoSinAcceso } from '../hooks/acceso-guardado'
import { MENSAJE_BUSQUEDA_TARJETA, type ResultadoBusquedaTarjeta } from '../hooks/useBuscarTarjeta'
import { CTA_RELLENO, CTA_SECUNDARIO } from '@/components/torneo/cta-aviso'

/**
 * Aviso del jugador cuya tarjeta no está en el torneo: "Buscar mi tarjeta" (el servidor la asegura) y
 * salida al torneo. Si la búsqueda respondió "sin sesión", lo único que destraba es iniciar sesión: pasa a
 * ser el botón principal y "Buscar mi tarjeta" queda como acción secundaria.
 */
export function AvisoSinTarjeta(props: {
  aviso: AvisoSinAcceso
  buscando: boolean
  resultado: ResultadoBusquedaTarjeta | null
  buscar: () => void
  /** `avisoSinAcceso('sin_sesion')` con vuelta a esta tarjeta; solo cuando `resultado === 'sin_sesion'`. */
  login: AvisoSinAcceso | null
}) {
  const { aviso, buscando, resultado, buscar, login } = props
  const botonBuscar = (secundario: boolean) => (
    <button
      type="button" onClick={buscar} disabled={buscando}
      style={{ ...(secundario ? CTA_SECUNDARIO : CTA_RELLENO), cursor: buscando ? 'wait' : 'pointer', opacity: buscando ? 0.7 : 1 }}
    >
      {buscando ? 'Buscando...' : 'Buscar mi tarjeta'}
    </button>
  )
  return (
    <div role="alert" data-testid="tarjeta-sin-ronda" style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.4 }}>
      <strong>{aviso.titulo}.</strong> {aviso.detalle}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', marginTop: '10px' }}>
        {login ? (
          <>
            <Link href={login.href} data-testid="login-para-buscar" style={CTA_RELLENO}>{login.cta}</Link>
            {botonBuscar(true)}
          </>
        ) : botonBuscar(false)}
        <Link href={aviso.href} style={CTA_SECUNDARIO}>{aviso.cta}</Link>
      </div>
      {/* Siempre montado: aria-live anuncia el cambio de texto, no un nodo que aparece. */}
      <p aria-live="polite" data-testid="resultado-buscar-tarjeta" style={{ margin: resultado ? '8px 0 0' : 0, fontSize: '14px', color: 'var(--text-2)' }}>
        {resultado ? MENSAJE_BUSQUEDA_TARJETA[resultado] : ''}
      </p>
    </div>
  )
}
