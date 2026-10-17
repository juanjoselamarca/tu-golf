import Link from 'next/link'
import { CheckCircle } from '@/components/icons'

/** Pantalla de confirmación tras inscribirse con cuenta. */
export function InscripcionExitosa({ slug, nombreTorneo }: { slug: string; nombreTorneo: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* Check estático en verde de éxito (DESIGN §3). Antes: un ícono de persona
          rebotando sin fin (sin prefers-reduced-motion). */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', color: 'var(--status-live-fg)' }}>
        <CheckCircle size={56} strokeWidth={1.5} aria-hidden />
      </div>
      <div
        style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px',
          color: 'var(--text)',
          fontWeight: 700,
          textAlign: 'center',
          marginBottom: '8px',
        }}
      >
        ¡Inscripción exitosa!
      </div>
      <div style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '24px' }}>
        Estás inscrito en {nombreTorneo}
      </div>

      <Link
        href={`/torneo/${slug}`}
        style={{
          background: 'var(--brand)',
          color: 'var(--brand-dark)',
          fontWeight: 700,
          fontSize: '15px',
          padding: '0 32px',
          borderRadius: '10px',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: '48px',
        }}
      >
        Ver leaderboard →
      </Link>
    </div>
  )
}
