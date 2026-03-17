'use client'

import { useEffect, useState } from 'react'

/* ── design tokens ── */
const bg      = '#050b14'
const cardBg  = '#0a1628'
const border  = '#132540'
const gold    = '#c4992a'
const ivory   = '#edeae4'
const gray    = '#7a8fa8'

const card: React.CSSProperties = {
  background: cardBg,
  border: `1px solid ${border}`,
  borderRadius: 12,
  padding: 24,
}
const kpiNumber: React.CSSProperties = {
  fontFamily: 'var(--font-playfair), serif',
  fontSize: '2.5rem',
  fontWeight: 700,
  color: gold,
  lineHeight: 1.1,
}
const badge = (label: string): React.ReactNode => (
  <span
    style={{
      background: 'rgba(196,153,42,0.15)',
      color: gold,
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 999,
      marginLeft: 8,
    }}
  >
    {label}
  </span>
)

interface OverviewData {
  taiger: { sessions: number; usersWithPatterns: number }
  users: { total: number }
}

export default function TaigerAdminPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    fetch('/api/admin/overview')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', padding: 32, color: ivory }}>
        <p style={{ color: gray }}>Cargando datos del tAIger...</p>
      </div>
    )
  }

  const sessions          = data?.taiger?.sessions ?? 0
  const usersWithPatterns = data?.taiger?.usersWithPatterns ?? 0

  return (
    <div style={{ background: bg, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <h1
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '2rem',
            color: ivory,
            marginBottom: 8,
          }}
        >
          🐯 tAIger — Admin
        </h1>
        <p style={{ color: gray, fontSize: 14, marginBottom: 32 }}>
          Panel de control del coach virtual de Tu Golf
        </p>

        {/* ── KPIs ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 40,
          }}
        >
          {/* Sesiones totales */}
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>Sesiones totales</p>
            <p style={kpiNumber}>{sessions}</p>
          </div>

          {/* Usuarios con patrones */}
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>Usuarios con patrones</p>
            <p style={kpiNumber}>{usersWithPatterns}</p>
          </div>

          {/* Onboarding completados */}
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>
              Onboarding completados {badge('Sprint 10')}
            </p>
            <p style={kpiNumber}>0</p>
          </div>

          {/* Técnica más asignada */}
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>
              Técnica más asignada {badge('Sprint 10')}
            </p>
            <p style={kpiNumber}>—</p>
          </div>
        </div>

        {/* ── PATRONES ── */}
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.4rem',
            color: ivory,
            marginBottom: 16,
          }}
        >
          Patrones
        </h2>
        <div
          style={{
            ...card,
            textAlign: 'center',
            padding: 48,
            marginBottom: 40,
          }}
        >
          <p style={{ fontSize: 48, marginBottom: 12 }}>🐯</p>
          <p style={{ color: ivory, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Los patrones del tAIger se activarán en Sprint 10
          </p>
          <p style={{ color: gray, fontSize: 13 }}>
            El análisis de patrones de juego estará disponible cuando se integre la IA de coaching.
          </p>
        </div>

        {/* ── COSTO API ── */}
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.4rem',
            color: ivory,
            marginBottom: 16,
          }}
        >
          Costo Claude API
        </h2>
        <div style={{ ...card, marginBottom: 40 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 20,
            }}
          >
            <div>
              <p style={{ color: gray, fontSize: 13, marginBottom: 4 }}>Llamadas este mes</p>
              <p style={{ color: ivory, fontSize: 20, fontWeight: 700 }}>0</p>
            </div>
            <div>
              <p style={{ color: gray, fontSize: 13, marginBottom: 4 }}>Costo estimado</p>
              <p style={{ color: ivory, fontSize: 20, fontWeight: 700 }}>$0.00</p>
            </div>
            <div>
              <p style={{ color: gray, fontSize: 13, marginBottom: 4 }}>Proyección mensual</p>
              <p style={{ color: ivory, fontSize: 20, fontWeight: 700 }}>$0.00</p>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>{badge('Se activará en Sprint 10')}</div>
        </div>

        {/* ── SYSTEM PROMPT ── */}
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.4rem',
            color: ivory,
            marginBottom: 16,
          }}
        >
          System Prompt
        </h2>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ color: ivory, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                System Prompt v1.0
              </p>
              <p style={{ color: gray, fontSize: 13 }}>
                Archivo: <code style={{ color: gold }}>docs/TAIGER_SYSTEM_PROMPT.md</code>
              </p>
            </div>
            <button
              onClick={() => setShowPrompt(true)}
              style={{
                background: 'rgba(196,153,42,0.15)',
                border: `1px solid ${gold}`,
                color: gold,
                padding: '8px 20px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Ver system prompt
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL ── */}
      {showPrompt && (
        <div
          onClick={() => setShowPrompt(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: cardBg,
              border: `1px solid ${border}`,
              borderRadius: 16,
              padding: 32,
              maxWidth: 640,
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              position: 'relative',
            }}
          >
            {/* Close */}
            <button
              onClick={() => setShowPrompt(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                color: gray,
                fontSize: 22,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            <h3
              style={{
                fontFamily: 'var(--font-playfair), serif',
                fontSize: '1.5rem',
                color: ivory,
                marginBottom: 24,
              }}
            >
              System Prompt v1.0
            </h3>

            {/* Identidad */}
            <Section title="Identidad">
              Sos <strong style={{ color: gold }}>tAIger</strong>, el coach virtual de golf de Tu Golf.
              Un asistente experto en golf amateur que analiza el juego del usuario y ofrece
              recomendaciones personalizadas basadas en sus rondas y patrones.
            </Section>

            {/* Tono */}
            <Section title="Tono">
              Cercano pero profesional. Usás &quot;vos&quot; (español rioplatense). Sos motivador sin
              ser condescendiente. Hablás con conocimiento técnico de golf pero explicás de forma
              simple. Usás emojis con moderación.
            </Section>

            {/* Estructura */}
            <Section title="Estructura">
              Cada respuesta sigue: análisis del dato → insight accionable → recomendación concreta.
              Priorizás lo que el jugador puede mejorar HOY. Máximo 3 puntos por respuesta.
            </Section>

            {/* Formato */}
            <Section title="Formato">
              Respuestas cortas (máx. 200 palabras). Listas con bullets cuando hay múltiples puntos.
              Siempre cerrás con una pregunta o llamada a la acción para mantener la conversación.
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── helper ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h4
        style={{
          color: gold,
          fontSize: 14,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        {title}
      </h4>
      <p style={{ color: ivory, fontSize: 14, lineHeight: 1.6 }}>{children}</p>
    </div>
  )
}
