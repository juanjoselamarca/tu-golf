'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface OverviewData {
  users: { total: number; new7d: number; new30d: number }
  tournaments: { total: number; last30d: number }
  rounds: { total: number; freeRoundsTotal: number; freeRounds7d: number }
  historical: { total: number }
  taiger: { sessions: number; usersWithPatterns: number }
  proUsers: number
}

export default function CrecimientoPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/overview')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[#c4992a] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-[#7a8fa8]">
        Error al cargar datos de crecimiento
      </div>
    )
  }

  const totalUsers = data.users.total || 1
  const roundsUsers = data.rounds.total + data.rounds.freeRoundsTotal
  const funnelSteps = [
    { label: 'Registrado', count: data.users.total, pct: 100 },
    {
      label: 'Primera ronda',
      count: roundsUsers,
      pct: Math.round((roundsUsers / totalUsers) * 100),
    },
    {
      label: 'Tarjeta histórica',
      count: data.historical.total,
      pct: Math.round((data.historical.total / totalUsers) * 100),
    },
    {
      label: 'tAIger',
      count: data.taiger.sessions,
      pct: Math.round((data.taiger.sessions / totalUsers) * 100),
    },
    {
      label: 'Pro',
      count: data.proUsers,
      pct: Math.round((data.proUsers / totalUsers) * 100),
    },
  ]

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl text-[#edeae4]">Crecimiento</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Nuevos usuarios 7d" value={data.users.new7d} />
        <KPICard label="Nuevos usuarios 30d" value={data.users.new30d} />
        <KPICard label="Activation rate" value="0%" placeholder />
        <KPICard label="DAU / MAU" value="0%" placeholder />
      </div>

      {/* Funnel */}
      <div className="rounded-xl border border-[#132540] bg-[#0a1628] p-6 space-y-5">
        <h2 className="font-display text-lg text-[#edeae4]">Funnel de activación</h2>
        <div className="space-y-4">
          {funnelSteps.map((step) => (
            <div key={step.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#edeae4]">{step.label}</span>
                <span className="text-[#7a8fa8]">
                  {step.count} — {step.pct}%
                  {step.label === 'Pro' && (
                    <span className="ml-2 inline-block rounded-full bg-[#132540] px-2 py-0.5 text-[10px] text-[#c4992a]">
                      Próximamente
                    </span>
                  )}
                </span>
              </div>
              <div className="h-5 w-full rounded-full bg-[#050b14]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(step.pct, 0)}%`,
                    background: 'linear-gradient(90deg, #c4992a 0%, #e8c547 100%)',
                    minWidth: step.pct > 0 ? '12px' : '0',
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="rounded-xl border border-[#132540] bg-[#0a1628] p-6">
        <h2 className="font-display text-lg text-[#edeae4] mb-4">Gráfico de crecimiento</h2>
        <div
          className="flex items-center justify-center rounded-lg border-2 border-dashed border-[#132540]"
          style={{ height: 250 }}
        >
          <p className="text-sm text-[#7a8fa8] text-center px-4">
            Disponible cuando haya suficientes datos
          </p>
        </div>
      </div>
    </div>
  )
}

function KPICard({
  label,
  value,
  placeholder,
}: {
  label: string
  value: number | string
  placeholder?: boolean
}) {
  return (
    <div className="rounded-xl border border-[#132540] bg-[#0a1628] p-5">
      <p className="text-xs text-[#7a8fa8] uppercase tracking-wide">{label}</p>
      <p
        className="font-display mt-1"
        style={{ fontSize: '2.5rem', lineHeight: 1.1, color: placeholder ? '#7a8fa8' : '#c4992a' }}
      >
        {value}
      </p>
    </div>
  )
}
