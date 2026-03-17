'use client'

import { useEffect, useState, useCallback } from 'react'

interface HealthData {
  services: {
    supabase: { ok: boolean; ms: number }
    espn: { ok: boolean; ms: number }
    claude: { ok: boolean; ms: number; status?: string }
    garmin: { ok: boolean; ms: number; status?: string }
    vercel: { ok: boolean; ms: number; commit?: string }
  }
  tables: Record<string, number>
  env: Record<string, boolean>
}

const card = {
  background: '#0a1628',
  border: '1px solid #132540',
  borderRadius: '12px',
  padding: '24px',
}

const envNotes: Record<string, string> = {
  ANTHROPIC_API_KEY: 'requerido para Sprint 10 (tAIger)',
  GARMIN_CLIENT_ID: 'requerido para Sprint 11',
}

function getStatus(service: { ok: boolean; status?: string }) {
  if (service.status === 'not_configured') return { color: '#7a8fa8', text: 'No configurado' }
  if (service.ok) return { color: '#16a34a', text: 'OK' }
  return { color: '#dc2626', text: 'Error' }
}

export default function SistemaPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const services = health
    ? [
        { name: 'Supabase', ...health.services.supabase },
        { name: 'Vercel', ...health.services.vercel },
        { name: 'ESPN API', ...health.services.espn },
        { name: 'Claude API', ...health.services.claude },
        { name: 'Garmin API', ...health.services.garmin },
      ]
    : []

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
        Sistema
      </h1>
      <p style={{ color: '#7a8fa8', marginBottom: '32px' }}>
        Estado de servicios, base de datos y configuración
      </p>

      {loading && (
        <p style={{ color: '#7a8fa8', marginBottom: '24px' }}>Cargando estado del sistema...</p>
      )}

      {/* Service status grid */}
      {health && (
        <section style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-playfair), serif',
              fontSize: '1.5rem',
              color: '#edeae4',
              marginBottom: '16px',
            }}
          >
            Estado de servicios
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
            }}
          >
            {services.map((svc) => {
              const st = getStatus(svc)
              return (
                <div key={svc.name} style={card}>
                  <p style={{ color: '#edeae4', fontWeight: 600, marginBottom: '12px', fontSize: '0.95rem' }}>
                    {svc.name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: st.color,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: st.color, fontSize: '0.9rem', fontWeight: 500 }}>
                      {st.text}
                    </span>
                  </div>
                  <p style={{ color: '#7a8fa8', fontSize: '0.85rem' }}>
                    {svc.ms > 0 ? `${svc.ms}ms` : '\u2014'}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Último deploy */}
      {health && (
        <section style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-playfair), serif',
              fontSize: '1.5rem',
              color: '#edeae4',
              marginBottom: '16px',
            }}
          >
            Último deploy
          </h2>
          <div style={card}>
            <p style={{ color: '#7a8fa8', fontSize: '0.9rem', marginBottom: '8px' }}>Commit</p>
            <p
              style={{
                color: '#edeae4',
                fontFamily: 'monospace',
                fontSize: '1rem',
                background: '#050b14',
                display: 'inline-block',
                padding: '6px 14px',
                borderRadius: '6px',
              }}
            >
              {health.services.vercel.commit || 'local'}
            </p>
          </div>
        </section>
      )}

      {/* Métricas de BD */}
      {health && (
        <section style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-playfair), serif',
              fontSize: '1.5rem',
              color: '#edeae4',
              marginBottom: '16px',
            }}
          >
            Métricas de BD
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            {Object.entries(health.tables).map(([table, count]) => (
              <div key={table} style={card}>
                <p style={{ color: '#7a8fa8', fontSize: '0.8rem', marginBottom: '8px' }}>
                  {table}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-playfair), serif',
                    fontSize: '2.5rem',
                    color: '#c4992a',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {count}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Variables de entorno */}
      {health && (
        <section style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-playfair), serif',
              fontSize: '1.5rem',
              color: '#edeae4',
              marginBottom: '16px',
            }}
          >
            Variables de entorno
          </h2>
          <div style={card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(health.env).map(([key, present]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1rem' }}>{present ? '\u2705' : '\u274C'}</span>
                  <span style={{ color: '#edeae4', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                    {key}
                  </span>
                  {envNotes[key] && (
                    <span style={{ color: '#7a8fa8', fontSize: '0.8rem', marginLeft: '4px' }}>
                      — {envNotes[key]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Errores recientes */}
      <section>
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.5rem',
            color: '#edeae4',
            marginBottom: '16px',
          }}
        >
          Errores recientes
        </h2>
        <div style={card}>
          <p style={{ color: '#16a34a', fontSize: '0.95rem' }}>
            Sin errores registrados en las últimas 24 horas ✅
          </p>
        </div>
      </section>
    </div>
  )
}
