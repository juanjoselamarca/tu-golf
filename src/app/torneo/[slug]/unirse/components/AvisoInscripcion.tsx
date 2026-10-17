import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Estado honesto en lugar del botón de inscribirse (cerrado, completo, sin
 * índice): título, explicación opcional y la acción que sí sirve.
 */
export function AvisoInscripcion({
  titulo,
  detalle,
  children,
}: {
  titulo: string
  detalle?: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--surface-soft)',
        border: '1px solid var(--surface-border)',
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        marginBottom: '16px',
      }}
    >
      <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 600, marginBottom: '6px' }}>
        {titulo}
      </div>
      {detalle && (
        <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '14px' }}>
          {detalle}
        </div>
      )}
      {children}
    </div>
  )
}

/** Link secundario "Ver leaderboard →" al torneo. */
export function LinkVerLeaderboard({ slug }: { slug: string }) {
  return (
    <Link
      href={`/torneo/${slug}`}
      style={{ fontSize: '13px', color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: '3px' }}
    >
      Ver leaderboard →
    </Link>
  )
}
