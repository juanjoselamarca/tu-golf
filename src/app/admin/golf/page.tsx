'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface OverviewData {
  users: { total: number; new7d: number; new30d: number }
  tournaments: { total: number; last30d: number }
  rounds: { total: number; freeRoundsTotal: number; freeRounds7d: number }
  historical: { total: number }
  taiger: { sessions: number; usersWithPatterns: number }
  proUsers: number
}

const handicapRanges = [
  { range: 'Scratch', key: 'scratch', count: 0 },
  { range: '1-5', key: '1-5', count: 0 },
  { range: '6-10', key: '6-10', count: 0 },
  { range: '11-15', key: '11-15', count: 0 },
  { range: '16-20', key: '16-20', count: 0 },
  { range: '21-25', key: '21-25', count: 0 },
  { range: '26+', key: '26+', count: 0 },
]

export default function GolfPage() {
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
      <div className="text-center py-20 text-[#94a8c0]">
        Error al cargar datos de golf
      </div>
    )
  }

  const avgHistoricalPerUser =
    data.users.total > 0
      ? (data.historical.total / data.users.total).toFixed(1)
      : '0'

  return (
    <div className="space-y-10">
      <h1 className="font-display text-2xl text-[#edeae4]">Métricas de Golf</h1>

      {/* Torneos */}
      <Section title="Torneos">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard label="Total torneos" value={data.tournaments.total} />
          <KPICard label="Torneos últimos 30d" value={data.tournaments.last30d} />
          <KPICard label="Formato más popular" value="—" placeholder />
        </div>
      </Section>

      {/* Rondas Libres */}
      <Section title="Rondas Libres">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KPICard label="Total rondas libres" value={data.rounds.freeRoundsTotal} />
          <KPICard label="Rondas últimos 7d" value={data.rounds.freeRounds7d} />
        </div>
      </Section>

      {/* Tarjetas Históricas */}
      <Section title="Tarjetas Históricas">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KPICard label="Total tarjetas" value={data.historical.total} />
          <KPICard label="Promedio por usuario" value={avgHistoricalPerUser} />
        </div>
      </Section>

      {/* Distribución de Índices */}
      <Section title="Distribución de Índices">
        <div className="rounded-xl border border-[#132540] bg-[#0a1628] p-6">
          <div
            className="flex items-center justify-center rounded-lg border-2 border-dashed border-[#132540]"
            style={{ height: 250 }}
          >
            <p className="text-sm text-[#94a8c0] text-center px-4">
              Distribución de handicaps — se mostrará cuando haya suficientes usuarios con índice registrado
            </p>
          </div>

          {/* Pre-built chart structure (hidden until data available) */}
          <div className="hidden">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={handicapRanges}>
                <CartesianGrid strokeDasharray="3 3" stroke="#132540" />
                <XAxis dataKey="range" tick={{ fill: '#94a8c0', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a8c0', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a1628',
                    border: '1px solid #132540',
                    borderRadius: 8,
                    color: '#edeae4',
                  }}
                />
                <Bar dataKey="count" fill="#c4992a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {handicapRanges.map((r) => (
              <span
                key={r.key}
                className="inline-block rounded-full border border-[#132540] bg-[#050b14] px-3 py-1 text-xs text-[#94a8c0]"
              >
                {r.range}
              </span>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg text-[#edeae4] border-b border-[#132540] pb-2">
        {title}
      </h2>
      {children}
    </section>
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
      <p className="text-xs text-[#94a8c0] uppercase tracking-wide" style={{ fontSize: 12 }}>
        {label}
      </p>
      <p
        className="font-display mt-1"
        style={{ fontSize: '2.5rem', lineHeight: 1.1, color: placeholder ? '#94a8c0' : '#c4992a' }}
      >
        {value}
      </p>
    </div>
  )
}
