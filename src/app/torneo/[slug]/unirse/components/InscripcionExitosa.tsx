import Link from 'next/link'
import { PersonStanding } from '@/components/icons'

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
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', animation: 'bounce 0.6s ease infinite alternate' }}>
        <PersonStanding size={64} strokeWidth={1.5} />
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
          padding: '14px 32px',
          borderRadius: '10px',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Ver leaderboard →
      </Link>
      <style>{`
        @keyframes bounce {
          from { transform: translateY(0); }
          to   { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  )
}
