'use client'
import Link from 'next/link'

export default function CoachDashboard() {
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 80px' }}>
      <Link href="/" style={{ color: '#94a8c0', fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '24px', minHeight: '44px' }}>
        ← Inicio
      </Link>

      <div style={{
        background: 'linear-gradient(135deg, rgba(14,28,47,0.96) 0%, rgba(23,49,41,0.94) 100%)',
        border: '1px solid rgba(196,153,42,0.2)',
        borderRadius: '16px', padding: '32px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🐯</div>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', fontWeight: 700, color: '#edeae4', marginBottom: '8px' }}>
          tAIger+
        </div>
        <div style={{ fontSize: '14px', color: '#94a8c0', lineHeight: 1.6, marginBottom: '24px', maxWidth: '320px', margin: '0 auto 24px' }}>
          Tu coach de golf con inteligencia artificial. Análisis de ronda, plan de práctica semanal y coaching mental personalizado.
        </div>

        <div style={{
          background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.25)',
          borderRadius: '12px', padding: '16px', marginBottom: '20px',
        }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-dm-mono), monospace', color: '#c4992a', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
            PRÓXIMAMENTE
          </div>
          <div style={{ fontSize: '15px', color: '#edeae4', fontWeight: 600, marginBottom: '4px' }}>
            Disponible en Plan Pro+
          </div>
          <div style={{ fontSize: '12px', color: '#94a8c0' }}>
            Estamos preparando la mejor experiencia de coaching para ti
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
          {[
            { icon: '📊', title: 'Análisis post-ronda', desc: 'Revisión detallada de cada vuelta con insights personalizados' },
            { icon: '📋', title: 'Plan de práctica', desc: 'Rutina semanal adaptada a tus áreas de mejora' },
            { icon: '🧠', title: 'Coaching mental', desc: 'Técnicas de rendimiento basadas en psicología deportiva' },
          ].map(f => (
            <div key={f.title} style={{
              display: 'flex', gap: '12px', alignItems: 'flex-start',
              background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px',
            }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#edeae4', marginBottom: '2px' }}>{f.title}</div>
                <div style={{ fontSize: '12px', color: '#94a8c0', lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
