/**
 * Logo de FedeGolf en la app: el "CHILE GOLF" cuadrado de siempre (el del modal de vinculación;
 * decisión de Juanjo 27-nov-2026). `public/images/fedegolf-logo.png` es el MISMO diseño en
 * 256x256: el favicon de https://www.fedegolf.cl/skin/img/favicon/all.png (antes era el
 * /code/img/logocg.png de 43x42, que se pixelaba sobre 30 px).
 *
 * Va SIEMPRE sobre un chip blanco, como el original: el rojo y el azul no se leen sobre el fondo
 * oscuro de la app, y en tema claro el borde separa el chip de la tarjeta.
 */
export const FEDEGOLF_LOGO_SRC = '/images/fedegolf-logo.png'

interface Props {
  /** Lado del logo (cuadrado, sin el chip), en px. */
  alto: number
  /** Nombre accesible. */
  alt: string
}

export function FedegolfLogo({ alto, alt }: Props) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: '#ffffff', border: '1px solid var(--border)', borderRadius: `${Math.round(alto * 0.25)}px`,
        padding: `${Math.max(2, Math.round(alto * 0.1))}px`, flexShrink: 0,
        boxShadow: '0 1px 4px rgba(7,13,24,0.08)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- asset estático chico, sin optimizador */}
      <img src={FEDEGOLF_LOGO_SRC} alt={alt} width={alto} height={alto} style={{ display: 'block', objectFit: 'contain' }} />
    </span>
  )
}
