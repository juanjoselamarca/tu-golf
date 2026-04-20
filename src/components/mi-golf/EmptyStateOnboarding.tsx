// src/components/mi-golf/EmptyStateOnboarding.tsx
import Link from 'next/link'
import { Flag, PersonStanding, Upload } from '@/components/icons'

export function EmptyStateOnboarding() {
  return (
    <section style={{ padding: '24px 0' }}>
      <h2
        style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px',
          color: '#1a1a1a',
          margin: '0 0 8px',
        }}
      >
        Bienvenido a Golfers+
      </h2>
      <p style={{ color: '#666', fontSize: '14px', margin: '0 0 24px' }}>
        Tres pasos para empezar a usar tu dashboard.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <OnboardingStep
          num={1}
          icon={<Flag size={18} />}
          title="Juega tu primera ronda"
          sub="Scoreá hoyo a hoyo con tus amigos."
          href="/ronda-libre/nueva"
        />
        <OnboardingStep
          num={2}
          icon={<PersonStanding size={18} />}
          title="Conectá con tAIger"
          sub="Tu coach con IA lee tu juego."
          href="/coach"
        />
        <OnboardingStep
          num={3}
          icon={<Upload size={18} />}
          title="Importá tu historial"
          sub="Rondas anteriores suman al índice."
          href="/importar"
        />
      </div>
    </section>
  )
}

function OnboardingStep({
  num,
  icon,
  title,
  sub,
  href,
}: {
  num: number
  icon: React.ReactNode
  title: string
  sub: string
  href: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        background: '#f8f8f8',
        border: '1px solid #e5e5e5',
        borderRadius: '12px',
        padding: '14px 16px',
        textDecoration: 'none',
        color: '#1a1a1a',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#c4992a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '14px',
          flexShrink: 0,
        }}
      >
        {num}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          {icon}
          {title}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{sub}</div>
      </div>
    </Link>
  )
}
