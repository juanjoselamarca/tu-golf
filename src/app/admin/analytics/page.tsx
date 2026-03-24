'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminChart } from '@/components/admin/AdminChart'
import { AdminTable } from '@/components/admin/AdminTable'
import { FunnelChart } from '@/components/admin/FunnelChart'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

interface AnalyticsData {
  growth: {
    total: number
    new7d: number
    new30d: number
    new90d: number
    byDay: { date: string; count: number }[]
  }
  funnel: {
    registered: number
    firstRound: number
    historicalCard: number
    taiger: number
    pro: number
  }
  engagement: {
    avgRoundsPerUser: number
    totalRoundsPlayed: number
    topUsers: { userId: string; events: number; name: string }[]
  }
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [fetchData])

  const topUsersRows = (data?.engagement.topUsers ?? []).map((u, i) => ({
    rank: i + 1,
    name: u.name,
    events: u.events,
  }))

  const funnelSteps = data ? [
    { label: 'Registrados', value: data.funnel.registered, total: data.funnel.registered },
    { label: 'Primera Ronda', value: data.funnel.firstRound, total: data.funnel.registered },
    { label: 'Tarjeta Historica', value: data.funnel.historicalCard, total: data.funnel.registered },
    { label: 'tAIger', value: data.funnel.taiger, total: data.funnel.registered },
    { label: 'Pro', value: data.funnel.pro, total: data.funnel.registered },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Growth Metrics */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>Growth Metrics</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <AdminCard
            icon="👥"
            label="Total Users"
            value={data?.growth.total ?? 0}
            loading={loading}
          />
          <AdminCard
            icon="📈"
            label="New 7d"
            value={data?.growth.new7d ?? 0}
            loading={loading}
            delta={data ? { value: data.growth.new7d, label: 'ultimos 7d' } : undefined}
          />
          <AdminCard
            icon="📊"
            label="New 30d"
            value={data?.growth.new30d ?? 0}
            loading={loading}
            delta={data ? { value: data.growth.new30d, label: 'ultimos 30d' } : undefined}
          />
          <AdminCard
            icon="📉"
            label="New 90d"
            value={data?.growth.new90d ?? 0}
            loading={loading}
            delta={data ? { value: data.growth.new90d, label: 'ultimos 90d' } : undefined}
          />
        </div>
      </section>

      {/* New Users by Day */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>New Users by Day</h2>
        <AdminChart
          type="bar"
          data={data?.growth.byDay ?? []}
          xAxisKey="date"
          dataKeys={[{ key: 'count', color: adminColors.gold, name: 'Nuevos usuarios' }]}
          emptyMessage="Sin datos de crecimiento"
        />
      </section>

      {/* Activation Funnel + Top Users */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>Activation Funnel + Top Users</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ ...adminCard }}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '16px' }}>FUNNEL DE ACTIVACION</span>
            {data ? (
              <FunnelChart steps={funnelSteps} />
            ) : (
              <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>Cargando...</span>
            )}
          </div>
          <AdminTable<{ rank: number; name: string; events: number }>
            columns={[
              { key: 'rank', label: '#', width: '50px' },
              { key: 'name', label: 'Nombre' },
              { key: 'events', label: 'Eventos (30d)', width: '120px' },
            ]}
            data={topUsersRows}
            loading={loading}
            pageSize={10}
          />
        </div>
      </section>

      {/* Engagement */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>Engagement</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <AdminCard
            icon="🏌️"
            label="Avg Rounds/User"
            value={data?.engagement.avgRoundsPerUser ?? 0}
            loading={loading}
          />
          <AdminCard
            icon="🎯"
            label="Total Rounds Played"
            value={data?.engagement.totalRoundsPlayed ?? 0}
            loading={loading}
          />
        </div>
      </section>
    </div>
  )
}
