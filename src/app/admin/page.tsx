'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminChart } from '@/components/admin/AdminChart'
import { LiveFeed } from '@/components/admin/LiveFeed'
import { HealthGrid } from '@/components/admin/HealthGrid'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { adminColors, adminFonts } from '@/components/admin/admin-tokens'

// ── Types ──
interface OverviewData {
  users: { total: number; new7d: number; new30d: number }
  tournaments: { total: number; last30d: number }
  rounds: { total: number; freeRoundsTotal: number; freeRounds7d: number }
  historical: { total: number }
  taiger: { sessions: number; usersWithPatterns: number }
  proUsers: number
  sparklines?: { newUsersDaily?: number[] }
}

interface ServiceHealth {
  name: string
  ok: boolean
  ms: number
  status?: string
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

interface ActivityPoint {
  fecha: string
  dau: number
  rondas: number
  torneos: number
  tarjetas: number
}

function parseHealthServices(raw: HealthRaw | null): ServiceHealth[] {
  if (!raw?.services) return []
  const s = raw.services
  return [
    { name: 'Supabase', ok: s.supabase?.ok ?? false, ms: s.supabase?.ms ?? 0 },
    { name: 'Vercel', ok: s.vercel?.ok ?? false, ms: s.vercel?.ms ?? 0 },
    { name: 'ESPN API', ok: s.espn?.ok ?? false, ms: s.espn?.ms ?? 0 },
    { name: 'tAIger (Claude)', ok: s.claude?.ok ?? false, ms: s.claude?.ms ?? 0, status: s.claude?.status },
    { name: 'Garmin', ok: s.garmin?.ok ?? false, ms: s.garmin?.ms ?? 0, status: s.garmin?.status },
  ]
}

export default function CommandCenterPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [health, setHealth] = useState<HealthRaw | null>(null)
  const [activity, setActivity] = useState<ActivityPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [healthLoading, setHealthLoading] = useState(true)

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview')
      if (res.ok) setOverview(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) setHealth(await res.json())
    } catch { /* silent */ }
    finally { setHealthLoading(false) }
  }, [])

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/activity')
      if (res.ok) {
        const data = await res.json()
        setActivity(data.activity ?? [])
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchOverview()
    fetchHealth()
    fetchActivity()

    const overviewInterval = setInterval(fetchOverview, 30_000)
    const healthInterval = setInterval(fetchHealth, 30_000)
    const activityInterval = setInterval(fetchActivity, 60_000)
    return () => {
      clearInterval(overviewInterval)
      clearInterval(healthInterval)
      clearInterval(activityInterval)
    }
  }, [fetchOverview, fetchHealth, fetchActivity])

  // Parse health services
  const healthServices = parseHealthServices(health)
  const okCount = healthServices.filter(s => s.ok && s.status !== 'not_configured').length
  const totalServices = healthServices.length
  const healthScore = totalServices > 0 ? Math.round((okCount / totalServices) * 100) : 0

  // Chart data transformation
  const chartData = activity.map(a => ({
    date: a.fecha.slice(5), // MM-DD
    rondas: a.rondas,
    dau: a.dau,
    tarjetas: a.tarjetas,
  }))

  // Alerts
  const alerts: { text: string; variant: 'warning' | 'error' }[] = []
  if (health) {
    healthServices.forEach(s => {
      if (!s.ok && s.status !== 'not_configured') {
        alerts.push({ text: `${s.name} con errores`, variant: 'error' })
      }
    })
  }
  if (overview && overview.users.new7d === 0) {
    alerts.push({ text: '0 usuarios nuevos en 7 dias', variant: 'warning' })
  }

  return (
    <div style={{ color: adminColors.ivory, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Page header */}
      <h1 style={{
        ...adminFonts.sectionTitle, fontSize: '1.5rem',
        marginBottom: '24px', color: adminColors.gold,
        fontFamily: "'Playfair Display', serif",
      }}>
        Command Center
      </h1>

      {/* ── ROW 1: KPI Cards ── */}
      <div style={{ marginBottom: '24px' }}>
        <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>
          INDICADORES CLAVE
        </span>
        <div style={{
          display: 'flex', gap: '12px', flexWrap: 'wrap',
        }}>
          <AdminCard
            icon={'\uD83D\uDC65'}
            label="Total Usuarios"
            value={overview?.users.total ?? 0}
            delta={overview ? { value: overview.users.new7d, label: 'nuevos 7d' } : undefined}
            sparkline={overview?.sparklines?.newUsersDaily}
            loading={loading}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          />
          <AdminCard
            icon={'\uD83C\uDD95'}
            label="Nuevos 7d"
            value={overview?.users.new7d ?? 0}
            delta={overview ? { value: overview.users.new30d, label: 'nuevos 30d' } : undefined}
            loading={loading}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          />
          <AdminCard
            icon={'\u26F3'}
            label="Rondas Libres"
            value={overview?.rounds.freeRoundsTotal ?? 0}
            delta={overview ? { value: overview.rounds.freeRounds7d, label: 'ult. 7d' } : undefined}
            loading={loading}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          />
          <AdminCard
            icon={'\uD83E\uDD16'}
            label="tAIger Sessions"
            value={overview?.taiger.sessions ?? 0}
            loading={loading}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          />
          <AdminCard
            icon={'\uD83C\uDFC6'}
            label="Torneos"
            value={overview?.tournaments.total ?? 0}
            delta={overview ? { value: overview.tournaments.last30d, label: 'ult. 30d' } : undefined}
            loading={loading}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          />
          <AdminCard
            icon={'\uD83D\uDC9A'}
            label="Health Score"
            value={loading ? 0 : `${healthScore}%`}
            loading={loading}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          />
        </div>
      </div>

      {/* ── ROW 2: Activity Chart ── */}
      <div style={{ marginBottom: '24px' }}>
        <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>
          ACTIVIDAD
        </span>
        <AdminChart
          data={chartData}
          dataKeys={[
            { key: 'rondas', color: adminColors.gold, name: 'Rondas' },
            { key: 'dau', color: adminColors.blue, name: 'DAU' },
            { key: 'tarjetas', color: adminColors.green, name: 'Tarjetas' },
          ]}
          xAxisKey="date"
          type="area"
          height={280}
          emptyMessage="Sin actividad registrada aún"
        />
      </div>

      {/* ── ROW 3: Two columns ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '16px',
      }}>
        {/* Left: LiveFeed */}
        <div>
          <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>
            FEED EN VIVO
          </span>
          <LiveFeed />
        </div>

        {/* Right: Health + Alerts */}
        <div>
          <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>
            ESTADO DE SERVICIOS
          </span>
          <HealthGrid services={healthServices} loading={healthLoading} />

          {/* Alerts panel */}
          <div style={{ marginTop: '16px' }}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '10px' }}>
              ALERTAS
            </span>
            <div style={{
              background: adminColors.card,
              border: `1px solid ${adminColors.border}`,
              borderRadius: '12px',
              padding: '16px',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              {alerts.length === 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  color: adminColors.grayDim, fontSize: '13px',
                }}>
                  <AdminBadge text="Sin alertas" variant="success" dot />
                </div>
              ) : (
                alerts.map((alert, i) => (
                  <AdminBadge key={i} text={alert.text} variant={alert.variant} dot />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
