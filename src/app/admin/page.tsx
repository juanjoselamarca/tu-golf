'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

// ── Design tokens ──
const colors = {
  bg: '#050b14',
  card: '#0a1628',
  border: '#132540',
  gold: '#c4992a',
  ivory: '#edeae4',
  gray: '#7a8fa8',
  green: '#16a34a',
  red: '#dc2626',
}

const font = {
  kpi: { fontFamily: "'Playfair Display', serif", fontSize: '2.5rem', color: colors.gold, fontWeight: 700 },
  label: { fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: colors.gray },
}

// ── Types ──
interface OverviewData {
  users: { total: number; new7d: number; new30d: number }
  tournaments: { total: number; last30d: number }
  rounds: { total: number; freeRoundsTotal: number; freeRounds7d: number }
  historical: { total: number }
  taiger: { sessions: number; usersWithPatterns: number }
  proUsers: number
}

interface HealthService {
  name: string
  status: 'ok' | 'error' | 'not_configured'
}

interface HealthRaw {
  services: {
    supabase?: { ok: boolean; ms: number }
    espn?: { ok: boolean; ms: number }
    claude?: { ok: boolean; ms: number; status?: string }
    garmin?: { ok: boolean; ms: number; status?: string }
    vercel?: { ok: boolean; ms: number; commit?: string }
  }
}

function parseHealthServices(raw: HealthRaw | null): HealthService[] {
  if (!raw?.services) return []
  const s = raw.services
  return [
    { name: 'Supabase', status: s.supabase?.ok ? 'ok' : 'not_configured' },
    { name: 'Vercel', status: s.vercel?.ok ? 'ok' : s.vercel ? 'error' : 'not_configured' },
    { name: 'ESPN API', status: s.espn?.ok ? 'ok' : s.espn ? 'error' : 'not_configured' },
    { name: 'tAIger', status: s.claude?.status === 'not_configured' ? 'not_configured' : s.claude?.ok ? 'ok' : 'error' },
  ]
}

interface ActivityPoint {
  date: string
  events: number
}

// ── KPI Card ──
function KpiCard({
  icon,
  value,
  label,
  delta,
  loading,
}: {
  icon: string
  value: number
  label: string
  delta?: { value: number; label: string }
  loading: boolean
}) {
  return (
    <div
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
        flex: '1 1 180px',
      }}
    >
      <span style={{ fontSize: '24px' }}>{icon}</span>
      {loading ? (
        <div
          style={{
            height: '40px',
            width: '80px',
            borderRadius: '8px',
            background: `linear-gradient(90deg, ${colors.border} 25%, ${colors.card} 50%, ${colors.border} 75%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      ) : (
        <span style={font.kpi}>{value.toLocaleString()}</span>
      )}
      <span style={font.label}>{label}</span>
      {delta && !loading && (
        <span
          style={{
            ...font.label,
            fontSize: '11px',
            color: delta.value >= 0 ? colors.green : colors.red,
            fontWeight: 600,
          }}
        >
          {delta.value >= 0 ? '+' : ''}
          {delta.value} {delta.label}
        </span>
      )}
    </div>
  )
}

// ── Health dot ──
function HealthDot({ status }: { status: 'ok' | 'error' | 'not_configured' }) {
  const c = status === 'ok' ? colors.green : status === 'error' ? colors.red : colors.gray
  return (
    <span
      style={{
        display: 'inline-block',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: c,
        marginRight: '8px',
        boxShadow: status === 'ok' ? `0 0 6px ${c}` : 'none',
      }}
    />
  )
}

// ── Activity Chart ──
function ActivityChart({ data }: { data: ActivityPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: '300px',
          background: colors.card,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.5 }}>&#128202;</span>
        <p style={{ ...font.label, fontSize: '14px', color: colors.ivory, marginBottom: '8px' }}>
          Sin actividad registrada a&uacute;n
        </p>
        <p style={font.label}>
          Los eventos aparecer&aacute;n aqu&iacute; una vez que los usuarios interact&uacute;en con la app.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        height: '300px',
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" stroke={colors.gray} tick={{ fontSize: 11 }} />
          <YAxis stroke={colors.gray} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              color: colors.ivory,
              fontSize: '12px',
            }}
          />
          <Line
            type="monotone"
            dataKey="events"
            stroke={colors.gold}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.gold }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main ──
export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [health, setHealth] = useState<HealthRaw | null>(null)
  const [activity, setActivity] = useState<ActivityPoint[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview')
      if (res.ok) {
        const data = await res.json()
        setOverview(data)
      }
    } catch {
      /* silently fail */
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } catch {
      setHealth(null)
    }
  }, [])

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/activity')
      if (res.ok) {
        const data = await res.json()
        setActivity(data.activity ?? [])
      }
    } catch {
      setActivity([])
    }
  }, [])

  useEffect(() => {
    fetchOverview()
    fetchHealth()
    fetchActivity()

    const healthInterval = setInterval(fetchHealth, 60_000)
    return () => clearInterval(healthInterval)
  }, [fetchOverview, fetchHealth, fetchActivity])

  const kpis = [
    {
      icon: '\u{1F465}',
      value: overview?.users.total ?? 0,
      label: 'Total Usuarios',
      delta: overview ? { value: overview.users.new7d, label: 'nuevos 7d' } : undefined,
    },
    {
      icon: '\u{1F195}',
      value: overview?.users.new7d ?? 0,
      label: 'Nuevos 7d',
      delta: overview ? { value: overview.users.new30d, label: 'nuevos 30d' } : undefined,
    },
    {
      icon: '\u26F3',
      value: overview?.rounds.freeRoundsTotal ?? 0,
      label: 'Rondas Libres',
      delta: overview ? { value: overview.rounds.freeRounds7d, label: '\u00FAlt. 7d' } : undefined,
    },
    {
      icon: '\u{1F916}',
      value: overview?.taiger.sessions ?? 0,
      label: 'tAIger Sessions',
    },
    {
      icon: '\u{1F451}',
      value: overview?.proUsers ?? 0,
      label: 'Pro Users',
    },
  ]

  const healthServices: HealthService[] = health
    ? parseHealthServices(health)
    : [
        { name: 'Supabase', status: 'not_configured' },
        { name: 'Vercel', status: 'not_configured' },
        { name: 'ESPN API', status: 'not_configured' },
        { name: 'tAIger', status: 'not_configured' },
      ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          background: colors.bg,
          color: colors.ivory,
          fontFamily: "'DM Sans', sans-serif",
          padding: '32px',
        }}
      >
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.75rem',
            color: colors.gold,
            marginBottom: '32px',
          }}
        >
          Panel de Administraci&oacute;n
        </h1>

        {/* ROW 1 — KPIs */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '24px',
          }}
        >
          {kpis.map((kpi, i) => (
            <KpiCard key={i} {...kpi} loading={loading} />
          ))}
        </div>

        {/* ROW 2 — Activity chart */}
        <div style={{ marginBottom: '24px' }}>
          <h2
            style={{
              ...font.label,
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '12px',
            }}
          >
            Actividad
          </h2>
          <ActivityChart data={activity} />
        </div>

        {/* ROW 3 — Two columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          {/* LEFT: Top 5 */}
          <div
            style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h3
              style={{
                ...font.label,
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '16px',
              }}
            >
              Top 5 Usuarios
            </h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '140px',
                color: colors.gray,
                fontSize: '13px',
              }}
            >
              Datos disponibles pr&oacute;ximamente
            </div>
          </div>

          {/* RIGHT: Feed */}
          <div
            style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h3
              style={{
                ...font.label,
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '16px',
              }}
            >
              Actividad Reciente
            </h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '140px',
                color: colors.gray,
                fontSize: '13px',
              }}
            >
              Sin actividad registrada
            </div>
          </div>
        </div>

        {/* ROW 4 — Health */}
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <h3
            style={{
              ...font.label,
              fontSize: '13px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '16px',
            }}
          >
            Estado de Servicios
          </h3>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {healthServices.map((svc) => (
              <div
                key={svc.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '14px',
                  color: colors.ivory,
                }}
              >
                <HealthDot status={svc.status} />
                <span>{svc.name}</span>
                <span
                  style={{
                    ...font.label,
                    marginLeft: '8px',
                    fontSize: '11px',
                  }}
                >
                  {svc.status === 'ok' ? 'Operativo' : svc.status === 'error' ? 'Error' : 'No configurado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
