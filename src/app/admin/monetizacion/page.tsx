'use client'

import { useEffect, useState } from 'react'

/* ── design tokens ── */
const bg      = '#050b14'
const cardBg  = '#0a1628'
const border  = '#132540'
const gold    = '#c4992a'
const ivory   = '#edeae4'
const gray    = '#94a8c0'

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

interface OverviewData {
  users: { total: number }
}

export default function MonetizacionAdminPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [conversionPct, setConversionPct] = useState(5)

  useEffect(() => {
    fetch('/api/admin/overview')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const totalUsers = data?.users?.total ?? 0
  const priceMonthly = 9.99
  const priceYearly = 79

  const projectedProUsers = Math.round(totalUsers * (conversionPct / 100))
  const projectedMRR = projectedProUsers * priceMonthly
  const projectedARR = projectedMRR * 12

  // Costos operativos (todo $0 por ahora)
  const costoClaudeAPI = 0
  const costoSupabase  = 0
  const costoVercel    = 0
  const costoTotal     = costoClaudeAPI + costoSupabase + costoVercel
  const breakEven      = Math.max(1, Math.ceil(costoTotal / priceMonthly))

  if (loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', padding: 32, color: ivory }}>
        <p style={{ color: gray }}>Cargando datos de monetización...</p>
      </div>
    )
  }

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
          Monetización
        </h1>
        <p style={{ color: gray, fontSize: 14, marginBottom: 32 }}>
          Métricas de ingresos y proyecciones del plan Pro
        </p>

        {/* ── Banner Plan Pro ── */}
        <div
          style={{
            background: 'rgba(196,153,42,0.08)',
            border: `1px solid ${gold}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 40,
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-playfair), serif',
              fontSize: '1.3rem',
              color: gold,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Plan Pro — Próximamente en Sprint 12
          </p>
          <p style={{ color: ivory, fontSize: 14 }}>
            Precio objetivo: <strong>USD {priceMonthly.toFixed(2)}/mes</strong> · <strong>USD {priceYearly}/año</strong>
          </p>
        </div>

        {/* ── KPIs ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>MRR</p>
            <p style={kpiNumber}>$0</p>
          </div>
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>ARR</p>
            <p style={kpiNumber}>$0</p>
          </div>
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>Pro Users</p>
            <p style={kpiNumber}>0</p>
          </div>
          <div style={card}>
            <p style={{ color: gray, fontSize: 13, marginBottom: 8 }}>Churn</p>
            <p style={kpiNumber}>0%</p>
          </div>
        </div>

        {/* ── PROYECCIONES ── */}
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.4rem',
            color: ivory,
            marginBottom: 16,
          }}
        >
          Proyecciones
        </h2>
        <div style={{ ...card, marginBottom: 40 }}>
          <p style={{ color: ivory, fontSize: 14, marginBottom: 16 }}>
            Si el <strong style={{ color: gold }}>{conversionPct}%</strong> de usuarios activos convierte:
          </p>

          {/* Slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: gray, fontSize: 12 }}>1%</span>
              <span style={{ color: gold, fontSize: 14, fontWeight: 700 }}>{conversionPct}%</span>
              <span style={{ color: gray, fontSize: 12 }}>20%</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={conversionPct}
              onChange={(e) => setConversionPct(Number(e.target.value))}
              style={{
                width: '100%',
                accentColor: gold,
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Resultado */}
          <div
            style={{
              background: 'rgba(196,153,42,0.08)',
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <p style={{ color: ivory, fontSize: 15 }}>
              Con <strong style={{ color: gold }}>{conversionPct}%</strong> de{' '}
              <strong style={{ color: gold }}>{totalUsers}</strong> usuarios →{' '}
              MRR: <strong style={{ color: gold }}>${projectedMRR.toFixed(2)}</strong> ·{' '}
              ARR: <strong style={{ color: gold }}>${projectedARR.toFixed(2)}</strong>
            </p>
            <p style={{ color: gray, fontSize: 13, marginTop: 4 }}>
              {projectedProUsers} usuarios Pro estimados
            </p>
          </div>
        </div>

        {/* ── COSTO OPERATIVO ── */}
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.4rem',
            color: ivory,
            marginBottom: 16,
          }}
        >
          Costo Operativo
        </h2>
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CostRow label="Claude API" value={`$${costoClaudeAPI}/mes`} />
            <CostRow label="Supabase" value={`$${costoSupabase}/mes`} detail="Free tier" />
            <CostRow label="Vercel" value={`$${costoVercel}/mes`} detail="Hobby" />

            <div
              style={{
                borderTop: `1px solid ${border}`,
                paddingTop: 12,
                marginTop: 4,
              }}
            >
              <CostRow label="Total" value={`$${costoTotal}/mes`} bold />
            </div>

            <div
              style={{
                background: 'rgba(196,153,42,0.08)',
                borderRadius: 8,
                padding: 12,
                marginTop: 8,
              }}
            >
              <p style={{ color: ivory, fontSize: 14 }}>
                Break-even:{' '}
                <strong style={{ color: gold }}>
                  Necesitás {breakEven} usuario{breakEven !== 1 ? 's' : ''} Pro
                </strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── helpers ── */
function CostRow({
  label,
  value,
  detail,
  bold,
}: {
  label: string
  value: string
  detail?: string
  bold?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: bold ? ivory : gray, fontSize: 14, fontWeight: bold ? 700 : 400 }}>
        {label}
        {detail && (
          <span
            style={{
              color: '#c4992a',
              fontSize: 11,
              marginLeft: 8,
              background: 'rgba(196,153,42,0.15)',
              padding: '2px 6px',
              borderRadius: 999,
            }}
          >
            {detail}
          </span>
        )}
      </span>
      <span style={{ color: bold ? ivory : '#edeae4', fontSize: 14, fontWeight: bold ? 700 : 500 }}>
        {value}
      </span>
    </div>
  )
}
