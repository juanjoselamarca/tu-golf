'use client'

const card = {
  background: '#0a1628',
  border: '1px solid #132540',
  borderRadius: '12px',
  padding: '24px',
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #132540' }}>
      <span style={{ color: '#7a8fa8', fontSize: '0.9rem' }}>{label}</span>
      <span style={{ color: '#edeae4', fontSize: '0.9rem', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function Badge({ text, variant = 'default' }: { text: string; variant?: 'default' | 'gold' }) {
  const bg = variant === 'gold' ? '#c4992a' : '#132540'
  const color = variant === 'gold' ? '#050b14' : '#7a8fa8'
  return (
    <span
      style={{
        display: 'inline-block',
        background: bg,
        color,
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: '999px',
        marginLeft: '8px',
      }}
    >
      {text}
    </span>
  )
}

export default function ConfiguracionPage() {
  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      <h1
        style={{
          fontFamily: 'var(--font-playfair), serif',
          fontSize: '2.5rem',
          color: '#c4992a',
          marginBottom: '8px',
        }}
      >
        Configuración
      </h1>
      <p style={{ color: '#7a8fa8', marginBottom: '32px' }}>
        Ajustes generales de la plataforma
      </p>

      {/* General */}
      <section style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.5rem',
            color: '#edeae4',
            marginBottom: '16px',
          }}
        >
          General
        </h2>
        <div style={card}>
          <InfoRow label="Nombre" value="Golfers+" />
          <InfoRow label="URL" value="https://tu-golf.vercel.app" />
          <InfoRow label="Email soporte" value="soporte@golfers.plus" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
            <span style={{ color: '#7a8fa8', fontSize: '0.9rem' }}>Stack</span>
            <span style={{ color: '#edeae4', fontSize: '0.9rem' }}>
              Next.js 14 · Supabase · Tailwind · TypeScript · Vercel
            </span>
          </div>
        </div>
      </section>

      {/* tAIger */}
      <section style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.5rem',
            color: '#edeae4',
            marginBottom: '16px',
          }}
        >
          tAIger
        </h2>
        <div style={card}>
          <InfoRow label="Límite sesiones gratuitas" value="3/mes" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
            <span style={{ color: '#7a8fa8', fontSize: '0.9rem' }}>Estado</span>
            <span style={{ color: '#edeae4', fontSize: '0.9rem' }}>
              Inactivo — se activa en Sprint 10
              <Badge text="Sprint 10" variant="gold" />
            </span>
          </div>
        </div>
      </section>

      {/* Administradores */}
      <section>
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.5rem',
            color: '#edeae4',
            marginBottom: '16px',
          }}
        >
          Administradores
        </h2>
        <div style={card}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid #132540',
            }}
          >
            <span style={{ color: '#edeae4', fontSize: '0.9rem' }}>
              Configurado via env ADMIN_EMAILS
            </span>
            <Badge text="Propietario" variant="gold" />
          </div>
          <p style={{ color: '#7a8fa8', fontSize: '0.85rem', marginTop: '12px' }}>
            Preparado para agregar más admins en el futuro
          </p>
        </div>
      </section>
    </div>
  )
}
