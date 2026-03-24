'use client'
import dynamic from 'next/dynamic'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false })
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false })
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface DataKey {
  key: string
  color: string
  name: string
}

interface AdminChartProps {
  title?: string
  data: Record<string, unknown>[]
  dataKeys: DataKey[]
  xAxisKey: string
  height?: number
  type?: 'area' | 'bar'
  emptyMessage?: string
}

export function AdminChart({
  title, data, dataKeys, xAxisKey, height = 280, type = 'area', emptyMessage = 'Sin datos',
}: AdminChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ ...adminCard, height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {title && <span style={{ ...adminFonts.label, marginBottom: '12px' }}>{title}</span>}
        <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>{emptyMessage}</span>
      </div>
    )
  }

  const tooltipStyle = {
    background: adminColors.card, border: `1px solid ${adminColors.border}`,
    borderRadius: '8px', color: adminColors.ivory, fontSize: '12px',
  }

  const Chart = type === 'bar' ? BarChart : AreaChart

  return (
    <div style={{ ...adminCard, padding: '16px' }}>
      {title && <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>{title}</span>}
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data}>
          <XAxis dataKey={xAxisKey} stroke={adminColors.grayDim} tick={{ fontSize: 10, fill: adminColors.gray }} />
          <YAxis stroke={adminColors.grayDim} tick={{ fontSize: 10, fill: adminColors.gray }} width={35} />
          <Tooltip contentStyle={tooltipStyle} />
          {dataKeys.map(dk =>
            type === 'bar' ? (
              <Bar key={dk.key} dataKey={dk.key} fill={dk.color} name={dk.name} radius={[4, 4, 0, 0]} />
            ) : (
              <Area key={dk.key} type="monotone" dataKey={dk.key} stroke={dk.color}
                fill={dk.color} fillOpacity={0.1} strokeWidth={2} name={dk.name} />
            )
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}
