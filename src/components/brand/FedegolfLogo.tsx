/**
 * Marca oficial de la Federación Chilena de Golf ("CHILE GOLF"), la misma del header de
 * chilegolf.cl (fedegolf.cl redirige su marca ahí). Archivo: `public/brand/fedegolf-chile-golf.png`
 * (600x350), bajado de https://chilegolf.cl/sitio/v2/img/logo-chilegolf-old.png.
 *
 * Va SIEMPRE sobre un chip blanco: el rojo y el azul del logo no se leen sobre el fondo
 * oscuro de la app, y en tema claro el borde separa el chip de la tarjeta.
 */
export const FEDEGOLF_LOGO_SRC = '/brand/fedegolf-chile-golf.png'
const PROPORCION = 600 / 350

interface Props {
  /** Alto del logo (sin el chip), en px. */
  alto: number
  /** Nombre accesible. Vacío = decorativo (el texto de al lado ya lo nombra). */
  alt: string
}

export function FedegolfLogo({ alto, alt }: Props) {
  const relleno = Math.round(alto * 0.28)
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: '#ffffff', border: '1px solid var(--border)', borderRadius: `${Math.round(alto * 0.4)}px`,
        padding: `${relleno}px ${Math.round(relleno * 1.6)}px`, flexShrink: 0,
        boxShadow: '0 1px 4px rgba(7,13,24,0.08)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- asset estático chico, sin optimizador */}
      <img
        src={FEDEGOLF_LOGO_SRC}
        alt={alt}
        width={Math.round(alto * PROPORCION)}
        height={alto}
        style={{ display: 'block', objectFit: 'contain' }}
      />
    </span>
  )
}
