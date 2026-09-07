import Link from 'next/link'
import { TaigerHero } from '@/components/coach/TaigerHero'

/**
 * Pantalla "próximamente" para usuarios sin acceso al coach.
 * Diseño: atmósfera + una declaración + un párrafo + salida.
 * Sin feature grids, sin badges, sin dividers — decisión de producto,
 * no placeholder.
 */
export function CoachGatePage() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 100px' }}>
      <TaigerHero />

      <div style={{ padding: '0 4px', marginTop: 8 }}>
        <h3 style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.25,
          margin: '0 0 20px',
        }}>
          Tu coach personal de golf
        </h3>

        <p style={{
          fontSize: 15,
          lineHeight: 1.7,
          color: 'var(--text-2)',
          margin: '0 0 16px',
          maxWidth: 420,
        }}>
          tAIger+ analiza cada ronda que juegas, detecta los patrones que te
          cuestan golpes y te guía para bajar tu handicap con recomendaciones
          adaptadas a tu juego.
        </p>

        <p style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--text-3)',
          margin: '0 0 48px',
        }}>
          Próximamente disponible para todos los usuarios.
        </p>

        <Link href="/dashboard" style={{
          fontSize: 14,
          color: 'var(--brand-on-bg)',
          textDecoration: 'none',
          opacity: 0.7,
        }}>
          ← Volver
        </Link>
      </div>
    </div>
  )
}
