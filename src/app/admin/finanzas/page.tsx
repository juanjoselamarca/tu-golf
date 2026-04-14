'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminCard } from '@/components/admin/AdminCard'
import { ProjectionSlider } from '@/components/admin/ProjectionSlider'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'
import { DollarSign, ChevronUp, Users, Wrench } from '@/components/icons'

interface CostEntry {
  plan: string
  cost: number
  usage: string
  limit: string
}

interface FinanceData {
  totalUsers: number
  proUsers: number
  mrr: number
  arr: number
  costs: Record<string, CostEntry>
  dbStats: Record<string, number>
}

export default function FinanzasPage() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/finance')
      if (res.ok) setData(await res.json())
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const monthlyCost = data
    ? Object.values(data.costs).reduce((sum, c) => sum + c.cost, 0)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Refresh button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            background: adminColors.card, border: `1px solid ${adminColors.border}`,
            borderRadius: '8px', padding: '8px 16px', color: adminColors.gold,
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s',
          }}
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Overview KPIs */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>Overview</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <AdminCard icon={<DollarSign size={20} />} label="MRR" value={`$${data?.mrr ?? 0}`} loading={loading} />
          <AdminCard icon={<ChevronUp size={20} />} label="ARR" value={`$${data?.arr ?? 0}`} loading={loading} />
          <AdminCard icon={<Users size={20} />} label="Total Users" value={data?.totalUsers ?? 0} loading={loading} />
          <AdminCard icon={<Wrench size={20} />} label="Monthly Costs" value={`$${monthlyCost.toFixed(2)}`} loading={loading} />
        </div>
      </section>

      {/* Costs Table + Projection Slider */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Costs Table */}
          <div style={{ ...adminCard }}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '16px' }}>COSTOS POR SERVICIO</span>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 90px 1fr 1fr', gap: '8px',
              padding: '8px 0', borderBottom: `1px solid ${adminColors.border}`,
            }}>
              {['Service', 'Plan', 'Cost/mes', 'Uso', 'Límite'].map(h => (
                <span key={h} style={{ ...adminFonts.label, fontSize: '10px' }}>{h}</span>
              ))}
            </div>
            {/* Rows */}
            {data ? Object.entries(data.costs).map(([service, info]) => (
              <div
                key={service}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 90px 1fr 1fr', gap: '8px',
                  padding: '10px 0', borderBottom: `1px solid ${adminColors.border}`,
                  alignItems: 'center',
                }}
              >
                <span style={{ ...adminFonts.body, fontSize: '13px', textTransform: 'capitalize' }}>{service}</span>
                <span style={{ ...adminFonts.mono, fontSize: '11px' }}>{info.plan}</span>
                <span style={{
                  ...adminFonts.mono, fontSize: '12px',
                  color: info.cost > 0 ? adminColors.yellow : adminColors.green,
                }}>
                  ${info.cost.toFixed(2)}
                </span>
                <span style={{ ...adminFonts.mono, fontSize: '11px' }}>{info.usage}</span>
                <span style={{ ...adminFonts.mono, fontSize: '11px' }}>{info.limit}</span>
              </div>
            )) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: adminColors.grayDim, fontSize: '13px' }}>
                Cargando...
              </div>
            )}
          </div>

          {/* Projection Slider */}
          <ProjectionSlider totalUsers={data?.totalUsers ?? 0} />
        </div>
      </section>

      {/* Database Stats */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>Database Stats</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '16px',
        }}>
          {data ? Object.entries(data.dbStats).map(([table, count]) => (
            <AdminCard
              key={table}
              label={table.replace(/_/g, ' ')}
              value={count}
            />
          )) : (
            Array.from({ length: 7 }).map((_, i) => (
              <AdminCard key={i} label="..." value={0} loading />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
