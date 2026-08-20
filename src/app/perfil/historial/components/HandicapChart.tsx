'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface ChartPoint {
  date: string
  diferencial: number
}

export default function HandicapChart({ data }: { data: ChartPoint[] }) {
  return (
    <div style={{ height: '180px', background: 'var(--bg-surface)', borderRadius: '12px', padding: '12px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" fontSize={10} stroke="var(--text-3)" />
          <YAxis fontSize={10} stroke="var(--text-3)" domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
            labelStyle={{ color: 'var(--text-2)' }}
          />
          <Line type="monotone" dataKey="diferencial" stroke="var(--brand)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
