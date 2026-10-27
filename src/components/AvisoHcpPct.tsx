/**
 * Aviso del handicap de juego del torneo ("Handicap al 85 %") en la cabecera
 * del board público. Es una regla del torneo: se avisa una vez, no por jugador.
 * Sin etiqueta (torneo al 100 %) no pinta nada.
 *
 * Contraste medido (WCAG 2.2 AA, texto 13px >= 4.5:1): --text-2 sobre --bg
 * 5.67:1 en claro (#5a6573/#fafaf7) y 7.98:1 en oscuro (#94a8c0/#070d18);
 * sobre --bg-surface 5.93:1 y 7.03:1. Colores opacos, sin alpha que compositar.
 */
interface AvisoHcpPctProps {
  /** `etiquetaHcpPct(hcpPctDelTorneo(t))`: null al 100 %. */
  etiqueta?: string | null
}

export function AvisoHcpPct({ etiqueta }: AvisoHcpPctProps) {
  if (!etiqueta) return null
  return (
    <p
      style={{
        margin: '0 0 14px',
        textAlign: 'center',
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-2)',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
    >
      {etiqueta}
    </p>
  )
}
