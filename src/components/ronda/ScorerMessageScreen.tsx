'use client'

/**
 * Pantalla de mensaje de los scorers (error de carga, ronda inexistente).
 * Misma pantalla en el scorer individual y en el de grupo: mensaje, botón de
 * recargar si corresponde, y el camino de vuelta al marcador.
 */
export function ScorerMessageScreen({
  message,
  codigo,
  reload = false,
}: {
  message: string
  codigo: string
  /** Muestra "Recargar" (errores de carga). */
  reload?: boolean
}) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', gap: '16px' }}>
      <div style={{ fontSize: '16px', color: 'var(--text-2)' }}>{message}</div>
      {reload && (
        <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: '8px', background: 'var(--brand)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
          Recargar
        </button>
      )}
      <a href={`/ronda-libre/${codigo}`} style={{ fontSize: '13px', color: 'var(--text-3)', textDecoration: 'underline' }}>
        Volver al marcador
      </a>
    </div>
  )
}
