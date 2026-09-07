import Link from 'next/link'
import { TaigerHero } from '@/components/coach/TaigerHero'

// ─── Icon helpers ────────────────────────────────────────────────────────────

function BarChartIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx={12} cy={12} r={10} />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

// ─── Feature row ─────────────────────────────────────────────────────────────

interface GateFeatureRowProps {
  icon: React.ReactNode
  title: string
  description: string
}

function GateFeatureRow({ icon, title, description }: GateFeatureRowProps) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: 'rgba(196,153,42,0.08)',
        border: '1px solid rgba(196,153,42,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--brand-on-bg)',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>{description}</div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CoachGatePage() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>
      <style>{`
        @keyframes gatePulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />

      {/* Badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'rgba(196,153,42,0.1)',
        border: '1px solid rgba(196,153,42,0.2)',
        borderRadius: 20,
        padding: '6px 14px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        color: 'var(--brand-on-bg)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'currentColor',
          animation: 'gatePulse 2s ease-in-out infinite',
          flexShrink: 0,
        }} />
        En desarrollo
      </div>

      {/* Main copy */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 22, fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.3,
          margin: 0,
        }}>
          Tu coach de golf con inteligencia artificial
        </h3>
        <p style={{
          fontSize: 15, lineHeight: 1.65,
          color: 'var(--text-2)',
          marginTop: 12, marginBottom: 0,
        }}>
          Estamos construyendo algo especial: un coach que{' '}
          <span style={{ color: 'var(--brand-on-bg)', fontWeight: 500 }}>
            analiza tu juego real
          </span>
          , detecta patrones en tus rondas y te ayuda a bajar tu handicap con recomendaciones personalizadas.
        </p>
      </div>

      {/* Features preview */}
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <GateFeatureRow
          icon={<BarChartIcon />}
          title="Análisis de patrones"
          description="Detecta tendencias en tu juego que no ves a simple vista"
        />
        <GateFeatureRow
          icon={<ClockIcon />}
          title="Psicología deportiva"
          description="Mide tu costo mental y te ayuda a mantener la calma bajo presión"
        />
        <GateFeatureRow
          icon={<ChatIcon />}
          title="Conversación natural"
          description="Habla con tu coach como si fuera tu pro — entiende contexto y responde con criterio"
        />
      </div>

      {/* Divider */}
      <div style={{
        width: '100%', height: 1,
        background: 'rgba(196,153,42,0.1)',
        margin: '32px 0',
      }} />

      {/* CTA area */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
          tAIger+ estará disponible próximamente para todos los usuarios.
        </p>
        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '14px 28px',
          borderRadius: 12,
          border: '1px solid rgba(196,153,42,0.25)',
          background: 'transparent',
          color: 'var(--brand-on-bg)',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 15, fontWeight: 600,
          textDecoration: 'none',
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
